import io
import uuid
from typing import Optional

# librosa import — graceful degradation if not installed
try:
    import librosa
    import soundfile as sf
    import numpy as np
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False

from lib.supabase_client import supabase

LOG_DRUM_FREQ_LOW = 60    # Hz — bottom of log drum range
LOG_DRUM_FREQ_HIGH = 300  # Hz — top of log drum range
LOG_DRUM_DECAY_MS = 80    # ms — keep audio within this window after each onset


def extract_log_drum(
    audio_bytes: bytes,
    track_id: str,
    source_audio_file_id: str,
    generation_id: Optional[str] = None,
    content_type: str = "audio/wav",
) -> dict:
    """
    Extract log drum events from audio using spectral bandpass + onset gating.
    Returns dict with log drum audio_file_id.
    """
    if not LIBROSA_AVAILABLE:
        return {
            "status": "error",
            "error": "librosa not installed — run: pip install librosa soundfile",
            "log_drum_file_id": None,
        }

    # ─── 1. Load audio ────────────────────────────────────
    audio_buffer = io.BytesIO(audio_bytes)
    y, sr = librosa.load(audio_buffer, sr=None, mono=True)

    # ─── 2. Bandpass filter (60–300 Hz) ──────────────────
    y_filtered = _bandpass_filter(y, sr, LOG_DRUM_FREQ_LOW, LOG_DRUM_FREQ_HIGH)

    # ─── 3. Onset detection on filtered signal ────────────
    onset_frames = librosa.onset.onset_detect(y=y_filtered, sr=sr, units="samples")

    # ─── 4. Gate: keep only audio near onsets ─────────────
    y_gated = _gate_by_onsets(y_filtered, onset_frames, sr, LOG_DRUM_DECAY_MS)

    # ─── 5. Encode to WAV bytes ───────────────────────────
    out_buffer = io.BytesIO()
    sf.write(out_buffer, y_gated, sr, format="WAV", subtype="PCM_16")
    stem_bytes = out_buffer.getvalue()

    # ─── 6. Upload to Supabase storage ───────────────────
    file_id = str(uuid.uuid4())
    storage_path = f"{track_id}/stem_log_drum/{file_id}.wav"

    supabase.storage.from_("aura-x-audio").upload(
        path=storage_path,
        file=stem_bytes,
        file_options={"content-type": "audio/wav"},
    )

    # ─── 7. Write audio_files record ─────────────────────
    record = {
        "id": file_id,
        "track_id": track_id,
        "generation_id": generation_id,
        "file_type": "stem_log_drum",
        "storage_path": storage_path,
        "format": "wav",
        "file_size_bytes": len(stem_bytes),
        "sample_rate": sr,
        "metadata": {
            "freq_low_hz": LOG_DRUM_FREQ_LOW,
            "freq_high_hz": LOG_DRUM_FREQ_HIGH,
            "onset_count": int(len(onset_frames)),
            "model": "spectral_bandpass_onset_gate",
            "source_audio_file_id": source_audio_file_id,
        },
    }
    supabase.table("audio_files").insert(record).execute()

    return {
        "status": "complete",
        "track_id": track_id,
        "log_drum_file_id": file_id,
        "onset_count": int(len(onset_frames)),
        "freq_range_hz": [LOG_DRUM_FREQ_LOW, LOG_DRUM_FREQ_HIGH],
        "model": "spectral_bandpass_onset_gate",
        "sample_rate": sr,
    }


def _bandpass_filter(y: "np.ndarray", sr: int, low_hz: float, high_hz: float) -> "np.ndarray":
    """FFT-based bandpass: zero out bins outside [low_hz, high_hz]."""
    fft = np.fft.rfft(y)
    freqs = np.fft.rfftfreq(len(y), d=1.0 / sr)
    mask = (freqs >= low_hz) & (freqs <= high_hz)
    fft_filtered = fft * mask
    return np.fft.irfft(fft_filtered, n=len(y))


def _gate_by_onsets(
    y: "np.ndarray",
    onset_samples: "np.ndarray",
    sr: int,
    decay_ms: float,
) -> "np.ndarray":
    """Zero out audio except within decay_ms after each onset."""
    decay_samples = int((decay_ms / 1000.0) * sr)
    gate = np.zeros(len(y), dtype=bool)
    for onset in onset_samples:
        start = int(onset)
        end = min(start + decay_samples, len(y))
        gate[start:end] = True
    return y * gate.astype(y.dtype)
