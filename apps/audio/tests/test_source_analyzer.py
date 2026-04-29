import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pytest
from services.amapianorize.source_analyzer import (
    _classify_source_character,
    _estimate_amapiano_difficulty,
    _recommend_subgenre,
    _measure_frequency_band,
)
import numpy as np


def test_classify_amapiano_adjacent():
    char = _classify_source_character(
        bpm=110, spectral_centroid=2000,
        low_mid_ratio=0.20, rhythm_strength=0.5, flatness=0.005
    )
    assert char == "amapiano_adjacent"


def test_classify_deep_house():
    char = _classify_source_character(
        bpm=124, spectral_centroid=2200,
        low_mid_ratio=0.15, rhythm_strength=0.6, flatness=0.008
    )
    assert char == "deep_house"


def test_classify_rnb_soul():
    char = _classify_source_character(
        bpm=85, spectral_centroid=2000,
        low_mid_ratio=0.08, rhythm_strength=0.4, flatness=0.01
    )
    assert char == "rnb_soul"


def test_difficulty_amapiano_adjacent_is_easy():
    diff = _estimate_amapiano_difficulty(110, "amapiano_adjacent", 0.7)
    assert diff == "easy"


def test_difficulty_very_different_bpm_is_hard():
    diff = _estimate_amapiano_difficulty(160, "electronic", 0.8)
    assert diff in ("hard", "very_hard")


def test_recommend_subgenre_rnb_soul():
    sub = _recommend_subgenre(85, "rnb_soul", "minor")
    assert sub == "hybrid_rnb_amapiano"


def test_recommend_subgenre_deep_house():
    sub = _recommend_subgenre(124, "deep_house", "minor")
    assert sub == "private_school"


def test_measure_frequency_band_returns_float():
    sr = 44100
    y = np.random.randn(sr * 2).astype(np.float32)
    val = _measure_frequency_band(y, sr, 60, 300)
    assert isinstance(val, float)
    assert val >= 0.0


def test_classify_jazz_not_electronic():
    # Jazz: 130 BPM, bright cymbals (high centroid), strong rhythm, LOW flatness
    # (acoustic instruments have complex spectra, not flat)
    char = _classify_source_character(
        bpm=130, spectral_centroid=3500,
        low_mid_ratio=0.08, rhythm_strength=0.8, flatness=0.02
    )
    assert char != "electronic", f"Jazz should not be classified as electronic, got {char}"


def test_classify_deep_house_132_bpm():
    # 132 BPM was previously missed by 120-128 range; now caught by 120-135
    char = _classify_source_character(
        bpm=132, spectral_centroid=2400,
        low_mid_ratio=0.14, rhythm_strength=0.5, flatness=0.008
    )
    assert char == "deep_house"


def test_classify_electronic_requires_high_flatness():
    # Synthesised electronic: high centroid, high rhythm, HIGH flatness
    char = _classify_source_character(
        bpm=140, spectral_centroid=4000,
        low_mid_ratio=0.06, rhythm_strength=0.9, flatness=0.08
    )
    assert char == "electronic"
