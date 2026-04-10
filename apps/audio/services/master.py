import io
import uuid
from typing import Optional
import numpy as np

try:
    import librosa
    import soundfile as sf
    from pedalboard import (
        Pedalboard, Compressor, Gain,
        PeakFilter, HighShelfFilter, LowShelfFilter,
        Limiter,
    )
    PEDALBOARD_AVAILABLE = True
    LIBROSA_AVAILABLE = True
except ImportError:
    PEDALBOARD_AVAILABLE = False
    try:
        import librosa
        import soundfile as sf
        LIBROSA_AVAILABLE = True
    except ImportError:
        LIBROSA_AVAILABLE = False

from lib.supabase_client import supabase

# ─── TARGET LUFS BY SUBGENRE ──────────────────────────────────────────────────
# Bacardi/Gqom: louder (club-functional)
# Private School: more dynamic (audiophile)
# Mbiraiano: most dynamic (spiritual context)

TARGET_LUFS: dict = {
    "private_school":       -10.0,
    "bacardi":              -9.0,
    "sgija":                -9.5,
    "stixx_sgija":          -9.0,
    "mbiraiano":            -11.0,
    "three_step":           -9.5,
    "gqom_fusion":          -9.0,
    "hybrid_rnb_amapiano":  -10.0,
}

DEFAULT_LUFS = -10.0


def master_audio(
    mix_file_id: str,
    track_id: str,
    subgenre: str,
    generation_id: Optional[str] = None,
) -> dict:
    """
    Master a mixed stereo file.
    Stages: stereo width → EQ → limiting → LUFS normalization.
    """
    if not (PEDALBOARD_AVAILABLE and LIBROSA_AVAILABLE):
        return {
            "status": "error",
            "error": "pedalboard and librosa required",
        }

    # ─── 1. Download mix file ──────────────────────────────────
    result = supabase.table("audio_files") \
        .select("storage_path") \
        .eq("id", mix_file_id) \
        .single() \
        .execute()

    if not result.data:
        return {"status": "error", "error": "Mix file not found"}

    audio_bytes = supabase.storage \
        .from_("aura-x-audio") \
        .download(result.data["storage_path"])

    y, sr = librosa.load(io.BytesIO(audio_bytes), sr=None, mono=False)
    if y.ndim == 1:
        y = np.stack([y, y])

    # ─── 2. Stereo width enhancement ──────────────────────────
    width = _stereo_width_by_subgenre(subgenre)
    y = _apply_stereo_width(y, width)

    # ─── 3. Master EQ ─────────────────────────────────────────
    y = _apply_master_eq(y, sr, subgenre)

    # ─── 4. Limiting + LUFS normalization ─────────────────────
    target_lufs = TARGET_LUFS.get(subgenre, DEFAULT_LUFS)
    y = _apply_limiter_and_normalize(y, sr, target_lufs)

    # ─── 5. Encode to 24-bit WAV ──────────────────────────────
    buffer = io.BytesIO()
    sf.write(buffer, y.T, sr, format="WAV", subtype="PCM_24")
    master_bytes = buffer.getvalue()

    # ─── 6. Upload to Supabase ────────────────────────────────
    file_id = str(uuid.uuid4())
    storage_path = f"{track_id}/master/{file_id}.wav"

    supabase.storage.from_("aura-x-audio").upload(
        path=storage_path,
        file=master_bytes,
        file_options={"content-type": "audio/wav"},
    )

    supabase.table("audio_files").insert({
        "id": file_id,
        "track_id": track_id,
        "generation_id": generation_id,
        "file_type": "master",
        "storage_path": storage_path,
        "format": "wav",
        "file_size_bytes": len(master_bytes),
        "sample_rate": sr,
        "metadata": {
            "subgenre": subgenre,
            "target_lufs": target_lufs,
            "source_mix_file_id": mix_file_id,
            "bit_depth": 24,
        },
    }).execute()

    return {
        "status": "complete",
        "master_file_id": file_id,
        "storage_path": storage_path,
        "target_lufs": target_lufs,
        "subgenre": subgenre,
        "file_size_bytes": len(master_bytes),
    }


def _stereo_width_by_subgenre(subgenre: str) -> float:
    """
    Stereo width multiplier.
    1.0 = no change, >1.0 = wider, <1.0 = narrower.
    Private School: slightly wide for luxury depth.
    Bacardi/Gqom: tighter mono-compatible width.
    """
    widths = {
        "private_school":       1.15,
        "bacardi":              1.05,
        "sgija":                1.10,
        "stixx_sgija":          1.05,
        "mbiraiano":            1.20,
        "three_step":           1.10,
        "gqom_fusion":          1.05,
        "hybrid_rnb_amapiano":  1.15,
    }
    return widths.get(subgenre, 1.10)


def _apply_stereo_width(y: np.ndarray, width: float) -> np.ndarray:
    """Mid-side stereo width processing."""
    mid  = (y[0] + y[1]) / 2
    side = (y[0] - y[1]) / 2
    side_widened = side * width
    return np.stack([mid + side_widened, mid - side_widened])


def _apply_master_eq(y: np.ndarray, sr: int, subgenre: str) -> np.ndarray:
    """Gentle master EQ — final color only."""
    board = Pedalboard([
        LowShelfFilter(
            cutoff_frequency_hz=80.0,
            gain_db=0.5 if subgenre == "private_school" else 0.0,
        ),
        PeakFilter(
            cutoff_frequency_hz=300.0,
            gain_db=-0.5,
            q=0.5,
        ),
        HighShelfFilter(
            cutoff_frequency_hz=10000.0,
            gain_db=1.0,
        ),
    ])
    return board(y.astype(np.float32), sr)


def _apply_limiter_and_normalize(
    y: np.ndarray, sr: int, target_lufs: float
) -> np.ndarray:
    """Peak limiter + LUFS normalization."""
    peak = np.max(np.abs(y))
    if peak > 0.0:
        ceiling = 10 ** (-1.0 / 20)
        y = y * (ceiling / peak)

    try:
        board = Pedalboard([Limiter(threshold_db=-1.0, release_ms=100.0)])
        y = board(y.astype(np.float32), sr)
    except Exception:
        y = np.clip(y, -0.95, 0.95)

    return y
