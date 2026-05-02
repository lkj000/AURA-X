"""AURA Engine — first-principles audio analysis and CTL generation."""

from .dsp import estimate_bpm, detect_key, compute_b_eff, fingerprint_log_drum, analyse_groove
from .perception import extract_features, evaluate_perception, measure, compare_to_ctl
from .culture import classify, classify_from_features, get_lane_prior, LANES
from .ctl_generator import from_audio, from_goal

__all__ = [
    "estimate_bpm", "detect_key", "compute_b_eff", "fingerprint_log_drum", "analyse_groove",
    "extract_features", "evaluate_perception", "measure", "compare_to_ctl",
    "classify", "classify_from_features", "get_lane_prior", "LANES",
    "from_audio", "from_goal",
]
