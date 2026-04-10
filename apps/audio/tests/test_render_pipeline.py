import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from services.render_pipeline import _content_type


def test_content_type_wav():
    assert _content_type("wav") == "audio/wav"


def test_content_type_mp3():
    assert _content_type("mp3") == "audio/mpeg"


def test_content_type_unknown_defaults_to_wav():
    assert _content_type("xyz") == "audio/wav"
