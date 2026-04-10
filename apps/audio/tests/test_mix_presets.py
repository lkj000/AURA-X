import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.mix_presets import get_mix_preset
import pytest


def test_private_school_log_drum_mono():
    preset = get_mix_preset("private_school")
    assert preset.strips["log_drum"].pan == 0.0


def test_bacardi_log_drum_heavier_than_private_school():
    bac = get_mix_preset("bacardi")
    ps  = get_mix_preset("private_school")
    assert bac.strips["log_drum"].output_gain_db > ps.strips["log_drum"].output_gain_db
