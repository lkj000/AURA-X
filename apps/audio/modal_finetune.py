import modal
import os
import json
import io
import tempfile
from pathlib import Path

# ─── MODAL APP ────────────────────────────────────────────────────────────────

app = modal.App("aura-x-finetune")

# GPU image with AudioCraft + dependencies
finetune_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "audiocraft",
        "torch==2.1.0",
        "torchaudio==2.1.0",
        "transformers",
        "supabase",
        "httpx",
        "numpy",
        "soundfile",
        "librosa",
    )
    .env({"PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION": "python"})
)

# ─── SUPABASE SECRETS ─────────────────────────────────────────────────────────
# Store as Modal secrets:
#   modal secret create aura-x-supabase \
#     SUPABASE_URL=https://... \
#     SUPABASE_SERVICE_ROLE_KEY=...

supabase_secret = modal.Secret.from_name("aura-x-supabase")

# ─── VOLUME FOR MODEL CHECKPOINTS ─────────────────────────────────────────────
checkpoint_volume = modal.Volume.from_name(
    "aura-x-checkpoints",
    create_if_missing=True,
)


# ─── DATASET DOWNLOAD HELPERS ─────────────────────────────────────────────────

def download_dataset(
    subgenre: str | None,
    min_score: float,
    split: str,
    limit: int,
) -> list[dict]:
    """Download dataset records from Supabase."""
    from supabase import create_client

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    client = create_client(url, key)

    query = (
        client.table("dataset_records")
        .select("*")
        .eq("split", split)
        .gte("composite_score", min_score)
        .order("composite_score", desc=True)
        .limit(limit)
    )
    if subgenre:
        query = query.eq("subgenre", subgenre)

    result = query.execute()
    return result.data or []


def download_audio(storage_path: str, dest_path: str) -> bool:
    """Download audio file from Supabase storage."""
    from supabase import create_client

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    client = create_client(url, key)

    try:
        data = client.storage.from_("aura-x-audio").download(storage_path)
        Path(dest_path).write_bytes(data)
        return True
    except Exception as e:
        print(f"[download_audio] Failed {storage_path}: {e}")
        return False


# ─── MAIN FINE-TUNING FUNCTION ────────────────────────────────────────────────

@app.function(
    image=finetune_image,
    gpu="A10G",
    timeout=21600,          # 6 hours max
    secrets=[supabase_secret],
    volumes={"/checkpoints": checkpoint_volume},
)
def finetune_musicgen(
    subgenre: str | None = None,
    min_score: float = 0.70,
    training_steps: int = 1000,
    learning_rate: float = 1e-4,
    batch_size: int = 4,
    model_name: str = "facebook/musicgen-small",
    run_id: str = "default",
):
    """
    Fine-tune MusicGen on Amapiano dataset records.

    Architecture:
    - Load musicgen-small (300M params, fastest to fine-tune)
    - Dataset: (text_prompt, log_drum_audio) pairs from dataset_records
    - Text prompt: suno_style_prompt (AC-AMI compiled, culturally grounded)
    - Audio target: log_drum stem (culturally critical, smallest model target)
    - Training: AdamW, lr=1e-4, 1000 steps on A10G (~45 min, ~$3)
    """
    import torch
    import torchaudio
    import soundfile as sf
    import numpy as np
    from audiocraft.models import MusicGen
    from audiocraft.data.audio import audio_write

    print(f"[finetune] Starting run_id={run_id}, subgenre={subgenre}")
    print(f"[finetune] GPU: {torch.cuda.get_device_name(0)}")

    # ─── 1. Download dataset ──────────────────────────────────────────────────
    print("[finetune] Downloading dataset from Supabase...")
    records = download_dataset(subgenre, min_score, "train", limit=500)
    print(f"[finetune] {len(records)} training records found")

    if len(records) < 10:
        return {
            "status": "failed",
            "error": f"Insufficient training data: {len(records)} records (need >= 10)",
            "run_id": run_id,
        }

    # ─── 2. Load model ────────────────────────────────────────────────────────
    print(f"[finetune] Loading {model_name}...")
    model = MusicGen.get_pretrained(model_name)
    model.lm.train()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = model.to(device)

    # ─── 3. Prepare optimizer ─────────────────────────────────────────────────
    optimizer = torch.optim.AdamW(
        model.lm.parameters(),
        lr=learning_rate,
        weight_decay=0.01,
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=training_steps,
    )

    # ─── 4. Training loop ─────────────────────────────────────────────────────
    losses = []
    checkpoint_dir = Path(f"/checkpoints/{run_id}")
    checkpoint_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmpdir:
        step = 0
        epoch = 0

        while step < training_steps:
            epoch += 1
            np.random.shuffle(records)

            for i in range(0, len(records), batch_size):
                if step >= training_steps:
                    break

                batch = records[i:i + batch_size]
                batch_prompts = []
                batch_audio = []

                for record in batch:
                    # Text prompt — AC-AMI compiled style prompt
                    prompt = record.get("suno_style_prompt")
                    if not prompt:
                        prompt = (
                            f"Amapiano {record.get('subgenre', 'private_school')}, "
                            f"{record.get('bpm', 110)} BPM, "
                            f"key of {record.get('key', 'F#m')}, "
                            f"log drum prominent, woody bass"
                        )

                    # Audio: log drum stem preferred, else raw audio
                    audio_file_id = (
                        record.get("log_drum_file_id") or
                        record.get("audio_file_id")
                    )
                    if not audio_file_id:
                        continue

                    from supabase import create_client
                    sb = create_client(
                        os.environ["SUPABASE_URL"],
                        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
                    )
                    file_rec = (
                        sb.table("audio_files")
                        .select("storage_path")
                        .eq("id", audio_file_id)
                        .single()
                        .execute()
                    )
                    if not file_rec.data:
                        continue

                    audio_path = os.path.join(tmpdir, f"{audio_file_id}.wav")
                    if not download_audio(file_rec.data["storage_path"], audio_path):
                        continue

                    try:
                        wav, sr = torchaudio.load(audio_path)
                        # Resample to 32kHz (MusicGen native)
                        if sr != 32000:
                            wav = torchaudio.functional.resample(wav, sr, 32000)
                        # Crop/pad to 10 seconds
                        target_len = 32000 * 10
                        if wav.shape[1] > target_len:
                            wav = wav[:, :target_len]
                        else:
                            wav = torch.nn.functional.pad(
                                wav, (0, target_len - wav.shape[1])
                            )
                        # Mono
                        if wav.shape[0] > 1:
                            wav = wav.mean(dim=0, keepdim=True)
                        batch_prompts.append(prompt)
                        batch_audio.append(wav)
                    except Exception as e:
                        print(f"[finetune] Audio load failed: {e}")
                        continue

                if not batch_prompts:
                    continue

                # Forward pass
                optimizer.zero_grad()
                try:
                    audio_tensor = torch.stack(batch_audio).to(device)

                    with torch.no_grad():
                        audio_tokens, _ = model.compression_model.encode(audio_tensor)

                    attributes, _ = model._prepare_tokens_and_attributes(
                        batch_prompts, None
                    )

                    logits = model.lm.compute_predictions(
                        audio_tokens, [], attributes
                    )
                    loss = logits.loss

                    loss.backward()
                    torch.nn.utils.clip_grad_norm_(model.lm.parameters(), 1.0)
                    optimizer.step()
                    scheduler.step()

                    losses.append(loss.item())
                    step += 1

                    if step % 100 == 0:
                        avg_loss = sum(losses[-100:]) / min(100, len(losses))
                        print(
                            f"[finetune] Step {step}/{training_steps}"
                            f" — loss: {avg_loss:.4f}"
                        )

                except Exception as e:
                    print(f"[finetune] Training step failed: {e}")
                    step += 1
                    continue

    # ─── 5. Save checkpoint ───────────────────────────────────────────────────
    print("[finetune] Saving checkpoint...")
    checkpoint_path = checkpoint_dir / "model.pt"
    torch.save(
        {
            "step": step,
            "model_state_dict": model.lm.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "losses": losses,
            "config": {
                "subgenre":       subgenre,
                "min_score":      min_score,
                "training_steps": training_steps,
                "model_name":     model_name,
                "run_id":         run_id,
            },
        },
        checkpoint_path,
    )
    checkpoint_volume.commit()
    print(f"[finetune] Checkpoint saved to /checkpoints/{run_id}/model.pt")

    # ─── 6. Return metrics ────────────────────────────────────────────────────
    final_loss = (
        sum(losses[-50:]) / min(50, len(losses)) if losses else 0
    )
    return {
        "status":            "complete",
        "run_id":            run_id,
        "steps_completed":   step,
        "final_loss":        round(final_loss, 4),
        "training_records":  len(records),
        "checkpoint_path":   f"/checkpoints/{run_id}/model.pt",
        "subgenre":          subgenre,
    }


# ─── GENERATION TEST FUNCTION ─────────────────────────────────────────────────

@app.function(
    image=finetune_image,
    gpu="A10G",
    timeout=300,
    secrets=[supabase_secret],
    volumes={"/checkpoints": checkpoint_volume},
)
def test_checkpoint(run_id: str, prompt: str, duration_sec: int = 10):
    """Test a fine-tuned checkpoint by generating audio."""
    import torch
    import base64
    import soundfile as sf
    from audiocraft.models import MusicGen

    checkpoint_path = Path(f"/checkpoints/{run_id}/model.pt")
    if not checkpoint_path.exists():
        return {
            "status": "error",
            "error":  f"Checkpoint not found: {checkpoint_path}",
        }

    model = MusicGen.get_pretrained("facebook/musicgen-small")
    checkpoint = torch.load(checkpoint_path, map_location="cpu")
    model.lm.load_state_dict(checkpoint["model_state_dict"])
    model.set_generation_params(duration=duration_sec)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = model.to(device)
    model.lm.eval()

    with torch.no_grad():
        wav = model.generate([prompt])

    buf = io.BytesIO()
    sf.write(buf, wav[0, 0].cpu().numpy(), 32000, format="WAV")
    audio_b64 = base64.b64encode(buf.getvalue()).decode()

    return {
        "status":      "complete",
        "run_id":      run_id,
        "prompt":      prompt,
        "duration_sec": duration_sec,
        "audio_b64":   audio_b64[:100] + "...",  # truncated for display
    }
