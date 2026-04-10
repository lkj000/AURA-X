import io
import uuid
from typing import Optional
import numpy as np

try:
    import librosa
    import soundfile as sf
    from pedalboard import (
        Pedalboard, Compressor,
        Gain, PeakFilter, HighShelfFilter, LowShelfFilter,
    )
    PEDALBOARD_AVAILABLE = True
except ImportError:
    PEDALBOARD_AVAILABLE = False

from lib.supabase_client import supabase
from services.mix_presets import get_mix_preset, ChannelStrip


def render_mix(
    stem_file_ids: dict,
    track_id: str,
    subgenre: str,
    generation_id: Optional[str] = None,
) -> dict:
    """
    Mix stems into a stereo master using pedalboard channel strips.
    stem_file_ids: {"drums": id, "bass": id, "vocals": id, "other": id, "log_drum"?: id}
    Returns dict with mix_file_id.
    """
    if not PEDALBOARD_AVAILABLE:
        return {
            "status": "error",
            "error": "pedalboard not installed — run: pip install pedalboard",
        }

    preset = get_mix_preset(subgenre)
    mixed = None
    sr = None

    for stem_name, file_id in stem_file_ids.items():
        if not file_id:
            continue

        # ─── Download stem ─────────────────────────────────────
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

        y, stem_sr = librosa.load(io.BytesIO(audio_bytes), sr=None, mono=False)
        if y.ndim == 1:
            y = np.stack([y, y])  # mono → stereo
        sr = stem_sr

        # ─── Apply channel strip ────────────────────────────────
        strip = preset.strips.get(stem_name)
        if strip:
            y = _apply_channel_strip(y, stem_sr, strip)

        # ─── Sum into mix bus ───────────────────────────────────
        if mixed is None:
            mixed = y.copy()
        else:
            min_len = min(mixed.shape[1], y.shape[1])
            mixed = mixed[:, :min_len] + y[:, :min_len]

    if mixed is None or sr is None:
        return {"status": "error", "error": "No stems to mix"}

    # ─── Normalize to prevent clipping ─────────────────────────
    peak = np.max(np.abs(mixed))
    if peak > 0.95:
        mixed = mixed * (0.95 / peak)

    # ─── Encode to WAV ──────────────────────────────────────────
    buffer = io.BytesIO()
    sf.write(buffer, mixed.T, sr, format="WAV", subtype="PCM_16")
    mix_bytes = buffer.getvalue()

    # ─── Upload to Supabase ─────────────────────────────────────
    file_id = str(uuid.uuid4())
    storage_path = f"{track_id}/mix/{file_id}.wav"

    supabase.storage.from_("aura-x-audio").upload(
        path=storage_path,
        file=mix_bytes,
        file_options={"content-type": "audio/wav"},
    )

    supabase.table("audio_files").insert({
        "id": file_id,
        "track_id": track_id,
        "generation_id": generation_id,
        "file_type": "mix",
        "storage_path": storage_path,
        "format": "wav",
        "file_size_bytes": len(mix_bytes),
        "sample_rate": sr,
        "metadata": {
            "subgenre": subgenre,
            "preset": preset.name,
            "stems_used": list(stem_file_ids.keys()),
        },
    }).execute()

    return {
        "status": "complete",
        "mix_file_id": file_id,
        "storage_path": storage_path,
        "subgenre": subgenre,
        "preset": preset.name,
        "file_size_bytes": len(mix_bytes),
    }


def _apply_channel_strip(
    y: "np.ndarray", sr: int, strip: ChannelStrip
) -> "np.ndarray":
    """Apply EQ + compression + gain using pedalboard."""
    board = Pedalboard([
        Gain(gain_db=strip.gain_db),
        LowShelfFilter(
            cutoff_frequency_hz=strip.low_shelf_hz,
            gain_db=strip.low_shelf_db,
        ),
        PeakFilter(
            cutoff_frequency_hz=strip.mid_peak_hz,
            gain_db=strip.mid_peak_db,
            q=strip.mid_peak_q,
        ),
        HighShelfFilter(
            cutoff_frequency_hz=strip.high_shelf_hz,
            gain_db=strip.high_shelf_db,
        ),
        Compressor(
            threshold_db=strip.comp_threshold_db,
            ratio=strip.comp_ratio,
            attack_ms=strip.comp_attack_ms,
            release_ms=strip.comp_release_ms,
        ),
        Gain(gain_db=strip.output_gain_db),
    ])
    # pedalboard expects (channels, samples) float32
    y32 = y.astype(np.float32)
    return board(y32, sr)
