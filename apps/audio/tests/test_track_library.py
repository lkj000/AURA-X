import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from services.track_library import KEY_TO_CAMELOT, _get_compatible_camelot_codes


def test_gm_camelot_code():
    assert KEY_TO_CAMELOT["Gm"] == "6A"


def test_f_sharp_minor_camelot():
    assert KEY_TO_CAMELOT["F#m"] == "11A"


def test_compatible_codes_includes_self():
    codes = _get_compatible_camelot_codes("8A")
    assert "8A" in codes


def test_compatible_codes_count():
    codes = _get_compatible_camelot_codes("8A")
    assert len(codes) == 4
