"""
56 tests for packages/aura-engine.

Organised in 7 sections:
  1. DSP — BPM estimation          (8 tests)
  2. DSP — Key detection            (8 tests)
  3. DSP — B_eff                    (6 tests)
  4. DSP — Log drum fingerprint     (6 tests)
  5. DSP — Groove analysis          (6 tests)
  6. Perception — C1/C2/C3          (8 tests)
  7. Culture — classification       (8 tests)
  8. CTL generator                  (6 tests)
"""

import math
import sys
import os
import pytest
import numpy as np

# Make src importable without installing the package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from src.dsp import (
    estimate_bpm, detect_key, compute_b_eff,
    fingerprint_log_drum, analyse_groove,
    _onset_envelope, _chroma_vector,
)
from src.perception import (
    extract_features, evaluate_perception, AudioFeatures,
    STATE_HARMONIC, STATE_AMBIGUOUS, STATE_PERCUSSION,
    C1_HARMONIC_MAX, C2_MAX_TRANSIENTS,
)
from src.culture import (
    classify, mahalanobis_distance, build_feature_vector,
    get_lane_prior, get_lane_stds, LANES, _softmin_probs,
)
from src.ctl_generator import from_goal, from_audio, LANES as CTL_LANES


# ── Synthetic signal helpers ──────────────────────────────────────────────────

SR = 44100

def _sine(freq_hz: float, duration_s: float = 2.0, amp: float = 0.5) -> np.ndarray:
    t = np.linspace(0, duration_s, int(SR * duration_s), endpoint=False)
    return (amp * np.sin(2 * np.pi * freq_hz * t)).astype(np.float32)


def _pulse_train(bpm: float, duration_s: float = 4.0, sr: int = SR) -> np.ndarray:
    """Periodic kick pulses at a given BPM."""
    audio = np.zeros(int(sr * duration_s), dtype=np.float32)
    beat_samples = int(sr * 60.0 / bpm)
    pulse_width = int(sr * 0.01)  # 10 ms pulse
    for start in range(0, len(audio), beat_samples):
        end = min(start + pulse_width, len(audio))
        audio[start:end] = 0.8
    return audio


def _bass_heavy(duration_s: float = 3.0, sr: int = SR) -> np.ndarray:
    """Signal with lots of low-frequency energy (b_eff should be high)."""
    t = np.linspace(0, duration_s, int(sr * duration_s), endpoint=False)
    low  = 0.9 * np.sin(2 * np.pi * 60 * t)
    mid  = 0.05 * np.sin(2 * np.pi * 800 * t)
    high = 0.02 * np.sin(2 * np.pi * 4000 * t)
    return (low + mid + high).astype(np.float32)


def _treble_heavy(duration_s: float = 3.0, sr: int = SR) -> np.ndarray:
    """Signal with little low-frequency energy (b_eff should be low)."""
    t = np.linspace(0, duration_s, int(sr * duration_s), endpoint=False)
    low  = 0.02 * np.sin(2 * np.pi * 60 * t)
    mid  = 0.1  * np.sin(2 * np.pi * 800 * t)
    high = 0.9  * np.sin(2 * np.pi * 4000 * t)
    return (low + mid + high).astype(np.float32)


def _noisy(duration_s: float = 2.0, sr: int = SR) -> np.ndarray:
    rng = np.random.default_rng(42)
    return rng.standard_normal(int(sr * duration_s)).astype(np.float32) * 0.3


def _make_audio_features(
    bpm=112.0, b_eff=0.28, swing_ratio=1.35, transient_density=2.5,
    key_mode="minor", microtiming_std_ms=8.5, tempo_stability=0.72,
) -> AudioFeatures:
    return AudioFeatures(
        bpm=bpm, bpm_confidence=0.8,
        key_root="F#", key_mode=key_mode, key_confidence=0.7,
        b_eff=b_eff, low_energy_db=-18.0,
        transient_density=transient_density,
        log_drum=None,
        swing_ratio=swing_ratio, syncopation=0.3,
        microtiming_std_ms=microtiming_std_ms, tempo_stability=tempo_stability,
        duration_s=30.0,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# 1. DSP — BPM estimation (8 tests)
# ═══════════════════════════════════════════════════════════════════════════════

class TestBPM:
    def test_returns_bpm_result_shape(self):
        result = estimate_bpm(_pulse_train(120.0), SR)
        assert hasattr(result, "bpm")
        assert hasattr(result, "confidence")
        assert hasattr(result, "onset_count")

    def test_bpm_in_valid_range(self):
        result = estimate_bpm(_pulse_train(120.0), SR)
        assert 60.0 <= result.bpm <= 180.0

    def test_estimates_120_bpm_pulse(self):
        result = estimate_bpm(_pulse_train(120.0), SR)
        # Within 5 BPM of true value
        assert abs(result.bpm - 120.0) < 5.0

    def test_estimates_96_bpm(self):
        result = estimate_bpm(_pulse_train(96.0), SR)
        # Within 8 BPM — coarse estimate from synthetic signal is acceptable
        assert abs(result.bpm - 96.0) < 8.0

    def test_confidence_is_0_to_1(self):
        result = estimate_bpm(_pulse_train(120.0), SR)
        assert 0.0 <= result.confidence <= 1.0

    def test_onset_count_positive(self):
        result = estimate_bpm(_pulse_train(120.0), SR)
        assert result.onset_count >= 0

    def test_short_audio_returns_result(self):
        short = _pulse_train(120.0, duration_s=1.5)
        result = estimate_bpm(short, SR)
        assert 60.0 <= result.bpm <= 180.0

    def test_silence_returns_result(self):
        silent = np.zeros(SR * 2, dtype=np.float32)
        result = estimate_bpm(silent, SR)
        assert hasattr(result, "bpm")


# ═══════════════════════════════════════════════════════════════════════════════
# 2. DSP — Key detection (8 tests)
# ═══════════════════════════════════════════════════════════════════════════════

class TestKeyDetection:
    def test_returns_key_result_shape(self):
        result = detect_key(_sine(440.0), SR)
        assert hasattr(result, "root")
        assert hasattr(result, "mode")
        assert hasattr(result, "correlation")

    def test_root_is_valid_note_name(self):
        valid = {"C","C#","D","D#","E","F","F#","G","G#","A","A#","B"}
        result = detect_key(_sine(261.63), SR)  # C4
        assert result.root in valid

    def test_mode_is_major_or_minor(self):
        result = detect_key(_sine(440.0), SR)
        assert result.mode in ("major", "minor")

    def test_correlation_is_0_to_1(self):
        result = detect_key(_sine(440.0), SR)
        assert 0.0 <= result.correlation <= 1.0

    def test_a440_detected_as_a(self):
        # A440 + harmonics biases chroma toward A
        t = np.linspace(0, 3.0, int(SR * 3.0), endpoint=False)
        audio = (0.5 * np.sin(2 * np.pi * 440 * t) +
                 0.25 * np.sin(2 * np.pi * 880 * t)).astype(np.float32)
        result = detect_key(audio, SR)
        assert result.root == "A"

    def test_c_major_chord_detected(self):
        t = np.linspace(0, 3.0, int(SR * 3.0), endpoint=False)
        # C + E + G chord
        audio = (0.4 * np.sin(2 * np.pi * 261.63 * t) +
                 0.3 * np.sin(2 * np.pi * 329.63 * t) +
                 0.3 * np.sin(2 * np.pi * 392.00 * t)).astype(np.float32)
        result = detect_key(audio, SR)
        assert result.root == "C"

    def test_chroma_vector_sums_to_one(self):
        chroma = _chroma_vector(_sine(440.0), SR)
        assert abs(chroma.sum() - 1.0) < 0.01

    def test_noise_returns_some_key(self):
        result = detect_key(_noisy(), SR)
        assert result.root in {"C","C#","D","D#","E","F","F#","G","G#","A","A#","B"}


# ═══════════════════════════════════════════════════════════════════════════════
# 3. DSP — B_eff (6 tests)
# ═══════════════════════════════════════════════════════════════════════════════

class TestBEff:
    def test_returns_b_eff_result_shape(self):
        result = compute_b_eff(_sine(440.0), SR)
        assert hasattr(result, "b_eff")
        assert hasattr(result, "low_energy_db")
        assert hasattr(result, "total_energy_db")

    def test_b_eff_is_0_to_1(self):
        result = compute_b_eff(_sine(440.0), SR)
        assert 0.0 <= result.b_eff <= 1.0

    def test_bass_heavy_signal_has_high_b_eff(self):
        result = compute_b_eff(_bass_heavy(), SR)
        assert result.b_eff > 0.40

    def test_treble_heavy_signal_has_low_b_eff(self):
        result = compute_b_eff(_treble_heavy(), SR)
        assert result.b_eff < 0.10

    def test_total_energy_db_is_negative(self):
        # Audio is normalised so total power should be below 0 dBFS
        result = compute_b_eff(_sine(440.0, amp=0.5), SR)
        assert result.total_energy_db < 0.0

    def test_low_energy_db_less_than_total_for_treble(self):
        result = compute_b_eff(_treble_heavy(), SR)
        assert result.low_energy_db < result.total_energy_db


# ═══════════════════════════════════════════════════════════════════════════════
# 4. DSP — Log drum fingerprint (6 tests)
# ═══════════════════════════════════════════════════════════════════════════════

class TestLogDrumFingerprint:
    def _log_drum_hit(self) -> np.ndarray:
        """Synthetic log drum: 120 Hz fundamental + sharp decay."""
        sr = SR
        t = np.linspace(0, 0.5, int(sr * 0.5), endpoint=False)
        decay = np.exp(-t / 0.08)
        return (0.7 * np.sin(2 * np.pi * 120 * t) * decay).astype(np.float32)

    def test_returns_fingerprint_shape(self):
        fp = fingerprint_log_drum(self._log_drum_hit(), SR)
        assert hasattr(fp, "fundamental_hz")
        assert hasattr(fp, "decay_ms")
        assert hasattr(fp, "harmonic_ratio")
        assert hasattr(fp, "centroid_hz")

    def test_fundamental_in_range(self):
        fp = fingerprint_log_drum(self._log_drum_hit(), SR)
        assert fp.fundamental_hz >= 0.0

    def test_decay_ms_positive(self):
        fp = fingerprint_log_drum(self._log_drum_hit(), SR)
        assert fp.decay_ms >= 0.0

    def test_harmonic_ratio_0_to_1(self):
        fp = fingerprint_log_drum(self._log_drum_hit(), SR)
        assert 0.0 <= fp.harmonic_ratio <= 1.0

    def test_centroid_hz_positive(self):
        fp = fingerprint_log_drum(self._log_drum_hit(), SR)
        assert fp.centroid_hz >= 0.0

    def test_detects_120hz_fundamental(self):
        fp = fingerprint_log_drum(self._log_drum_hit(), SR)
        # Should detect fundamental near 120 Hz ± 30 Hz
        assert abs(fp.fundamental_hz - 120.0) < 30.0


# ═══════════════════════════════════════════════════════════════════════════════
# 5. DSP — Groove analysis (6 tests)
# ═══════════════════════════════════════════════════════════════════════════════

class TestGrooveAnalysis:
    def test_returns_groove_result_shape(self):
        result = analyse_groove(_pulse_train(120.0), SR)
        assert hasattr(result, "swing_ratio")
        assert hasattr(result, "syncopation")
        assert hasattr(result, "microtiming_std_ms")
        assert hasattr(result, "tempo_stability")

    def test_swing_ratio_at_least_1(self):
        result = analyse_groove(_pulse_train(120.0), SR)
        assert result.swing_ratio >= 1.0

    def test_swing_ratio_at_most_2(self):
        result = analyse_groove(_pulse_train(120.0), SR)
        assert result.swing_ratio <= 2.0

    def test_syncopation_0_to_1(self):
        result = analyse_groove(_pulse_train(120.0), SR)
        assert 0.0 <= result.syncopation <= 1.0

    def test_tempo_stability_0_to_1(self):
        result = analyse_groove(_pulse_train(120.0), SR)
        assert 0.0 <= result.tempo_stability <= 1.0

    def test_steady_pulse_has_high_stability(self):
        result = analyse_groove(_pulse_train(120.0, duration_s=8.0), SR, bpm=120.0)
        assert result.tempo_stability > 0.3


# ═══════════════════════════════════════════════════════════════════════════════
# 6. Perception — C1/C2/C3 (8 tests)
# ═══════════════════════════════════════════════════════════════════════════════

class TestPerception:
    def test_low_b_eff_is_harmonic(self):
        features = _make_audio_features(b_eff=0.20, transient_density=2.0)
        report = evaluate_perception(features)
        assert report.state == STATE_HARMONIC

    def test_high_b_eff_is_percussion(self):
        features = _make_audio_features(b_eff=0.50, transient_density=2.0)
        report = evaluate_perception(features)
        assert report.state == STATE_PERCUSSION

    def test_mid_b_eff_is_ambiguous(self):
        features = _make_audio_features(b_eff=0.41, transient_density=2.0)
        report = evaluate_perception(features)
        assert report.state == STATE_AMBIGUOUS

    def test_high_transient_density_is_ambiguous(self):
        features = _make_audio_features(b_eff=0.30, transient_density=6.0)
        report = evaluate_perception(features)
        assert report.state in (STATE_AMBIGUOUS, STATE_PERCUSSION)

    def test_c1_violation_recorded(self):
        features = _make_audio_features(b_eff=0.50)
        report = evaluate_perception(features)
        assert any("C1" in v for v in report.violations)

    def test_c2_violation_recorded(self):
        features = _make_audio_features(b_eff=0.25, transient_density=7.0)
        report = evaluate_perception(features)
        assert any("C2" in v for v in report.violations)

    def test_quality_score_0_to_1(self):
        features = _make_audio_features()
        report = evaluate_perception(features)
        assert 0.0 <= report.quality_score <= 1.0

    def test_converged_iff_harmonic(self):
        harmonic  = _make_audio_features(b_eff=0.20, transient_density=2.0)
        percuss   = _make_audio_features(b_eff=0.50, transient_density=2.0)
        assert evaluate_perception(harmonic).converged is True
        assert evaluate_perception(percuss).converged is False


# ═══════════════════════════════════════════════════════════════════════════════
# 7. Culture — Mahalanobis classification (8 tests)
# ═══════════════════════════════════════════════════════════════════════════════

class TestCulture:
    def test_all_lanes_present(self):
        assert len(LANES) == 8

    def test_classify_returns_known_lane(self):
        result = classify(112, 0.28, 1.38, 2.5, "minor", 8.5, 0.72)
        assert result.lane in LANES

    def test_private_school_prior_classifies_correctly(self):
        prior = get_lane_prior("private_school")
        result = classify(
            bpm=prior["bpm"], b_eff=prior["b_eff"],
            swing_ratio=prior["swing_ratio"], transient_density=prior["transient_density"],
            key_mode="minor", microtiming_std_ms=prior["microtiming_std_ms"],
            tempo_stability=prior["tempo_stability"],
        )
        assert result.lane == "private_school"

    def test_gqom_prior_classifies_correctly(self):
        prior = get_lane_prior("gqom_fusion")
        result = classify(
            bpm=prior["bpm"], b_eff=prior["b_eff"],
            swing_ratio=prior["swing_ratio"], transient_density=prior["transient_density"],
            key_mode="major", microtiming_std_ms=prior["microtiming_std_ms"],
            tempo_stability=prior["tempo_stability"],
        )
        assert result.lane == "gqom_fusion"

    def test_confidence_is_0_to_1(self):
        result = classify(112, 0.28, 1.38, 2.5, "minor", 8.5, 0.72)
        assert 0.0 <= result.confidence <= 1.0

    def test_probabilities_sum_to_one(self):
        result = classify(112, 0.28, 1.38, 2.5, "minor", 8.5, 0.72)
        total = sum(result.probabilities.values())
        assert abs(total - 1.0) < 0.01

    def test_mahalanobis_is_zero_at_mean(self):
        lane = "bacardi"
        prior = get_lane_prior(lane)
        x = build_feature_vector(
            prior["bpm"], prior["b_eff"], prior["swing_ratio"],
            prior["transient_density"], "major",
            prior["microtiming_std_ms"], prior["tempo_stability"],
        )
        dist = mahalanobis_distance(x, lane)
        assert dist < 0.5  # at the mean, distance should be near-zero

    def test_softmin_probabilities_are_valid(self):
        distances = {l: float(i) for i, l in enumerate(LANES)}
        probs = _softmin_probs(distances)
        assert abs(sum(probs.values()) - 1.0) < 0.01
        assert all(0.0 <= v <= 1.0 for v in probs.values())


# ═══════════════════════════════════════════════════════════════════════════════
# 8. CTL generator (6 tests)
# ═══════════════════════════════════════════════════════════════════════════════

class TestCTLGenerator:
    def test_from_goal_returns_ctl_dict(self):
        result = from_goal(lane="private_school", title="Test")
        assert isinstance(result.ctl, dict)
        assert "global" in result.ctl

    def test_from_goal_lane_matches(self):
        for lane in LANES:
            result = from_goal(lane=lane)
            assert result.ctl["global"]["subgenre"] == lane

    def test_from_goal_all_required_keys_present(self):
        result = from_goal(lane="sgija", title="Sgija Test")
        ctl = result.ctl
        required = ["version", "global", "groove_patterns", "harmony",
                    "instrumentation", "sections", "cultural_lineage"]
        for key in required:
            assert key in ctl, f"Missing key: {key}"

    def test_from_goal_groove_pattern_has_16_steps(self):
        result = from_goal(lane="bacardi")
        pattern = result.ctl["groove_patterns"][0]
        assert len(pattern["steps"]) == 16

    def test_from_goal_bpm_override(self):
        result = from_goal(lane="private_school", bpm=125.0)
        assert result.ctl["global"]["bpm"] == 125.0

    def test_from_audio_returns_valid_ctl(self):
        # Use a synthetic pulse-train as the "audio"
        audio = _pulse_train(112.0, duration_s=5.0)
        result = from_audio(audio, SR, title="Synthetic Test")
        ctl = result.ctl
        assert "global" in ctl
        assert result.lane in LANES
        assert result.source == "audio"
