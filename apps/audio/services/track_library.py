from typing import Optional
from lib.supabase_client import supabase

# Camelot wheel mapping — kept in sync with packages/ac-ami/src/dj/camelotWheel.ts

KEY_TO_CAMELOT = {
    "Am": "8A",   "Em": "9A",   "Bm": "10A",
    "F#m": "11A", "C#m": "12A", "G#m": "1A",
    "Abm": "1A",  "Ebm": "2A",  "D#m": "2A",
    "Bbm": "3A",  "A#m": "3A",  "Fm": "4A",
    "Cm": "5A",   "Gm": "6A",   "Dm": "7A",
    "C": "8B",    "G": "9B",    "D": "10B",
    "A": "11B",   "E": "12B",   "B": "1B",
    "Gb": "2B",   "F#": "2B",   "Db": "3B",
    "C#": "3B",   "Ab": "4B",   "G#": "4B",
    "Eb": "5B",   "D#": "5B",   "Bb": "6B",
    "A#": "6B",   "F": "7B",
}


def index_track(
    track_id: str,
    audio_file_id: str,
    bpm: float,
    key: str,
    mode: str,
    subgenre: str,
    energy_mean: float,
    energy_peak: float,
    onset_density: float,
    duration_sec: float,
    title: Optional[str] = None,
) -> dict:
    """Add or update a track in the track library."""
    camelot_code = KEY_TO_CAMELOT.get(key)

    record = {
        "track_id": track_id,
        "audio_file_id": audio_file_id,
        "bpm": round(bpm, 2),
        "key": key,
        "mode": mode,
        "camelot_code": camelot_code,
        "subgenre": subgenre,
        "energy_mean": round(energy_mean, 3),
        "energy_peak": round(energy_peak, 3),
        "onset_density": round(onset_density, 3),
        "duration_sec": round(duration_sec, 2),
        "title": title,
    }

    result = supabase.table("track_library").insert(record).execute()
    return {
        "status": "complete",
        "library_id": result.data[0]["id"] if result.data else None,
        "camelot_code": camelot_code,
    }


def query_compatible_tracks(
    key: str,
    bpm: float,
    bpm_tolerance: float = 5.0,
    limit: int = 20,
) -> list:
    """Find tracks that mix harmonically with the given key/BPM."""
    camelot = KEY_TO_CAMELOT.get(key)
    if not camelot:
        return []

    compatible_codes = _get_compatible_camelot_codes(camelot)
    bpm_low  = bpm - bpm_tolerance
    bpm_high = bpm + bpm_tolerance

    result = supabase.table("track_library") \
        .select("*") \
        .in_("camelot_code", compatible_codes) \
        .gte("bpm", bpm_low) \
        .lte("bpm", bpm_high) \
        .limit(limit) \
        .execute()

    return result.data or []


def _get_compatible_camelot_codes(code: str) -> list:
    """Get all Camelot codes compatible with the input."""
    num = int(code[:-1])
    letter = code[-1]
    compatible = [
        code,
        f"{num}{'B' if letter == 'A' else 'A'}",
        f"{((num - 2) % 12) + 1}{letter}",
        f"{(num % 12) + 1}{letter}",
    ]
    return [c for c in compatible if 1 <= int(c[:-1]) <= 12]
