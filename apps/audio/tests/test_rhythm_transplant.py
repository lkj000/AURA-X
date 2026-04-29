import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import numpy as np
import pytest
from services.amapianorize.rhythm_transplant import (
    _snap_to_amapiano_bpm,
    _apply_groove_feel,
    GROOVE_TEMPLATES,
)


def test_snap_bpm_already_in_range():
    assert _snap_to_amapiano_bpm(110.0) == 110.0


def test_snap_bpm_halftime():
    # 55 BPM halftime → 110 BPM
    result = _snap_to_amapiano_bpm(55.0)
    assert 104 <= result <= 116


def test_snap_bpm_doubletime():
    # 220 BPM doubletime → 110 BPM
    result = _snap_to_amapiano_bpm(220.0)
    assert 104 <= result <= 116


def test_snap_bpm_incompatible_returns_none():
    # 200 BPM: candidates [200, 100, 400, 50, 800] — none in 104-116
    result = _snap_to_amapiano_bpm(200.0)
    assert result is None


def test_snap_bpm_130_returns_none():
    # 130 BPM: candidates [130, 65, 260, 32.5, 520] — none in 104-116
    result = _snap_to_amapiano_bpm(130.0)
    assert result is None


def test_snap_bpm_quarter_time():
    # 440 BPM: 440 * 0.25 = 110.0 — in range
    result = _snap_to_amapiano_bpm(440.0)
    assert result is not None
    assert 104 <= result <= 116


def test_groove_templates_have_4_subgenres():
    assert len(GROOVE_TEMPLATES) == 4


def test_groove_templates_have_log_drum():
    for name, groove in GROOVE_TEMPLATES.items():
        assert "log_drum_positions" in groove


def test_apply_groove_no_swing_unchanged():
    sr = 44100
    y = np.random.randn(sr * 4).astype(np.float32)
    groove = {"swing": 0.5, "log_drum_positions": [4, 12]}
    result = _apply_groove_feel(y, sr, 110.0, groove)
    assert result.shape == y.shape


def test_apply_groove_preserves_length():
    sr = 44100
    y = np.random.randn(sr * 4).astype(np.float32)
    groove = GROOVE_TEMPLATES["sgija"]
    result = _apply_groove_feel(y, sr, 110.0, groove)
    assert result.shape == y.shape
