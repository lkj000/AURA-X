"""
Audio Perception — real signal C1/C2/C3 evaluation.

Operates on measured audio features (from dsp.py), not CTL field proxies.

C1 — Sub-bass energy gate:
    b_eff in [0.40, 0.44) → ambiguous
    b_eff >= 0.44         → percussion (log-drum dominant)
    b_eff < 0.40          → harmonic

C2 — Transient density:
    transients per bar > 4 → percussion pressure flag

C3 — Log drum anchor continuity:
    log drum onset fraction below threshold → ambiguous/harmonic
"""

from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import Optional
from .dsp import (
    BPMResult, BEffResult, LogDrumFingerprint, GrooveResult,
    estimate_bpm, compute_b_eff, fingerprint_log_drum, analyse_groove,
)
import numpy as np

# ── Thresholds ────────────────────────────────────────────────────────────────

C1_HARMONIC_MAX   = 0.40
C1_AMBIGUOUS_MAX  = 0.44
C2_MAX_TRANSIENTS = 4
C3_MIN_LD_DENSITY = 0.10   # log drum onsets / total onsets

STATE_HARMONIC   = "harmonic"
STATE_AMBIGUOUS  = "ambiguous"
STATE_PERCUSSION = "percussion"


# ── Public data classes ────────────────────────────────────────────────────────

@dataclass
class AudioFeatures:
    """All measured features for a single audio file."""
    bpm: float
    bpm_confidence: float
    key_root: str
    key_mode: str
    key_confidence: float
    b_eff: float
    low_energy_db: float
    transient_density: float     # estimated onsets per bar
    log_drum: Optional[LogDrumFingerprint]
    swing_ratio: float
    syncopation: float
    microtiming_std_ms: float
    tempo_stability: float
    duration_s: float


@dataclass
class PerceptionConstraint:
    name: str
    passed: bool
    value: float
    threshold: float
    detail: str


@dataclass
class AudioPerceptionReport:
    state: str                                      # harmonic | ambiguous | percussion
    converged: bool                                 # all C-gates passed
    constraints: list[PerceptionConstraint]
    violations: list[str]
    quality_score: float                            # 0–1 composite
    features: AudioFeatures
    ctl_alignment: Optional[float] = None          # set by compare_to_ctl()
    alignment_notes: list[str] = field(default_factory=list)


# ── Feature extraction ────────────────────────────────────────────────────────

def extract_features(audio: np.ndarray, sr: int = 44100) -> AudioFeatures:
    """
    Full feature extraction pipeline from raw audio samples.
    Calls all five dsp.py capabilities.
    """
    from .dsp import detect_key  # local import to avoid circular at module level
    duration_s = len(audio) / sr

    bpm_result  = estimate_bpm(audio, sr)
    key_result  = detect_key(audio, sr)
    b_eff_result = compute_b_eff(audio, sr)
    groove      = analyse_groove(audio, sr, bpm=bpm_result.bpm)
    ld_fp       = fingerprint_log_drum(audio, sr)

    # Transient density: onsets per bar
    # Approximate onset count from bpm × duration ÷ typical subdivision
    # (coarse estimate without full onset list for efficiency)
    estimated_bars = (duration_s / 60.0) * bpm_result.bpm / 4.0
    transient_density = (
        bpm_result.onset_count / max(estimated_bars, 1.0)
    )

    return AudioFeatures(
        bpm=bpm_result.bpm,
        bpm_confidence=bpm_result.confidence,
        key_root=key_result.root,
        key_mode=key_result.mode,
        key_confidence=key_result.correlation,
        b_eff=b_eff_result.b_eff,
        low_energy_db=b_eff_result.low_energy_db,
        transient_density=round(transient_density, 2),
        log_drum=ld_fp,
        swing_ratio=groove.swing_ratio,
        syncopation=groove.syncopation,
        microtiming_std_ms=groove.microtiming_std_ms,
        tempo_stability=groove.tempo_stability,
        duration_s=round(duration_s, 2),
    )


# ── C1/C2/C3 evaluation ───────────────────────────────────────────────────────

def evaluate_perception(features: AudioFeatures) -> AudioPerceptionReport:
    """
    Apply three constraints to measured audio features.
    Returns perception state + per-constraint detail.
    """
    constraints: list[PerceptionConstraint] = []
    violations: list[str] = []

    # C1 — sub-bass energy
    c1_passed = features.b_eff < C1_HARMONIC_MAX
    c1_ambiguous = C1_HARMONIC_MAX <= features.b_eff < C1_AMBIGUOUS_MAX
    constraints.append(PerceptionConstraint(
        name="C1_b_eff",
        passed=c1_passed,
        value=features.b_eff,
        threshold=C1_HARMONIC_MAX,
        detail=f"b_eff={features.b_eff:.3f} {'<' if c1_passed else '≥'} {C1_HARMONIC_MAX}",
    ))
    if not c1_passed:
        violations.append(
            f"C1: b_eff={features.b_eff:.3f} exceeds harmonic threshold {C1_HARMONIC_MAX}"
        )

    # C2 — transient density
    c2_passed = features.transient_density <= C2_MAX_TRANSIENTS
    constraints.append(PerceptionConstraint(
        name="C2_transient_density",
        passed=c2_passed,
        value=features.transient_density,
        threshold=float(C2_MAX_TRANSIENTS),
        detail=f"transient_density={features.transient_density:.2f}/bar",
    ))
    if not c2_passed:
        violations.append(
            f"C2: transient_density={features.transient_density:.2f} > {C2_MAX_TRANSIENTS}/bar"
        )

    # C3 — log drum anchor (use harmonic_ratio as proxy for log drum presence)
    # If no fingerprint was extracted (log_drum is None), C3 is not applicable
    # and defaults to passing — we only enforce it when a log drum hit is present.
    ld_anchor = 1.0  # default: passes
    if features.log_drum is not None:
        if features.log_drum.fundamental_hz > 0:
            # Inverse harmonic ratio — lower harmonic ratio means more fundamental,
            # i.e. more log-drum-like (clean fundamental, few overtones)
            ld_anchor = float(1.0 - features.log_drum.harmonic_ratio)
        else:
            ld_anchor = 0.0
    c3_passed = ld_anchor >= C3_MIN_LD_DENSITY
    constraints.append(PerceptionConstraint(
        name="C3_ld_anchor",
        passed=c3_passed,
        value=ld_anchor,
        threshold=C3_MIN_LD_DENSITY,
        detail=f"ld_anchor={ld_anchor:.3f}",
    ))
    if not c3_passed:
        violations.append(
            f"C3: ld_anchor={ld_anchor:.3f} < {C3_MIN_LD_DENSITY}"
        )

    # ── Determine state ───────────────────────────────────────────────────────
    if features.b_eff >= C1_AMBIGUOUS_MAX:
        state = STATE_PERCUSSION
    elif c1_ambiguous or (not c2_passed) or (not c3_passed):
        state = STATE_AMBIGUOUS
    else:
        state = STATE_HARMONIC

    converged = state == STATE_HARMONIC

    # ── Quality score: weighted gate satisfaction ─────────────────────────────
    c1_score = float(np.clip(1.0 - (features.b_eff / C1_HARMONIC_MAX), 0.0, 1.0))
    c2_score = float(np.clip(1.0 - max(0, features.transient_density - C2_MAX_TRANSIENTS) / 4.0, 0.0, 1.0))
    c3_score = float(np.clip(ld_anchor / C3_MIN_LD_DENSITY, 0.0, 1.0)) if C3_MIN_LD_DENSITY > 0 else 1.0
    quality_score = round(0.50 * c1_score + 0.30 * c2_score + 0.20 * c3_score, 4)

    return AudioPerceptionReport(
        state=state,
        converged=converged,
        constraints=constraints,
        violations=violations,
        quality_score=quality_score,
        features=features,
    )


def measure(audio: np.ndarray, sr: int = 44100) -> AudioPerceptionReport:
    """Convenience: extract features then evaluate. Single call for the API."""
    features = extract_features(audio, sr)
    return evaluate_perception(features)


# ── CTL alignment ─────────────────────────────────────────────────────────────

def compare_to_ctl(report: AudioPerceptionReport, ctl: dict) -> AudioPerceptionReport:
    """
    Compute ctl_alignment: how closely the measured audio matches CTL intent.

    Checks BPM, key, and harmonic state against CTL global fields.
    Returns a new report with ctl_alignment and alignment_notes filled in.
    """
    notes: list[str] = []
    scores: list[float] = []
    feat = report.features

    # BPM alignment
    ctl_bpm = float(ctl.get("global", {}).get("bpm", feat.bpm))
    bpm_err = abs(feat.bpm - ctl_bpm) / max(ctl_bpm, 1.0)
    bpm_score = float(max(0.0, 1.0 - bpm_err * 5.0))
    scores.append(bpm_score)
    if bpm_score < 0.8:
        notes.append(f"BPM drift: measured={feat.bpm} ctl={ctl_bpm}")

    # Key alignment (root match = 1.0, relative = 0.5, other = 0.0)
    ctl_key = ctl.get("global", {}).get("key", "")
    if ctl_key:
        ctl_root = ctl_key.replace("m", "").replace("#", "#").strip()[:2].rstrip("m")
        if feat.key_root == ctl_root:
            key_score = 1.0
        else:
            # Relative major/minor share same notes
            major_root = _relative_major(feat.key_root) if feat.key_mode == "minor" else feat.key_root
            ctl_major  = _relative_major(ctl_root) if ctl_key.endswith("m") else ctl_root
            key_score = 0.5 if major_root == ctl_major else 0.0
        scores.append(key_score)
        if key_score < 1.0:
            notes.append(f"Key drift: measured={feat.key_root}/{feat.key_mode} ctl={ctl_key}")
    else:
        scores.append(1.0)

    # State alignment
    ctl_state = ctl.get("global", {}).get("_perception_state", STATE_HARMONIC)
    state_score = 1.0 if report.state == ctl_state else 0.4
    scores.append(state_score)
    if state_score < 1.0:
        notes.append(f"State drift: measured={report.state} ctl={ctl_state}")

    ctl_alignment = round(float(np.mean(scores)), 4)

    return AudioPerceptionReport(
        state=report.state,
        converged=report.converged,
        constraints=report.constraints,
        violations=report.violations,
        quality_score=report.quality_score,
        features=report.features,
        ctl_alignment=ctl_alignment,
        alignment_notes=notes,
    )


def _relative_major(root: str) -> str:
    """Return the relative major root for a minor key root (3 semitones up)."""
    idx = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"].index(root)
    return ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][(idx + 3) % 12]
