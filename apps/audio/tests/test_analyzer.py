import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pytest
from services.analyzer import _detect_key, MAJOR_PROFILE, MINOR_PROFILE, NOTE_NAMES


def test_detect_key_returns_tuple():
    chroma = np.random.rand(12)
    result = _detect_key(chroma)
    assert len(result) == 3


def test_detect_key_c_major():
    """Pure C major chroma profile should detect C major."""
    key, conf, mode = _detect_key(MAJOR_PROFILE)
    assert key == "C"
    assert mode == "major"


def test_detect_key_a_minor():
    """Rotated minor profile to A (index 9) should detect Am."""
    a_minor_chroma = np.roll(MINOR_PROFILE, 9)
    key, conf, mode = _detect_key(a_minor_chroma)
    assert key == "Am"
    assert mode == "minor"


def test_detect_key_confidence_between_0_and_1():
    chroma = np.random.rand(12)
    _, conf, _ = _detect_key(chroma)
    assert 0.0 <= conf <= 1.0


def test_key_name_ends_with_m_for_minor():
    """Minor key names must end with 'm'."""
    chroma = np.roll(MINOR_PROFILE, 5)  # F minor
    key, _, mode = _detect_key(chroma)
    assert mode == "minor"
    assert key.endswith("m")
