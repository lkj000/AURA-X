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


# ─── AMAPIANO GROOVE TEMPLATES ────────────────────────────────────────────────
# Encoded as time offsets in units of (beat_duration / 16)
# These mirror the AC-AMI groove library patterns

GROOVE_TEMPLATES = {
    "private_school": {
        "swing": 0.54,
        "kick_positions":     [0, 8],
        "log_drum_positions": [4, 12],
        "shaker_positions":   [2, 6, 10, 14],
        "ghost_positions":    [7, 15],
    },
    "sgija": {
        "swing": 0.58,
        "kick_positions":     [0, 9],
        "log_drum_positions": [4, 11],
        "shaker_positions":   [2, 6, 10, 14],
        "ghost_positions":    [3, 7, 11, 15],
    },
    "bacardi": {
        "swing": 0.50,
        "kick_positions":     [0, 8],
        "log_drum_positions": [4, 12],
        "shaker_positions":   [2, 6, 10, 14],
        "ghost_positions":    [],
    },
    "stixx_sgija": {
        "swing": 0.60,
        "kick_positions":     [0, 8],
        "log_drum_positions": [4, 12],
        "shaker_positions":   [2, 4, 6, 10, 12, 14],
        "ghost_positions":    [1, 3, 5, 7, 9, 11, 13, 15],
    },
}

DEFAULT_GROOVE = "private_school"
DEFAULT_TARGET_BPM = 110.0


def transplant_rhythm(
    audio_file_id: str,
    track_id: str,
    target_subgenre: str = "private_school",
    target_bpm: Optional[float] = None,
    generation_id: Optional[str] = None,
) -> dict:
    """
    Transplant rhythm: replace source groove with Amapiano groove.

    Method: time-stretch audio to match target BPM,
    then apply Amapiano timing feel via groove template.
    """
    if not LIBROSA_AVAILABLE:
        return {"status": "error", "error": "librosa not installed"}

    # ─── 1. Fetch and load source ──────────────────────
    result = supabase.table("audio_files") \
        .select("storage_path, format") \
        .eq("id", audio_file_id) \
        .single() \
        .execute()

    if not result.data:
        return {"status": "error", "error": "Audio file not found"}

    audio_bytes = supabase.storage \
        .from_("aura-x-audio") \
        .download(result.data["storage_path"])

    y, sr = librosa.load(io.BytesIO(audio_bytes), sr=None, mono=True)

    # ─── 2. Detect source BPM ─────────────────────────
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    source_bpm = float(tempo) if np.isscalar(tempo) else float(tempo[0])

    # ─── 3. Set target BPM ────────────────────────────
    bpm_target = target_bpm or DEFAULT_TARGET_BPM
    bpm_target = _snap_to_amapiano_bpm(bpm_target)

    # ─── 4. Time-stretch to target BPM ────────────────
    if abs(source_bpm - bpm_target) > 0.5:
        stretch_ratio = bpm_target / source_bpm
        y_stretched = librosa.effects.time_stretch(y, rate=stretch_ratio)
    else:
        y_stretched = y

    # ─── 5. Apply groove feel ─────────────────────────
    groove = GROOVE_TEMPLATES.get(target_subgenre, GROOVE_TEMPLATES[DEFAULT_GROOVE])
    y_grooved = _apply_groove_feel(y_stretched, sr, bpm_target, groove)

    # ─── 6. Convert to stereo ─────────────────────────
    y_stereo = np.stack([y_grooved, y_grooved])

    # ─── 7. Encode and upload ─────────────────────────
    buffer = io.BytesIO()
    sf.write(buffer, y_stereo.T, sr, format="WAV", subtype="PCM_16")
    result_bytes = buffer.getvalue()

    file_id = str(uuid.uuid4())
    storage_path = f"{track_id}/groove_transplant/{file_id}.wav"

    supabase.storage.from_("aura-x-audio").upload(
        path=storage_path,
        file=result_bytes,
        file_options={"content-type": "audio/wav"}
    )

    supabase.table("audio_files").insert({
        "id": file_id,
        "track_id": track_id,
        "generation_id": generation_id,
        "file_type": "groove_transplant",
        "storage_path": storage_path,
        "format": "wav",
        "file_size_bytes": len(result_bytes),
        "sample_rate": sr,
        "metadata": {
            "source_bpm": round(source_bpm, 2),
            "target_bpm": bpm_target,
            "target_subgenre": target_subgenre,
            "groove_template": target_subgenre,
            "stretch_ratio": round(bpm_target / source_bpm, 4),
        }
    }).execute()

    return {
        "status": "complete",
        "transplant_file_id": file_id,
        "storage_path": storage_path,
        "source_bpm": round(source_bpm, 2),
        "target_bpm": bpm_target,
        "target_subgenre": target_subgenre,
    }


def _snap_to_amapiano_bpm(bpm: float):
    """Snap BPM to valid Amapiano range via halftime/doubletime search.
    Returns float if a path exists, None if the source is incompatible."""
    for factor in [1, 0.5, 2, 0.25, 4]:
        candidate = bpm * factor
        if 104 <= candidate <= 116:
            return round(candidate, 1)
    return None


def _apply_groove_feel(
    y: np.ndarray,
    sr: int,
    bpm: float,
    groove: dict,
) -> np.ndarray:
    """
    Apply Amapiano groove feel via micro-timing adjustments.
    Shifts audio samples at beat subdivisions according to
    swing in the groove template.
    """
    swing = groove.get("swing", 0.5)

    beat_samples = int((60.0 / bpm) * sr)
    sixteenth_samples = beat_samples // 4

    if swing == 0.5 or len(y) < sixteenth_samples * 2:
        return y

    swing_delay = int((swing - 0.5) * sixteenth_samples * 2)

    y_out = y.copy()
    pos = 0
    while pos + sixteenth_samples * 2 <= len(y):
        odd_start = pos + sixteenth_samples
        odd_end   = odd_start + sixteenth_samples

        if odd_start + swing_delay < len(y):
            shift = min(swing_delay, len(y) - odd_end)
            if shift > 0:
                y_out[odd_start + shift : odd_end + shift] = y[odd_start:odd_end]
                y_out[odd_start:odd_start + shift] = 0

        pos += sixteenth_samples * 2

    return y_out
