import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pytest
from services.master import (
    TARGET_LUFS,
    _stereo_width_by_subgenre,
    _apply_stereo_width,
)


def test_bacardi_louder_than_private_school():
    assert TARGET_LUFS["bacardi"] > TARGET_LUFS["private_school"]


def test_mbiraiano_most_dynamic():
    assert TARGET_LUFS["mbiraiano"] <= min(TARGET_LUFS.values())


def test_private_school_wider_than_bacardi():
    assert _stereo_width_by_subgenre("private_school") > \
           _stereo_width_by_subgenre("bacardi")


def test_stereo_width_preserves_mono_compatibility():
    """Mid channel must be unchanged after width processing."""
    y = np.random.randn(2, 1000).astype(np.float32)
    y_wide = _apply_stereo_width(y, 1.3)
    mid_before = (y[0] + y[1]) / 2
    mid_after  = (y_wide[0] + y_wide[1]) / 2
    np.testing.assert_allclose(mid_before, mid_after, atol=1e-5)
