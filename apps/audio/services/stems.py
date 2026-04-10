import os
import tempfile
import uuid
from pathlib import Path
from typing import Optional

# Demucs import — graceful degradation if not installed
try:
    import torch
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    import torchaudio
    DEMUCS_AVAILABLE = True
except ImportError:
    DEMUCS_AVAILABLE = False

from lib.supabase_client import supabase

STEM_NAMES = ["drums", "bass", "vocals", "other"]
MODEL_NAME = "htdemucs"  # Best general-purpose Demucs model


def separate_stems(
    audio_bytes: bytes,
    track_id: str,
    generation_id: Optional[str],
    source_audio_file_id: str,
    content_type: str = "audio/wav",
) -> dict:
    """
    Separate audio into stems using Demucs.
    Returns dict with stem audio_file_ids.
    """
    if not DEMUCS_AVAILABLE:
        return {
            "status": "error",
            "error": "Demucs not installed — run: pip install demucs torch torchaudio",
            "stems": {}
        }

    with tempfile.TemporaryDirectory() as tmpdir:
        # ─── 1. Write input audio to temp file ────────
        ext = _ext_for_content_type(content_type)
        input_path = Path(tmpdir) / f"input{ext}"
        input_path.write_bytes(audio_bytes)

        # ─── 2. Load audio ─────────────────────────────
        wav, sample_rate = torchaudio.load(str(input_path))
        # Demucs expects (batch, channels, samples)
        if wav.dim() == 1:
            wav = wav.unsqueeze(0)  # mono → (1, samples)
        wav = wav.unsqueeze(0)      # add batch dim → (1, channels, samples)

        # ─── 3. Load model ─────────────────────────────
        model = get_model(MODEL_NAME)
        model.eval()

        # ─── 4. Apply model ────────────────────────────
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = model.to(device)
        wav = wav.to(device)

        with torch.no_grad():
            sources = apply_model(model, wav, device=device)
        # sources shape: (1, num_sources, channels, samples)
        sources = sources.squeeze(0)  # → (num_sources, channels, samples)

        # ─── 5. Save + upload each stem ────────────────
        stem_results = {}
        model_sources = model.sources  # ["drums", "bass", "vocals", "other"]

        for i, stem_name in enumerate(model_sources):
            stem_wav = sources[i]  # (channels, samples)
            stem_path = Path(tmpdir) / f"{stem_name}.wav"
            torchaudio.save(str(stem_path), stem_wav.cpu(), sample_rate)

            stem_bytes = stem_path.read_bytes()
            file_id = str(uuid.uuid4())
            storage_path = f"{track_id}/stem_{stem_name}/{file_id}.wav"

            # Upload to Supabase storage
            supabase.storage.from_("aura-x-audio").upload(
                path=storage_path,
                file=stem_bytes,
                file_options={"content-type": "audio/wav"}
            )

            # Write audio_files record
            record = {
                "id": file_id,
                "track_id": track_id,
                "generation_id": generation_id,
                "file_type": f"stem_{stem_name}",
                "storage_path": storage_path,
                "format": "wav",
                "file_size_bytes": len(stem_bytes),
                "sample_rate": sample_rate,
                "metadata": {
                    "stem": stem_name,
                    "model": MODEL_NAME,
                    "source_audio_file_id": source_audio_file_id,
                }
            }
            supabase.table("audio_files").insert(record).execute()
            stem_results[stem_name] = file_id

        return {
            "status": "complete",
            "track_id": track_id,
            "stems": stem_results,
            "model": MODEL_NAME,
            "sample_rate": sample_rate,
        }


def _ext_for_content_type(ct: str) -> str:
    return {
        "audio/wav":  ".wav",
        "audio/mpeg": ".mp3",
        "audio/flac": ".flac",
    }.get(ct, ".wav")
