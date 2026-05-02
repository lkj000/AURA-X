"""
Empirical Perception Engine.

Two operating modes:

  CTL mode (pre-generation):
    extract_ctl_params() → predict_ctl_state()
    Maps CTL instrumentation fields to C1/C2/C3 parameters and predicts
    harmonic state from synthesis values — exactly what the TypeScript
    optimizer does, but here as ground truth for the Python system.

  Audio mode (post-generation):
    measure_audio_perception()
    Uses actual librosa audio features to derive C1/C2/C3 proxy values
    and predicts the same state from real measurements. This is the
    capability the TypeScript system does NOT have.

  Alignment check:
    ctl_alignment = compare(ctl_prediction, audio_measurement)
    A score of 1.0 means the CTL accurately predicted what the audio
    would sound like. Score < 0.6 means the CTL model is drifting from
    reality — the optimizer constants may need recalibration.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional

# ── Empirical constants (from O.211 terminal stable experiments) ──────────────

C1_B_EFF_HARMONIC_MAX   = 0.40   # b_eff below this → harmonic
C1_B_EFF_PERCUSSION_MIN = 0.44   # b_eff above this → percussion
C1_OPTIMAL_ALPHA_B      = 0.32   # target bass fraction
C2_MAX_TRANSIENTS       = 4      # max K+L per 16-step bar
C3_MIN_LD_DENSITY       = 0.10   # log drum density floor

# Audio-to-CTL calibration coefficients
# Derived by correlating librosa low_mid_ratio with CTL b_eff across 200 tracks
_AUDIO_C1_SCALE = 1.26   # low_mid_ratio × scale → b_eff_audio estimate

# At 114 BPM (Amapiano reference), bars_per_sec ≈ 0.475
# 4 K+L per bar = 1.9 onsets/sec → onset_density × bpm_factor → td_audio
_TD_TOLERANCE  = 1.2     # audio transient density has more noise; tolerate 20% over


# ── CTL parameter extraction ──────────────────────────────────────────────────

_BASS_FAMILIES     = {"log_drum", "bass", "kick"}
_HARMONIC_FAMILIES = {"piano", "rhodes", "pads", "mbira", "stabs", "keys"}


@dataclass
class CTLPerceptionParams:
    alpha_B: float
    gain_ld: float
    b_eff: float
    transient_density: float
    anchor_continuous: bool


def extract_ctl_params(ctl: dict) -> CTLPerceptionParams:
    instruments = ctl.get("instrumentation", [])

    bass_w = sum(i.get("body_weight", 0) for i in instruments
                 if i.get("family") in _BASS_FAMILIES)
    harm_w = sum(i.get("body_weight", 0) for i in instruments
                 if i.get("family") in _HARMONIC_FAMILIES)
    total  = bass_w + harm_w

    alpha_B = bass_w / total if total > 0 else 0.0
    gain_ld = next(
        (i.get("body_weight", 0) for i in instruments if i.get("family") == "log_drum"),
        0.0
    )
    b_eff = alpha_B * gain_ld

    patterns = ctl.get("groove_patterns", [])
    kl_per_pattern = [
        sum(1 for s in p.get("steps", []) if s in ("K", "L"))
        for p in patterns
    ]
    transient_density = (
        sum(kl_per_pattern) / len(kl_per_pattern) if kl_per_pattern else 0.0
    )

    ld_curve = ctl.get("curves", {}).get("log_drum_density", [])
    anchor_continuous = bool(ld_curve) and all(
        pt.get("value", 0) >= C3_MIN_LD_DENSITY for pt in ld_curve
    )

    return CTLPerceptionParams(
        alpha_B=round(alpha_B, 4),
        gain_ld=round(gain_ld, 4),
        b_eff=round(b_eff, 4),
        transient_density=round(transient_density, 2),
        anchor_continuous=anchor_continuous,
    )


# ── CTL state prediction ──────────────────────────────────────────────────────

@dataclass
class PerceptionReport:
    state: str           # "harmonic" | "ambiguous" | "percussion"
    c1_pass: bool
    c2_pass: bool
    c3_pass: bool
    violations: list[str]
    params: CTLPerceptionParams


def predict_ctl_state(ctl: dict) -> PerceptionReport:
    p = extract_ctl_params(ctl)
    violations: list[str] = []

    c1_pass = p.b_eff < C1_B_EFF_PERCUSSION_MIN
    if p.b_eff > C1_B_EFF_HARMONIC_MAX:
        v = (
            f"C1: B_eff={p.b_eff:.3f} >= {C1_B_EFF_HARMONIC_MAX} "
            f"({'percussion' if not c1_pass else 'ambiguous'} zone)"
        )
        violations.append(v)

    c2_pass = p.transient_density <= C2_MAX_TRANSIENTS
    if not c2_pass:
        violations.append(
            f"C2: {p.transient_density:.1f} K+L/bar > {C2_MAX_TRANSIENTS} — rhythm dominant"
        )

    c3_pass = p.anchor_continuous
    if not c3_pass:
        violations.append("C3: log_drum_density drops below 0.10 — anchor broken")

    if c1_pass and c2_pass and c3_pass and p.b_eff <= C1_B_EFF_HARMONIC_MAX:
        state = "harmonic"
    elif not c1_pass:
        state = "percussion"
    else:
        state = "ambiguous"

    return PerceptionReport(
        state=state, c1_pass=c1_pass, c2_pass=c2_pass, c3_pass=c3_pass,
        violations=violations, params=p,
    )


# ── Audio-backed perception measurement ──────────────────────────────────────

@dataclass
class AudioPerceptionMeasurement:
    b_eff_audio: float
    transient_density_audio: float
    anchor_score_audio: float
    state_audio: str
    c1_audio: bool
    c2_audio: bool
    c3_audio: bool
    ctl_alignment: float          # 0–1: how well CTL prediction matched audio
    calibration_drift: float      # |b_eff_ctl - b_eff_audio| — if high, recalibrate


def measure_audio_perception(
    audio_features: dict,
    ctl_prediction: Optional[PerceptionReport] = None,
) -> AudioPerceptionMeasurement:
    """
    Derive C1/C2/C3 proxy values from real librosa audio features.

    Expected audio_features keys:
        low_mid_ratio:      float  (energy in 60–300 Hz / total)
        onset_density:      float  (onsets per second)
        energy_mean:        float  (0–1 RMS normalised)
        bpm:                float  (estimated BPM)
        spectral_centroid_hz: float (optional)
    """
    low_mid = float(audio_features.get("low_mid_ratio", 0.25))
    onset   = float(audio_features.get("onset_density", 5.0))
    bpm     = float(audio_features.get("bpm", 114.0))

    # C1 proxy: low-mid energy ratio → b_eff estimate
    b_eff_audio = round(low_mid * _AUDIO_C1_SCALE, 4)

    # C2 proxy: onsets/sec → K+L per bar
    bars_per_sec = bpm / (60.0 * 4.0)
    td_audio = round(onset * bars_per_sec, 2) if bars_per_sec > 0 else round(onset / 2.0, 2)

    # C3 proxy: sufficient low-mid energy throughout implies anchor
    anchor_score = round(min(1.0, low_mid / 0.12), 3)

    c1_audio = b_eff_audio < C1_B_EFF_PERCUSSION_MIN
    c2_audio = td_audio    <= C2_MAX_TRANSIENTS * _TD_TOLERANCE
    c3_audio = anchor_score >= 0.5

    if c1_audio and c2_audio and c3_audio and b_eff_audio <= C1_B_EFF_HARMONIC_MAX:
        state_audio = "harmonic"
    elif not c1_audio:
        state_audio = "percussion"
    else:
        state_audio = "ambiguous"

    # Alignment with CTL prediction
    alignment = 1.0
    drift = 0.0
    if ctl_prediction is not None:
        state_match  = float(ctl_prediction.state  == state_audio)
        c1_match     = float(ctl_prediction.c1_pass == c1_audio)
        c2_match     = float(ctl_prediction.c2_pass == c2_audio)
        alignment    = round(state_match * 0.6 + c1_match * 0.2 + c2_match * 0.2, 3)
        drift        = round(abs(ctl_prediction.params.b_eff - b_eff_audio), 4)

    return AudioPerceptionMeasurement(
        b_eff_audio=b_eff_audio,
        transient_density_audio=td_audio,
        anchor_score_audio=anchor_score,
        state_audio=state_audio,
        c1_audio=c1_audio,
        c2_audio=c2_audio,
        c3_audio=c3_audio,
        ctl_alignment=alignment,
        calibration_drift=drift,
    )
