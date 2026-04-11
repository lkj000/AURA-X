import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pytest
from services.set_renderer import _crossfade, _hard_cut


def test_crossfade_output_length():
    sr = 44100
    a = np.random.randn(2, sr * 30).astype(np.float32)
    b = np.random.randn(2, sr * 30).astype(np.float32)
    result = _crossfade(a, b, sr, fade_sec=8.0)
    expected = a.shape[1] + b.shape[1] - int(8.0 * sr)
    assert result.shape[1] == expected


def test_hard_cut_output_length():
    a = np.random.randn(2, 1000)
    b = np.random.randn(2, 1000)
    result = _hard_cut(a, b)
    assert result.shape[1] == 2000


def test_crossfade_stereo_preserved():
    sr = 44100
    a = np.random.randn(2, sr * 20).astype(np.float32)
    b = np.random.randn(2, sr * 20).astype(np.float32)
    result = _crossfade(a, b, sr, fade_sec=4.0)
    assert result.shape[0] == 2


def test_crossfade_no_clipping():
    """Signals at 0.5 amplitude — blend at crossfade point must not exceed 1.0."""
    sr = 44100
    a = np.ones((2, sr * 20), dtype=np.float32) * 0.5
    b = np.ones((2, sr * 20), dtype=np.float32) * 0.5
    result = _crossfade(a, b, sr, fade_sec=4.0)
    assert np.max(np.abs(result)) <= 1.0 + 1e-5
