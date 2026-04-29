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


def analyze_source(
    audio_file_id: str,
    track_id: str,
) -> dict:
    """
    Deep analysis of source audio for Amapianorize pipeline.
    Returns a SourceProfile dict.
    """
    if not LIBROSA_AVAILABLE:
        return {"status": "error", "error": "librosa not installed"}

    # ─── 1. Download source audio ─────────────────────
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
    duration_sec = len(y) / sr

    # ─── 2. BPM + beat grid ───────────────────────────
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(tempo) if np.isscalar(tempo) else float(tempo[0])
    beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()

    # ─── 3. Key + mode ────────────────────────────────
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = np.mean(chroma, axis=1)
    from services.analyzer import _detect_key
    key, key_confidence, mode = _detect_key(chroma_mean)

    # ─── 4. Spectral character ────────────────────────
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    spectral_centroid_mean = float(np.mean(centroid))

    rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
    spectral_rolloff_mean = float(np.mean(rolloff))

    flatness = librosa.feature.spectral_flatness(y=y)[0]
    spectral_flatness_mean = float(np.mean(flatness))

    # ─── 5. Rhythmic character ────────────────────────
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    onset_mean = float(np.mean(onset_env))
    onset_std  = float(np.std(onset_env))

    tempogram = librosa.feature.tempogram(onset_envelope=onset_env, sr=sr)
    rhythm_strength = float(np.mean(np.max(tempogram, axis=0)))

    # ─── 6. Low-end character ─────────────────────────
    log_drum_band = _measure_frequency_band(y, sr, 60, 300)
    sub_bass_band  = _measure_frequency_band(y, sr, 20, 60)
    mid_band       = _measure_frequency_band(y, sr, 300, 3000)
    high_band      = _measure_frequency_band(y, sr, 3000, 20000)
    total_energy   = log_drum_band + sub_bass_band + mid_band + high_band

    low_mid_ratio  = log_drum_band / max(total_energy, 1e-10)
    bass_ratio     = sub_bass_band  / max(total_energy, 1e-10)

    # ─── 7. Classify source character ─────────────────
    character = _classify_source_character(
        bpm, spectral_centroid_mean, low_mid_ratio,
        rhythm_strength, spectral_flatness_mean
    )

    # ─── 8. Amapiano transformation difficulty ────────
    difficulty = _estimate_amapiano_difficulty(bpm, character, rhythm_strength)

    profile = {
        "status": "complete",
        "audio_file_id": audio_file_id,
        "track_id": track_id,
        # Timing
        "bpm": round(bpm, 2),
        "beat_count": len(beat_frames),
        "duration_sec": round(duration_sec, 2),
        # Tonality
        "key": key,
        "mode": mode,
        "key_confidence": round(key_confidence, 3),
        # Spectral
        "spectral_centroid_hz": round(spectral_centroid_mean, 1),
        "spectral_rolloff_hz": round(spectral_rolloff_mean, 1),
        "spectral_flatness": round(spectral_flatness_mean, 4),
        # Rhythmic
        "onset_strength_mean": round(onset_mean, 3),
        "onset_strength_std": round(onset_std, 3),
        "rhythm_strength": round(rhythm_strength, 3),
        # Frequency bands
        "low_mid_ratio": round(low_mid_ratio, 3),
        "bass_ratio": round(bass_ratio, 3),
        # Classification
        "source_character": character,
        "amapiano_difficulty": difficulty,
        # Target subgenre recommendation
        "recommended_subgenre": _recommend_subgenre(bpm, character, mode),
    }

    return profile


def _measure_frequency_band(
    y: np.ndarray, sr: int, low_hz: float, high_hz: float
) -> float:
    """Measure RMS energy in a frequency band."""
    fft = np.abs(np.fft.rfft(y))
    freqs = np.fft.rfftfreq(len(y), d=1.0 / sr)
    mask = (freqs >= low_hz) & (freqs <= high_hz)
    return float(np.sqrt(np.mean(fft[mask] ** 2))) if mask.any() else 0.0


def _classify_source_character(
    bpm: float,
    spectral_centroid: float,
    low_mid_ratio: float,
    rhythm_strength: float,
    flatness: float,
) -> str:
    """
    Classify the source audio character.
    Returns one of: amapiano_adjacent, deep_house, electronic,
                    rnb_soul, afrobeats, hip_hop, jazz, other
    """
    if 104 <= bpm <= 116 and low_mid_ratio > 0.15:
        return "amapiano_adjacent"

    if 120 <= bpm <= 135 and low_mid_ratio > 0.12 and flatness < 0.01:
        return "deep_house"

    if spectral_centroid > 3000 and rhythm_strength > 0.6 and flatness > 0.05:
        return "electronic"

    if 70 <= bpm <= 100 and spectral_centroid < 2500:
        return "rnb_soul"

    if 100 <= bpm <= 115 and low_mid_ratio < 0.12:
        return "afrobeats"

    if 80 <= bpm <= 105:
        return "hip_hop"

    return "other"


def _estimate_amapiano_difficulty(
    bpm: float, character: str, rhythm_strength: float
) -> str:
    """
    How difficult to Amapianorize?
    Returns: easy | moderate | hard | very_hard
    """
    if character == "amapiano_adjacent":
        return "easy"

    bpm_distance = min(abs(bpm - 110), abs(bpm - 55), abs(bpm - 220))

    if character in ("deep_house", "afrobeats") and bpm_distance < 20:
        return "moderate"

    if character in ("rnb_soul", "hip_hop") and bpm_distance < 30:
        return "moderate"

    if bpm_distance < 15:
        return "moderate"

    if bpm_distance < 30:
        return "hard"

    return "very_hard"


def _recommend_subgenre(bpm: float, character: str, mode: str) -> str:
    """
    Recommend the best Amapiano subgenre for this source.
    """
    if character == "amapiano_adjacent":
        return "private_school" if mode == "minor" else "hybrid_rnb_amapiano"
    if character in ("deep_house",):
        return "private_school"
    if character in ("rnb_soul",):
        return "hybrid_rnb_amapiano"
    if character in ("electronic", "afrobeats"):
        return "bacardi"
    if character in ("hip_hop",):
        return "sgija"
    return "mbiraiano"
