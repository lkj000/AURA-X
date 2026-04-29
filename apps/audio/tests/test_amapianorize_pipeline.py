import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pytest
from unittest.mock import patch, MagicMock
from services.amapianorize.pipeline import run_amapianorize


def _mock_analysis(bpm=110.0, character="amapiano_adjacent", difficulty="easy", subgenre="private_school"):
    return {
        "status": "complete",
        "bpm": bpm,
        "key": "F#",
        "mode": "minor",
        "source_character": character,
        "amapiano_difficulty": difficulty,
        "recommended_subgenre": subgenre,
    }


def _mock_stems():
    return {
        "status": "complete",
        "stems": {"drums": "drum-id", "bass": "bass-id", "vocals": "vox-id", "other": "other-id"},
    }


def _mock_transplant(source_bpm=110.0, target_bpm=110.0):
    return {
        "status": "complete",
        "transplant_file_id": "transplant-id",
        "source_bpm": source_bpm,
        "target_bpm": target_bpm,
        "target_subgenre": "private_school",
    }


def _mock_anchor():
    return {"status": "complete", "anchor_file_id": "anchor-id"}


def _mock_mix():
    return {"status": "complete", "mix_file_id": "mix-id"}


def _mock_master():
    return {
        "status": "complete",
        "master_file_id": "master-id",
        "storage_path": "track/master/master-id.wav",
        "target_lufs": -10.0,
        "subgenre": "private_school",
        "file_size_bytes": 4096,
    }


def _mock_supabase_file():
    mock = MagicMock()
    mock.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "storage_path": "track/source.wav",
        "format": "wav",
    }
    mock.storage.from_.return_value.download.return_value = b"\x00" * 100
    return mock


@patch("services.amapianorize.pipeline.master_audio")
@patch("services.amapianorize.pipeline.render_mix")
@patch("services.amapianorize.pipeline.extract_harmonic_anchor")
@patch("services.amapianorize.pipeline.transplant_rhythm")
@patch("services.amapianorize.pipeline.separate_stems")
@patch("services.amapianorize.pipeline.analyze_source")
@patch("services.amapianorize.pipeline.supabase")
def test_pipeline_incompatible_bpm(mock_sup, mock_analyze, mock_stems, mock_transplant,
                                    mock_anchor, mock_mix, mock_master):
    """130 BPM source has no halftime/doubletime path — pipeline returns incompatible."""
    mock_sup.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "storage_path": "src.wav", "format": "wav"
    }
    mock_analyze.return_value = _mock_analysis(bpm=130.0, character="other", difficulty="very_hard", subgenre="mbiraiano")

    result = run_amapianorize("file-id", "track-id")

    assert result["status"] == "incompatible"
    assert "130" in result["error"]
    mock_stems.assert_not_called()
    mock_transplant.assert_not_called()


@patch("services.amapianorize.pipeline.master_audio")
@patch("services.amapianorize.pipeline.render_mix")
@patch("services.amapianorize.pipeline.extract_harmonic_anchor")
@patch("services.amapianorize.pipeline.transplant_rhythm")
@patch("services.amapianorize.pipeline.separate_stems")
@patch("services.amapianorize.pipeline.analyze_source")
@patch("services.amapianorize.pipeline.supabase")
def test_pipeline_valid_bpm_completes(mock_sup, mock_analyze, mock_stems, mock_transplant,
                                       mock_anchor, mock_mix, mock_master):
    """112 BPM source (valid Amapiano range) → status: complete, no regression."""
    mock_sup.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "storage_path": "src.wav", "format": "wav"
    }
    mock_sup.storage.from_.return_value.download.return_value = b"\x00" * 100
    mock_analyze.return_value = _mock_analysis(bpm=112.0)
    mock_stems.return_value = _mock_stems()
    mock_transplant.return_value = _mock_transplant(source_bpm=112.0, target_bpm=112.0)
    mock_anchor.return_value = _mock_anchor()
    mock_mix.return_value = _mock_mix()
    mock_master.return_value = _mock_master()

    result = run_amapianorize("file-id", "track-id")

    assert result["status"] == "complete"
    assert result["transformation"]["target_bpm"] == 112.0


@patch("services.amapianorize.pipeline.master_audio")
@patch("services.amapianorize.pipeline.render_mix")
@patch("services.amapianorize.pipeline.extract_harmonic_anchor")
@patch("services.amapianorize.pipeline.transplant_rhythm")
@patch("services.amapianorize.pipeline.separate_stems")
@patch("services.amapianorize.pipeline.analyze_source")
@patch("services.amapianorize.pipeline.supabase")
def test_pipeline_unknown_subgenre_degrades(mock_sup, mock_analyze, mock_stems, mock_transplant,
                                             mock_anchor, mock_mix, mock_master):
    """Unknown subgenre passed at call time → status: degraded after mastering."""
    mock_sup.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "storage_path": "src.wav", "format": "wav"
    }
    mock_sup.storage.from_.return_value.download.return_value = b"\x00" * 100
    mock_analyze.return_value = _mock_analysis(bpm=110.0)
    mock_stems.return_value = _mock_stems()
    mock_transplant.return_value = _mock_transplant()
    mock_anchor.return_value = _mock_anchor()
    mock_mix.return_value = _mock_mix()
    mock_master.return_value = _mock_master()

    result = run_amapianorize("file-id", "track-id", target_subgenre="industrial_techno")

    assert result["status"] == "degraded"
    assert "industrial_techno" in result["warning"]


@patch("services.amapianorize.pipeline.analyze_source")
def test_pipeline_analysis_failure_returns_error(mock_analyze):
    """Analysis failure → status: error, no downstream calls."""
    mock_analyze.return_value = {"status": "error", "error": "librosa not installed"}

    result = run_amapianorize("file-id", "track-id")

    assert result["status"] == "error"


@patch("services.amapianorize.pipeline.master_audio")
@patch("services.amapianorize.pipeline.render_mix")
@patch("services.amapianorize.pipeline.extract_harmonic_anchor")
@patch("services.amapianorize.pipeline.transplant_rhythm")
@patch("services.amapianorize.pipeline.separate_stems")
@patch("services.amapianorize.pipeline.analyze_source")
@patch("services.amapianorize.pipeline.supabase")
def test_pipeline_55_bpm_halftime_valid(mock_sup, mock_analyze, mock_stems, mock_transplant,
                                         mock_anchor, mock_mix, mock_master):
    """55 BPM source → snaps to 110 via halftime → pipeline completes."""
    mock_sup.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "storage_path": "src.wav", "format": "wav"
    }
    mock_sup.storage.from_.return_value.download.return_value = b"\x00" * 100
    mock_analyze.return_value = _mock_analysis(bpm=55.0)
    mock_stems.return_value = _mock_stems()
    mock_transplant.return_value = _mock_transplant(source_bpm=55.0, target_bpm=110.0)
    mock_anchor.return_value = _mock_anchor()
    mock_mix.return_value = _mock_mix()
    mock_master.return_value = _mock_master()

    result = run_amapianorize("file-id", "track-id")

    assert result["status"] == "complete"
    assert result["transformation"]["target_bpm"] == 110.0
