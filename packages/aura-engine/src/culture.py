"""
Cultural Classification — Mahalanobis distance in 7-dimensional acoustic space.

Each lane has a calibrated mean vector μ and covariance matrix Σ derived from
the corpus priors. A new track's 7-feature vector is classified by finding the
lane whose Mahalanobis distance d_M(x, μ_k, Σ_k) is smallest.

Feature vector (7 dimensions):
  [0] bpm                 — tempo
  [1] b_eff               — sub-bass energy ratio
  [2] swing_ratio         — 8th-note swing (1.0 = straight)
  [3] transient_density   — onsets per bar
  [4] key_mode_bin        — 0=major, 1=minor (binary)
  [5] microtiming_std_ms  — groove tightness
  [6] tempo_stability     — autocorrelation sharpness

d_M(x, μ, Σ) = sqrt((x-μ)ᵀ Σ⁻¹ (x-μ))

The inverse covariance Σ⁻¹ is precomputed at startup. For low-sample lanes
the covariance is regularised: Σ_reg = Σ + λI.
"""

from __future__ import annotations
import math
import numpy as np
from dataclasses import dataclass
from typing import Optional

# ── Lane prior corpus ─────────────────────────────────────────────────────────
# Each row: [bpm, b_eff, swing_ratio, transient_density, key_mode_bin,
#            microtiming_std_ms, tempo_stability]
# Derived from corpus analysis + acoustic literature on Afro-electronic genres.

_LANE_MEANS: dict[str, list[float]] = {
    "private_school":       [112.0, 0.28, 1.38, 2.5,  1.0, 8.5,  0.72],
    "bacardi":              [118.0, 0.38, 1.08, 3.0,  0.0, 4.2,  0.88],
    "sgija":                [114.0, 0.33, 1.52, 3.5,  1.0, 11.0, 0.65],
    "stixx_sgija":          [115.0, 0.36, 1.60, 3.8,  1.0, 13.5, 0.60],
    "mbiraiano":            [110.0, 0.22, 1.28, 2.0,  1.0, 14.0, 0.55],
    "three_step":           [113.0, 0.32, 1.18, 3.0,  1.0, 6.0,  0.78],
    "gqom_fusion":          [120.0, 0.37, 1.04, 3.2,  0.0, 3.5,  0.92],
    "hybrid_rnb_amapiano":  [112.0, 0.26, 1.35, 2.4,  1.0, 7.5,  0.70],
}

# Per-dimension standard deviations (diagonal covariance prior)
_LANE_STDS: dict[str, list[float]] = {
    "private_school":       [4.0,  0.04, 0.12, 0.6,  0.3, 3.0,  0.12],
    "bacardi":              [3.0,  0.05, 0.06, 0.5,  0.2, 2.0,  0.08],
    "sgija":                [3.5,  0.05, 0.15, 0.6,  0.3, 4.0,  0.14],
    "stixx_sgija":          [3.5,  0.05, 0.18, 0.7,  0.3, 5.0,  0.16],
    "mbiraiano":            [4.0,  0.04, 0.14, 0.5,  0.3, 5.0,  0.18],
    "three_step":           [3.5,  0.05, 0.10, 0.6,  0.3, 2.5,  0.10],
    "gqom_fusion":          [3.0,  0.05, 0.05, 0.5,  0.2, 1.5,  0.06],
    "hybrid_rnb_amapiano":  [4.0,  0.04, 0.12, 0.5,  0.3, 3.0,  0.12],
}

LANES = list(_LANE_MEANS.keys())
FEATURE_DIM = 7
_REGULARISATION = 1e-4   # λ for Σ_reg = Σ + λI


# ── Public data classes ────────────────────────────────────────────────────────

@dataclass
class ClassificationResult:
    lane: str               # best-match lane
    distance: float         # Mahalanobis distance to best lane
    confidence: float       # 0–1 derived from softmin of distances
    scores: dict[str, float]  # {lane: mahalanobis_distance}
    probabilities: dict[str, float]  # softmin normalised to [0,1]


# ── Covariance matrices (diagonal, precomputed) ───────────────────────────────

def _build_inv_cov(lane: str) -> np.ndarray:
    """Build diagonal Σ⁻¹ for a lane with regularisation."""
    stds = np.array(_LANE_STDS[lane], dtype=float)
    variances = stds ** 2 + _REGULARISATION
    return np.diag(1.0 / variances)


_INV_COV: dict[str, np.ndarray] = {
    lane: _build_inv_cov(lane) for lane in LANES
}

_MEANS: dict[str, np.ndarray] = {
    lane: np.array(vals, dtype=float) for lane, vals in _LANE_MEANS.items()
}


# ── Feature vector construction ───────────────────────────────────────────────

def build_feature_vector(
    bpm: float,
    b_eff: float,
    swing_ratio: float,
    transient_density: float,
    key_mode: str,                  # "major" | "minor"
    microtiming_std_ms: float,
    tempo_stability: float,
) -> np.ndarray:
    """Pack 7 measurements into the classification feature vector."""
    return np.array([
        bpm,
        b_eff,
        swing_ratio,
        transient_density,
        1.0 if key_mode == "minor" else 0.0,
        microtiming_std_ms,
        tempo_stability,
    ], dtype=float)


# ── Mahalanobis distance ──────────────────────────────────────────────────────

def mahalanobis_distance(x: np.ndarray, lane: str) -> float:
    """
    d_M(x, μ_k, Σ_k) = sqrt((x-μ)ᵀ Σ⁻¹ (x-μ))

    With diagonal Σ this simplifies to the weighted Euclidean distance:
    d = sqrt(Σᵢ (xᵢ - μᵢ)² / σᵢ²)
    """
    delta = x - _MEANS[lane]
    inv_cov = _INV_COV[lane]
    quad = float(delta @ inv_cov @ delta)
    return math.sqrt(max(quad, 0.0))


# ── Softmin probability distribution ─────────────────────────────────────────

def _softmin_probs(distances: dict[str, float], temperature: float = 1.0) -> dict[str, float]:
    """
    Convert distances to probabilities via softmin (softmax of negatives).
    Smaller distance → higher probability.
    """
    lanes = list(distances.keys())
    d_arr = np.array([distances[l] for l in lanes])

    # Subtract minimum for numerical stability
    neg_d = -d_arr / max(temperature, 1e-6)
    neg_d -= neg_d.max()
    exp_d = np.exp(neg_d)
    probs = exp_d / (exp_d.sum() + 1e-12)
    return {l: round(float(p), 4) for l, p in zip(lanes, probs)}


# ── Main classification function ──────────────────────────────────────────────

def classify(
    bpm: float,
    b_eff: float,
    swing_ratio: float,
    transient_density: float,
    key_mode: str,
    microtiming_std_ms: float,
    tempo_stability: float,
    temperature: float = 2.0,
) -> ClassificationResult:
    """
    Classify a track into its most probable Afro-electronic lane.

    temperature controls how peaked the probability distribution is.
    At temperature=1 the distribution is sharp; higher values flatten it.
    """
    x = build_feature_vector(
        bpm, b_eff, swing_ratio, transient_density,
        key_mode, microtiming_std_ms, tempo_stability
    )

    distances = {lane: mahalanobis_distance(x, lane) for lane in LANES}
    probs = _softmin_probs(distances, temperature=temperature)

    best_lane = min(distances, key=lambda l: distances[l])
    best_dist = distances[best_lane]
    confidence = probs[best_lane]

    return ClassificationResult(
        lane=best_lane,
        distance=round(best_dist, 4),
        confidence=round(confidence, 4),
        scores=distances,
        probabilities=probs,
    )


def classify_from_features(features, temperature: float = 2.0) -> ClassificationResult:
    """Convenience wrapper: takes an AudioFeatures dataclass directly."""
    return classify(
        bpm=features.bpm,
        b_eff=features.b_eff,
        swing_ratio=features.swing_ratio,
        transient_density=features.transient_density,
        key_mode=features.key_mode,
        microtiming_std_ms=features.microtiming_std_ms,
        tempo_stability=features.tempo_stability,
        temperature=temperature,
    )


# ── Lane acoustic profile access ─────────────────────────────────────────────

def get_lane_prior(lane: str) -> dict[str, float]:
    """Return the acoustic prior for a lane as a labelled dict."""
    if lane not in _LANE_MEANS:
        lane = "private_school"
    means = _LANE_MEANS[lane]
    keys = ["bpm", "b_eff", "swing_ratio", "transient_density",
            "key_mode_bin", "microtiming_std_ms", "tempo_stability"]
    return {k: v for k, v in zip(keys, means)}


def get_lane_stds(lane: str) -> dict[str, float]:
    """Return per-dimension standard deviations for a lane."""
    if lane not in _LANE_STDS:
        lane = "private_school"
    stds = _LANE_STDS[lane]
    keys = ["bpm", "b_eff", "swing_ratio", "transient_density",
            "key_mode_bin", "microtiming_std_ms", "tempo_stability"]
    return {k: v for k, v in zip(keys, stds)}
