from typing import Optional
from lib.supabase_client import supabase
from services.amapianorize.source_analyzer import analyze_source
from services.stems import separate_stems
from services.amapianorize.rhythm_transplant import transplant_rhythm, _snap_to_amapiano_bpm
from services.amapianorize.harmonic_anchor import extract_harmonic_anchor
from services.mixer import render_mix
from services.master import master_audio

try:
    import librosa
    import soundfile as sf
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False


def run_amapianorize(
    audio_file_id: str,
    track_id: str,
    target_subgenre: Optional[str] = None,
    target_bpm: Optional[float] = None,
    generation_id: Optional[str] = None,
) -> dict:
    """
    Full Amapianorize pipeline:
    1. Analyze source
    2. Separate stems
    3. Transplant rhythm (drums stem → Amapiano groove)
    4. Extract harmonic anchor (vocals + other stems)
    5. Blend groove + anchor
    6. Master
    """
    pipeline_log = []

    # ─── 1. Analyze source ────────────────────────────
    analysis = analyze_source(audio_file_id, track_id)
    if analysis["status"] != "complete":
        return {
            "status": "error",
            "error": f"Analysis failed: {analysis.get('error')}",
            "pipeline_log": pipeline_log,
        }

    chosen_subgenre = target_subgenre or analysis["recommended_subgenre"]
    chosen_bpm = target_bpm or analysis["bpm"]

    snapped_bpm = _snap_to_amapiano_bpm(chosen_bpm)
    if snapped_bpm is None:
        return {
            "status": "incompatible",
            "error": f"Source BPM {chosen_bpm:.1f} has no halftime or doubletime path to Amapiano range (104–116 BPM)",
            "source_bpm": chosen_bpm,
            "pipeline_log": [],
        }
    chosen_bpm = snapped_bpm

    pipeline_log.append(
        f"Source: {analysis['source_character']}, "
        f"BPM={analysis['bpm']}, Key={analysis['key']}, "
        f"Difficulty={analysis['amapiano_difficulty']}"
    )
    pipeline_log.append(f"Target: subgenre={chosen_subgenre}, BPM={chosen_bpm}")

    # ─── 2. Fetch raw audio bytes ─────────────────────
    file_result = supabase.table("audio_files") \
        .select("storage_path, format") \
        .eq("id", audio_file_id) \
        .single() \
        .execute()

    if not file_result.data:
        return {
            "status": "error",
            "error": "Source audio not found",
            "pipeline_log": pipeline_log,
        }

    raw_bytes = supabase.storage \
        .from_("aura-x-audio") \
        .download(file_result.data["storage_path"])
    content_type = f"audio/{file_result.data['format']}"

    # ─── 3. Separate stems ────────────────────────────
    stems_result = separate_stems(
        audio_bytes=raw_bytes,
        track_id=track_id,
        generation_id=generation_id,
        source_audio_file_id=audio_file_id,
        content_type=content_type,
    )
    if stems_result["status"] != "complete":
        return {
            "status": "error",
            "error": "Stem separation failed",
            "pipeline_log": pipeline_log,
        }

    stem_ids = stems_result["stems"]
    pipeline_log.append(f"Stems: {list(stem_ids.keys())}")

    # ─── 4. Rhythm transplant on drums stem ──────────
    transplant_result = transplant_rhythm(
        audio_file_id=stem_ids.get("drums", audio_file_id),
        track_id=track_id,
        target_subgenre=chosen_subgenre,
        target_bpm=chosen_bpm,
        generation_id=generation_id,
    )
    if transplant_result["status"] != "complete":
        return {
            "status": "error",
            "error": "Rhythm transplant failed",
            "pipeline_log": pipeline_log,
        }

    pipeline_log.append(
        f"Rhythm transplant: {transplant_result['source_bpm']} → {transplant_result['target_bpm']} BPM"
    )

    # ─── 5. Harmonic anchor ───────────────────────────
    anchor_result = extract_harmonic_anchor(
        vocals_stem_file_id=stem_ids.get("vocals"),
        other_stem_file_id=stem_ids.get("other"),
        track_id=track_id,
        generation_id=generation_id,
    )
    if anchor_result["status"] != "complete":
        pipeline_log.append(f"Warning: harmonic anchor failed: {anchor_result.get('error')}")
        anchor_file_id = None
    else:
        anchor_file_id = anchor_result["anchor_file_id"]
        pipeline_log.append(f"Harmonic anchor extracted: {anchor_file_id}")

    # ─── 6. Mix: groove transplant + harmonic anchor ─
    mix_stems = {
        "drums": transplant_result["transplant_file_id"],
        "bass":  stem_ids.get("bass"),
    }
    if anchor_file_id:
        mix_stems["other"] = anchor_file_id

    mix_result = render_mix(
        stem_file_ids=mix_stems,
        track_id=track_id,
        subgenre=chosen_subgenre,
        generation_id=generation_id,
    )
    if mix_result["status"] != "complete":
        return {
            "status": "error",
            "error": "Mix failed",
            "pipeline_log": pipeline_log,
        }

    pipeline_log.append(f"Mix: {mix_result['mix_file_id']}")

    # ─── 7. Master ────────────────────────────────────
    master_result = master_audio(
        mix_file_id=mix_result["mix_file_id"],
        track_id=track_id,
        subgenre=chosen_subgenre,
        generation_id=generation_id,
    )
    if master_result["status"] != "complete":
        return {
            "status": "error",
            "error": "Mastering failed",
            "pipeline_log": pipeline_log,
        }

    pipeline_log.append(
        f"Master: {master_result['master_file_id']} @ {master_result['target_lufs']} LUFS"
    )

    # Minimal output sanity check — Phase 2 will extend this with Contrast Score
    _VALID_AMAPIANO_SUBGENRES = {
        "private_school", "sgija", "bacardi", "stixx_sgija",
        "mbiraiano", "three_step", "gqom_fusion", "hybrid_rnb_amapiano",
    }
    if not (102 <= chosen_bpm <= 118):
        return {
            "status": "degraded",
            "warning": f"Output BPM {chosen_bpm:.1f} outside Amapiano range (102–118)",
            "pipeline_log": pipeline_log,
        }
    if chosen_subgenre not in _VALID_AMAPIANO_SUBGENRES:
        return {
            "status": "degraded",
            "warning": f"Subgenre '{chosen_subgenre}' is not a recognised Amapiano subgenre",
            "pipeline_log": pipeline_log,
        }

    return {
        "status": "complete",
        "track_id": track_id,
        "source_analysis": {
            "bpm": analysis["bpm"],
            "key": analysis["key"],
            "source_character": analysis["source_character"],
            "amapiano_difficulty": analysis["amapiano_difficulty"],
        },
        "transformation": {
            "target_subgenre": chosen_subgenre,
            "target_bpm": chosen_bpm,
        },
        "artifacts": {
            "stems":             stem_ids,
            "rhythm_transplant": transplant_result["transplant_file_id"],
            "harmonic_anchor":   anchor_file_id,
            "mix":               mix_result["mix_file_id"],
            "master":            master_result["master_file_id"],
        },
        "pipeline_log": pipeline_log,
    }
