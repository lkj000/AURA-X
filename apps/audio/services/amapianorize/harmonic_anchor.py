import io
import uuid
from typing import Optional
import numpy as np

try:
    import librosa
    import soundfile as sf
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False

from lib.supabase_client import supabase


def extract_harmonic_anchor(
    vocals_stem_file_id: Optional[str],
    other_stem_file_id: Optional[str],
    track_id: str,
    generation_id: Optional[str] = None,
) -> dict:
    """
    Extract harmonic anchor from vocals + other (pads/keys) stems.
    The harmonic anchor is what makes the source recognizable
    after rhythm transplant.

    Strategy:
    1. Load vocals + other stems
    2. Apply harmonic separation (librosa.effects.harmonic)
    3. Suppress percussive content in the stems
    4. Blend into a single harmonic anchor track
    5. Normalize to be layerable
    """
    if not LIBROSA_AVAILABLE:
        return {"status": "error", "error": "librosa not installed"}

    combined = None
    sr = None

    for file_id, stem_label in [
        (vocals_stem_file_id, "vocals"),
        (other_stem_file_id, "other"),
    ]:
        if not file_id:
            continue

        result = supabase.table("audio_files") \
            .select("storage_path") \
            .eq("id", file_id) \
            .single() \
            .execute()
        if not result.data:
            continue

        audio_bytes = supabase.storage \
            .from_("aura-x-audio") \
            .download(result.data["storage_path"])

        y, stem_sr = librosa.load(io.BytesIO(audio_bytes), sr=None, mono=True)
        sr = stem_sr

        # Extract harmonic component (suppress percussion)
        y_harmonic = librosa.effects.harmonic(y, margin=3.0)

        if combined is None:
            combined = y_harmonic
        else:
            min_len = min(len(combined), len(y_harmonic))
            combined = combined[:min_len] + y_harmonic[:min_len]

    if combined is None or sr is None:
        return {"status": "error", "error": "No stems could be loaded"}

    # Normalize to -6 dBFS (leave headroom for layering)
    peak = np.max(np.abs(combined))
    if peak > 0:
        target = 10 ** (-6 / 20)  # -6 dBFS
        combined = combined * (target / peak)

    # Convert to stereo
    y_stereo = np.stack([combined, combined])

    # Encode and upload
    buffer = io.BytesIO()
    sf.write(buffer, y_stereo.T, sr, format="WAV", subtype="PCM_16")
    anchor_bytes = buffer.getvalue()

    file_id = str(uuid.uuid4())
    storage_path = f"{track_id}/harmonic_anchor/{file_id}.wav"

    supabase.storage.from_("aura-x-audio").upload(
        path=storage_path,
        file=anchor_bytes,
        file_options={"content-type": "audio/wav"}
    )

    supabase.table("audio_files").insert({
        "id": file_id,
        "track_id": track_id,
        "generation_id": generation_id,
        "file_type": "harmonic_anchor",
        "storage_path": storage_path,
        "format": "wav",
        "file_size_bytes": len(anchor_bytes),
        "sample_rate": sr,
        "metadata": {
            "stems_used": ["vocals", "other"],
            "margin": 3.0,
            "normalized_to_dbfs": -6,
        }
    }).execute()

    return {
        "status": "complete",
        "anchor_file_id": file_id,
        "storage_path": storage_path,
    }
