from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
from lib.supabase_client import supabase
from services.stems import separate_stems, DEMUCS_AVAILABLE

router = APIRouter(prefix="/stems", tags=["stems"])


class StemRequest(BaseModel):
    audio_file_id: str
    track_id: str
    generation_id: Optional[str] = None


@router.post("/separate")
async def separate(req: StemRequest):
    """
    Separate an audio file into stems using Demucs.
    audio_file_id must exist in audio_files table.
    """
    # 1. Fetch audio_files record
    result = supabase.table("audio_files") \
        .select("storage_path, format, file_type") \
        .eq("id", req.audio_file_id) \
        .single() \
        .execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Audio file not found")

    record = result.data
    storage_path = record["storage_path"]
    content_type = _content_type_for_format(record["format"])

    # 2. Download from Supabase storage
    try:
        file_bytes = supabase.storage \
            .from_("aura-x-audio") \
            .download(storage_path)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to download audio: {str(e)}"
        )

    # 3. Run separation
    result_data = separate_stems(
        audio_bytes=file_bytes,
        track_id=req.track_id,
        generation_id=req.generation_id,
        source_audio_file_id=req.audio_file_id,
        content_type=content_type,
    )

    if result_data["status"] == "error":
        raise HTTPException(status_code=500, detail=result_data["error"])

    return JSONResponse(result_data)


@router.get("/status")
def stems_status():
    """Check if Demucs is available"""
    return {
        "demucs_available": DEMUCS_AVAILABLE,
        "message": "Ready" if DEMUCS_AVAILABLE else
                   "Demucs not installed — run: pip install demucs torch torchaudio"
    }


def _content_type_for_format(fmt: str) -> str:
    return {
        "wav":  "audio/wav",
        "mp3":  "audio/mpeg",
        "flac": "audio/flac",
    }.get(fmt, "audio/wav")
