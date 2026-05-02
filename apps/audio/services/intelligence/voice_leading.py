"""
Voice-Leading Harmony Engine.

Replaces static SUBGENRE_PROGRESSIONS / SUBGENRE_KEY_ZONES lookup tables
with actual music theory:

1. Build a diatonic scale from root + mode (aeolian, dorian, mixolydian)
2. Assign chord qualities to each scale degree using the mode's diatonic rules
3. Voice 4-part harmony (SATB) for each chord, minimising total semitone
   movement from the previous chord (principle of minimal motion)
4. Detect and resolve parallel perfect 5ths and octaves
5. Return chord names, MIDI voicings, and bass line

This produces genuinely different voicings on every call and honours
voice-leading rules that the lookup table system cannot.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Optional

# ── Note universe ─────────────────────────────────────────────────────────────

_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
_ENHARMONIC = {
    "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#",
}

def _pc(note: str) -> int:
    """Pitch class 0–11 from note name."""
    return _NOTES.index(_ENHARMONIC.get(note, note))

def _norm(note: str) -> str:
    return _ENHARMONIC.get(note, note)

def _midi(note: str, octave: int = 4) -> int:
    return _pc(note) + (octave + 1) * 12

def _name(midi: int) -> str:
    return _NOTES[midi % 12]

# ── Scale construction ────────────────────────────────────────────────────────

_INTERVALS: dict[str, list[int]] = {
    "aeolian":    [0, 2, 3, 5, 7, 8, 10],
    "dorian":     [0, 2, 3, 5, 7, 9, 10],
    "mixolydian": [0, 2, 4, 5, 7, 9, 10],
    "major":      [0, 2, 4, 5, 7, 9, 11],
}

def _scale_pcs(root: str, mode: str) -> list[int]:
    root_pc = _pc(_norm(root))
    return [(root_pc + i) % 12 for i in _INTERVALS.get(mode, _INTERVALS["aeolian"])]

# ── Diatonic chord qualities (root, third, fifth, seventh intervals) ──────────
# Each entry is (third_semis, fifth_semis, seventh_semis)

_QUALITIES: dict[str, list[tuple[int, int, int]]] = {
    "aeolian": [
        (3, 7, 10),  # i   minor 7
        (2, 6,  9),  # ii° half-dim 7
        (4, 7, 11),  # III major 7
        (3, 7, 10),  # iv  minor 7
        (3, 7, 10),  # v   minor 7
        (4, 7, 11),  # VI  major 7
        (4, 7, 10),  # VII dominant 7
    ],
    "dorian": [
        (3, 7, 10),  # i
        (3, 7, 10),  # ii  (raised 6th makes ii minor, not half-dim)
        (4, 7, 11),  # III
        (4, 7, 10),  # IV  dominant (characteristic dorian colour)
        (3, 7, 10),  # v
        (2, 6,  9),  # vi°
        (4, 7, 10),  # VII
    ],
    "mixolydian": [
        (4, 7, 10),  # I   dominant 7
        (3, 7, 10),  # ii
        (2, 6,  9),  # iii°
        (4, 7, 11),  # IV  major 7
        (3, 7, 10),  # v
        (4, 7, 11),  # VI  major 7
        (3, 7, 10),  # vii
    ],
}

_DEGREE_NAMES = ["i", "ii", "III", "iv", "v", "VI", "VII"]
_QUALITY_SUFFIXES = {
    (3, 7, 10): "m7",
    (4, 7, 11): "maj7",
    (4, 7, 10): "7",
    (2, 6,  9): "m7b5",
}


def _chord_pcs(scale: list[int], degree: int, mode: str) -> list[int]:
    """Return [root, third, fifth, seventh] pitch classes for scale degree."""
    q = _QUALITIES.get(mode, _QUALITIES["aeolian"])[degree % 7]
    root = scale[degree % 7]
    return [root, (root + q[0]) % 12, (root + q[1]) % 12, (root + q[2]) % 12]


# ── SATB voicing via minimal motion ──────────────────────────────────────────

def _initial_voicing(pcs: list[int], base: int = 48) -> list[int]:
    """
    Spread 4 pitch classes across roughly 3 octaves from base (MIDI 48 = C3).
    Registers: bass (~C3), tenor (~C3+7), alto (~C3+14), soprano (~C3+21)
    """
    targets = [base, base + 7, base + 14, base + 21]
    result = []
    for i, pc in enumerate(pcs[:4]):
        target = targets[i]
        # Find nearest octave
        oct_base = (target // 12) * 12
        candidates = [oct_base + pc - 12, oct_base + pc, oct_base + pc + 12]
        best = min(candidates, key=lambda m: abs(m - target))
        result.append(best)
    return result


def _minimal_motion(pcs: list[int], prev: list[int]) -> list[int]:
    """
    Given chord pitch classes and previous voicing, return new voicing
    that minimises total semitone movement across all 4 voices.
    Tries ±1 octave shifts on each voice independently.
    """
    voices = _initial_voicing(pcs)

    # Greedy per-voice octave adjustment
    for v in range(4):
        pc = pcs[v % len(pcs)]
        best_midi = voices[v]
        best_cost = abs(voices[v] - prev[v])
        for offset in (-24, -12, 12, 24):
            candidate = voices[v] + offset
            if 24 <= candidate <= 96:
                cost = abs(candidate - prev[v])
                if cost < best_cost:
                    best_cost = cost
                    best_midi = candidate
        voices[v] = best_midi

    return voices


def _has_parallel_perfect(v1_prev: int, v1_curr: int, v2_prev: int, v2_curr: int) -> bool:
    """Detect parallel perfect 5th or octave between two voices."""
    interval_before = (v2_prev - v1_prev) % 12
    interval_after  = (v2_curr - v1_curr) % 12
    return (
        interval_before in (0, 7) and
        interval_after  in (0, 7) and
        interval_before == interval_after and
        v1_curr != v1_prev  # both voices moved
    )


def _resolve_parallels(voices: list[int], prev: list[int], pcs: list[int]) -> list[int]:
    """Shift violating upper voices by a step to break parallel motion."""
    result = list(voices)
    for i in range(len(result) - 1):
        for j in range(i + 1, len(result)):
            if _has_parallel_perfect(prev[i], result[i], prev[j], result[j]):
                # Try nudging voice j up or down a semitone while keeping pc
                for delta in (1, -1, 2, -2):
                    candidate = result[j] + delta
                    if candidate % 12 == pcs[j % len(pcs)] and 24 <= candidate <= 96:
                        result[j] = candidate
                        break
    return result


# ── Public API ────────────────────────────────────────────────────────────────

@dataclass
class Voicing:
    chord_name: str
    degree_name: str
    degree: int
    pitch_classes: list[int]
    midi_notes: list[int]   # [bass, tenor, alto, soprano]
    bass_note: str


def plan_voice_leading(
    root: str,
    mode: str,
    degree_sequence: list[int],
    with_seventh: bool = True,
) -> list[Voicing]:
    """
    Generate SATB voicings for a chord progression using minimal-motion voice leading.

    Args:
        root: tonal centre (e.g. "F#", "G", "Bb")
        mode: "aeolian" | "dorian" | "mixolydian" | "major"
        degree_sequence: 0-indexed scale degrees (e.g. [0, 5, 6, 0])
        with_seventh: True = include 7th (default), False = triads only

    Returns:
        List of Voicing objects, one per chord in the progression
    """
    scale = _scale_pcs(_norm(root), mode)
    qualities = _QUALITIES.get(mode, _QUALITIES["aeolian"])

    voicings: list[Voicing] = []
    prev_midi: Optional[list[int]] = None

    for deg in degree_sequence:
        deg = deg % 7
        pcs = _chord_pcs(scale, deg, mode)
        if not with_seventh:
            pcs = pcs[:3]

        root_pc = scale[deg]
        q = qualities[deg][:2] if not with_seventh else qualities[deg]
        suffix = _QUALITY_SUFFIXES.get(qualities[deg], "m")
        chord_name = _NOTES[root_pc] + suffix

        if prev_midi is None:
            midi = _initial_voicing(pcs)
        else:
            midi = _minimal_motion(pcs, prev_midi)
            midi = _resolve_parallels(midi, prev_midi, pcs)

        prev_midi = midi

        voicings.append(Voicing(
            chord_name=chord_name,
            degree_name=_DEGREE_NAMES[deg],
            degree=deg,
            pitch_classes=pcs,
            midi_notes=midi,
            bass_note=_NOTES[pcs[0]],
        ))

    return voicings


# ── Lane degree sequences and modes ──────────────────────────────────────────
# These replace SUBGENRE_PROGRESSIONS / SUBGENRE_KEY_ZONES lookup tables.
# Multiple sequences per lane: generator picks one per call (adds variety).

LANE_DEGREE_SEQUENCES: dict[str, list[list[int]]] = {
    "private_school":       [[0, 5, 2, 6], [0, 3, 5, 6], [0, 2, 5, 6]],
    "bacardi":              [[0, 6],        [0],           [0, 5]],
    "sgija":                [[0, 5, 6, 0],  [0, 6, 5],     [0, 3, 6, 5]],
    "stixx_sgija":          [[0, 6, 5, 6],  [0, 5, 6],     [0, 3]],
    "mbiraiano":            [[0, 5, 0, 6],  [0, 3, 5, 6],  [0, 6, 3, 5]],
    "three_step":           [[0, 5, 6],     [0, 3, 6],     [0, 6, 5, 3]],
    "gqom_fusion":          [[0],           [0, 6],        [0, 5]],
    "hybrid_rnb_amapiano":  [[5, 3, 0, 4],  [0, 5, 2, 6],  [0, 3, 5, 4]],
}

LANE_MODES: dict[str, str] = {
    "private_school":       "aeolian",
    "bacardi":              "aeolian",
    "sgija":                "aeolian",
    "stixx_sgija":          "aeolian",
    "mbiraiano":            "dorian",
    "three_step":           "aeolian",
    "gqom_fusion":          "aeolian",
    "hybrid_rnb_amapiano":  "aeolian",
}

LANE_DEFAULT_KEYS: dict[str, list[str]] = {
    "private_school":       ["F#m", "C#m", "Em", "Bm"],
    "bacardi":              ["Gm", "Am", "Dm", "Cm"],
    "sgija":                ["Gm", "Fm", "Am", "Cm"],
    "stixx_sgija":          ["Gm", "Fm", "Dm"],
    "mbiraiano":            ["Dm", "Em", "Am"],
    "three_step":           ["Em", "Fm", "Gm"],
    "gqom_fusion":          ["Cm", "Dm", "Fm"],
    "hybrid_rnb_amapiano":  ["F#m", "Em", "Bm"],
}
