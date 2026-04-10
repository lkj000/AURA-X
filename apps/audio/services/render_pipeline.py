import io
import datetime
from typing import Optional
from lib.supabase_client import supabase
from services.stems import separate_stems
from services.log_drum import extract_log_drum
from services.mixer import render_mix
from services.master import master_audio


def run_full_render(
    raw_audio_file_id: str,
    track_id: str,
    subgenre: str,
    generation_id: Optional[str] = None,
) -> dict:
    """
    Full production pipeline:
    1. Download raw audio
    2. Separate stems (Demucs)
    3. Extract log drum from drums stem
    4. Mix stems (pedalboard channel strips)
    5. Master mix (stereo width + EQ + limiter)
    Returns all artifact IDs.
    """
    pipeline_log = []

    # ─── 1. Fetch raw audio record ────────────────────────────────────────────
    result = supabase.table("audio_files") \
        .select("storage_path, format, file_size_bytes") \
        .eq("id", raw_audio_file_id) \
        .single() \
        .execute()

    if not result.data:
        return {
            "status": "error",
            "error": "Raw audio file not found",
            "pipeline_log": pipeline_log,
        }

    raw_record = result.data
    content_type = _content_type(raw_record["format"])
    pipeline_log.append(
        f"Raw audio: {raw_audio_file_id} ({raw_record['file_size_bytes']} bytes)"
    )

    # ─── 2. Download raw audio ────────────────────────────────────────────────
    raw_bytes = supabase.storage \
        .from_("aura-x-audio") \
        .download(raw_record["storage_path"])

    # ─── 3. Stem separation ───────────────────────────────────────────────────
    stems_result = separate_stems(
        audio_bytes=raw_bytes,
        track_id=track_id,
        generation_id=generation_id,
        source_audio_file_id=raw_audio_file_id,
        content_type=content_type,
    )
    if stems_result["status"] != "complete":
        return {
            "status": "error",
            "error": f"Stem separation failed: {stems_result.get('error')}",
            "pipeline_log": pipeline_log,
        }

    stem_ids = dict(stems_result["stems"])
    pipeline_log.append(f"Stems separated: {list(stem_ids.keys())}")

    # ─── 4. Log drum extraction ───────────────────────────────────────────────
    log_drum_result = {"status": "skipped", "log_drum_file_id": None}
    if "drums" in stem_ids:
        # Download drums stem → pass bytes to extractor
        drums_record = supabase.table("audio_files") \
            .select("storage_path") \
            .eq("id", stem_ids["drums"]) \
            .single() \
            .execute()

        if drums_record.data:
            drums_bytes = supabase.storage \
                .from_("aura-x-audio") \
                .download(drums_record.data["storage_path"])

            log_drum_result = extract_log_drum(
                audio_bytes=drums_bytes,
                track_id=track_id,
                source_audio_file_id=stem_ids["drums"],
                generation_id=generation_id,
                content_type="audio/wav",
            )
            if log_drum_result["status"] == "complete":
                stem_ids["log_drum"] = log_drum_result["log_drum_file_id"]
                pipeline_log.append(
                    f"Log drum extracted: {log_drum_result['onset_count']} onsets"
                )
            else:
                pipeline_log.append(
                    f"Log drum extraction warning: {log_drum_result.get('error')}"
                )

    # ─── 5. Mix ───────────────────────────────────────────────────────────────
    mix_result = render_mix(
        stem_file_ids=stem_ids,
        track_id=track_id,
        subgenre=subgenre,
        generation_id=generation_id,
    )
    if mix_result["status"] != "complete":
        return {
            "status": "error",
            "error": f"Mix failed: {mix_result.get('error')}",
            "pipeline_log": pipeline_log,
        }

    pipeline_log.append(
        f"Mix rendered: {mix_result['mix_file_id']} ({mix_result['preset']})"
    )

    # ─── 6. Master ────────────────────────────────────────────────────────────
    master_result = master_audio(
        mix_file_id=mix_result["mix_file_id"],
        track_id=track_id,
        subgenre=subgenre,
        generation_id=generation_id,
    )
    if master_result["status"] != "complete":
        return {
            "status": "error",
            "error": f"Master failed: {master_result.get('error')}",
            "pipeline_log": pipeline_log,
        }

    pipeline_log.append(
        f"Master complete: {master_result['master_file_id']} @ {master_result['target_lufs']} LUFS"
    )

    # ─── 7. Update track status ───────────────────────────────────────────────
    supabase.table("tracks").update({
        "status": "produced",
        "updated_at": datetime.datetime.utcnow().isoformat() + "Z",
    }).eq("id", track_id).execute()

    return {
        "status": "complete",
        "track_id": track_id,
        "subgenre": subgenre,
        "artifacts": {
            "raw_audio": raw_audio_file_id,
            "stems":     stem_ids,
            "log_drum":  log_drum_result.get("log_drum_file_id"),
            "mix":       mix_result["mix_file_id"],
            "master":    master_result["master_file_id"],
        },
        "master_lufs_target": master_result["target_lufs"],
        "pipeline_log": pipeline_log,
    }


def _content_type(fmt: str) -> str:
    return {
        "wav":  "audio/wav",
        "mp3":  "audio/mpeg",
        "flac": "audio/flac",
    }.get(fmt, "audio/wav")
