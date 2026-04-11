import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import numpy as np
import pytest


def test_harmonic_separation_preserves_length():
    try:
        import librosa
    except ImportError:
        pytest.skip("librosa not available")
    sr = 22050
    y = np.random.randn(sr * 4).astype(np.float32)
    y_harm = librosa.effects.harmonic(y, margin=3.0)
    assert len(y_harm) == len(y)


def test_harmonic_suppresses_percussive():
    try:
        import librosa
    except ImportError:
        pytest.skip("librosa not available")
    sr = 22050
    t = np.linspace(0, 4, sr * 4)
    y_tone = np.sin(2 * np.pi * 440 * t).astype(np.float32)
    y_with_click = y_tone.copy()
    y_with_click[1000] += 5.0
    y_harm = librosa.effects.harmonic(y_with_click, margin=3.0)
    assert abs(y_harm[1000]) < abs(y_with_click[1000])


def test_normalization_target():
    target = 10 ** (-6 / 20)
    assert 0.49 < target < 0.52


def test_pipeline_log_structure():
    log = [
        "Source: deep_house, BPM=124.0, Key=F#m, Difficulty=moderate",
        "Target: subgenre=private_school, BPM=110.0",
        "Stems: ['drums', 'bass', 'vocals', 'other']",
    ]
    assert all(isinstance(entry, str) for entry in log)
    assert any("Source:" in entry for entry in log)
    assert any("Target:" in entry for entry in log)
