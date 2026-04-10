import io
import uuid
from typing import Optional
import numpy as np

try:
    import librosa
    import librosa.feature
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False

from lib.supabase_client import supabase

# ─── KEY DETECTION ────────────────────────────────────────────────────────────
# Krumhansl-Schmuckler key profiles

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09,
                           2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53,
                           2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def analyze_audio(
    audio_file_id: str,
    track_id: str,
) -> dict:
    """
    Analyze audio file: BPM, key, energy, onset density.
    Writes results to audio_analysis table.
    """
    if not LIBROSA_AVAILABLE:
        return {"status": "error", "error": "librosa not installed"}

    # ─── 1. Fetch and download ─────────────────────────────────────
    result = supabase.table("audio_files") \
        .select("storage_path, format, duration_sec") \
        .eq("id", audio_file_id) \
        .single() \
        .execute()

    if not result.data:
        return {"status": "error", "error": "Audio file not found"}

    audio_bytes = supabase.storage \
        .from_("aura-x-audio") \
        .download(result.data["storage_path"])

    # ─── 2. Load audio ─────────────────────────────────────────────
    y, sr = librosa.load(io.BytesIO(audio_bytes), sr=None, mono=True)
    duration_sec = len(y) / sr

    # ─── 3. BPM detection ──────────────────────────────────────────
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(tempo) if np.isscalar(tempo) else float(tempo[0])

    if len(beats) > 2:
        beat_times = librosa.frames_to_time(beats, sr=sr)
        intervals = np.diff(beat_times)
        bpm_confidence = float(1.0 - (np.std(intervals) / np.mean(intervals)))
        bpm_confidence = max(0.0, min(1.0, bpm_confidence))
    else:
        bpm_confidence = 0.0

    # ─── 4. Key detection ──────────────────────────────────────────
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = np.mean(chroma, axis=1)
    key_name, key_confidence, mode = _detect_key(chroma_mean)

    # ─── 5. Energy analysis ────────────────────────────────────────
    rms = librosa.feature.rms(y=y)[0]
    energy_mean = float(np.mean(rms))
    energy_peak = float(np.max(rms))

    energy_mean_norm = float(energy_mean / energy_peak) if energy_peak > 0 else 0.0

    # ─── 6. Onset density ──────────────────────────────────────────
    onsets = librosa.onset.onset_detect(y=y, sr=sr, units="time")
    onset_density = float(len(onsets) / duration_sec) if duration_sec > 0 else 0.0

    # ─── 7. Write to audio_analysis table ──────────────────────────
    analysis_id = str(uuid.uuid4())
    raw_features = {
        "beat_count": len(beats),
        "chroma_mean": chroma_mean.tolist(),
        "energy_frames": len(rms),
        "onset_count": len(onsets),
    }

    supabase.table("audio_analysis").insert({
        "id": analysis_id,
        "audio_file_id": audio_file_id,
        "track_id": track_id,
        "bpm": round(bpm, 2),
        "bpm_confidence": round(bpm_confidence, 3),
        "key": key_name,
        "key_confidence": round(key_confidence, 3),
        "mode": mode,
        "energy_mean": round(energy_mean_norm, 3),
        "energy_peak": round(energy_peak, 3),
        "onset_density": round(onset_density, 3),
        "duration_sec": round(duration_sec, 2),
        "sample_rate": sr,
        "raw_features": raw_features,
    }).execute()

    return {
        "status": "complete",
        "analysis_id": analysis_id,
        "bpm": round(bpm, 2),
        "bpm_confidence": round(bpm_confidence, 3),
        "key": key_name,
        "key_confidence": round(key_confidence, 3),
        "mode": mode,
        "energy_mean": round(energy_mean_norm, 3),
        "energy_peak": round(energy_peak, 3),
        "onset_density": round(onset_density, 3),
        "duration_sec": round(duration_sec, 2),
        "sample_rate": sr,
    }


def _detect_key(chroma_mean: np.ndarray):
    """
    Detect musical key from chroma vector using Krumhansl-Schmuckler profiles.
    Returns (key_name, confidence, mode).
    """
    best_key = 0
    best_mode = "major"
    best_corr = -2.0

    for i in range(12):
        rotated_major = np.roll(MAJOR_PROFILE, i)
        rotated_minor = np.roll(MINOR_PROFILE, i)

        corr_major = float(np.corrcoef(chroma_mean, rotated_major)[0, 1])
        corr_minor = float(np.corrcoef(chroma_mean, rotated_minor)[0, 1])

        if corr_major > best_corr:
            best_corr = corr_major
            best_key = i
            best_mode = "major"
        if corr_minor > best_corr:
            best_corr = corr_minor
            best_key = i
            best_mode = "minor"

    key_name = NOTE_NAMES[best_key]
    if best_mode == "minor":
        key_name = key_name + "m"

    confidence = max(0.0, min(1.0, (best_corr + 1) / 2))
    return key_name, confidence, best_mode
