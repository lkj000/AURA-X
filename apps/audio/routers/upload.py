from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from datetime import datetime
import uuid
from lib.supabase_client import supabase

router = APIRouter(prefix="/audio", tags=["audio"])

ALLOWED_FORMATS = {"audio/wav", "audio/mpeg", "audio/flac", "audio/ogg", "audio/mp4"}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB


@router.post("/upload")
async def upload_audio(
    file: UploadFile = File(...),
    track_id: str = Form(...),
    generation_id: str = Form(None),
    file_type: str = Form("raw_generation"),
):
    # 1. Validate content type
    if file.content_type not in ALLOWED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format: {file.content_type}. "
                   f"Allowed: {', '.join(ALLOWED_FORMATS)}",
        )

    # 2. Read file content
    content = await file.read()

    # 3. Check file size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large: {len(content)} bytes. Max: {MAX_FILE_SIZE}",
        )

    # 4. Build storage path
    ext = _ext_for_content_type(file.content_type)
    file_id = str(uuid.uuid4())
    storage_path = f"{track_id}/{file_type}/{file_id}{ext}"

    # 5. Upload to Supabase storage
    try:
        supabase.storage.from_("aura-x-audio").upload(
            path=storage_path,
            file=content,
            file_options={"content-type": file.content_type},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {str(e)}")

    # 6. Write metadata to audio_files table
    record = {
        "id": file_id,
        "track_id": track_id,
        "generation_id": generation_id,
        "file_type": file_type,
        "storage_path": storage_path,
        "format": ext.lstrip("."),
        "file_size_bytes": len(content),
        "metadata": {
            "original_filename": file.filename,
            "content_type": file.content_type,
        },
    }
    result = supabase.table("audio_files").insert(record).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to write audio_files record")

    # ─── Link to generation if provided ──────────────
    if generation_id:
        try:
            supabase.table("generations").update({
                "status": "complete",
                "completed_at": datetime.utcnow().isoformat() + "Z"
            }).eq("id", generation_id).execute()
        except Exception as e:
            # Non-fatal: log but don't fail the upload
            print(f"[upload] Warning: could not update generation {generation_id}: {e}")

    return JSONResponse({
        "status": "ok",
        "audio_file_id": file_id,
        "track_id": track_id,
        "generation_id": generation_id,
        "file_type": file_type,
        "storage_path": storage_path,
        "file_size_bytes": len(content),
        "format": ext.lstrip("."),
    })


@router.get("/signed-url/{audio_file_id}")
async def get_signed_url(audio_file_id: str, expires_in: int = 3600):
    """Get a signed download URL for an audio file"""
    result = (
        supabase.table("audio_files")
        .select("storage_path")
        .eq("id", audio_file_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Audio file not found")

    storage_path = result.data["storage_path"]
    signed = supabase.storage.from_("aura-x-audio").create_signed_url(
        storage_path, expires_in
    )
    return {"signed_url": signed["signedURL"], "expires_in": expires_in}


def _ext_for_content_type(ct: str) -> str:
    return {
        "audio/wav":  ".wav",
        "audio/mpeg": ".mp3",
        "audio/flac": ".flac",
        "audio/ogg":  ".ogg",
        "audio/mp4":  ".m4a",
    }.get(ct, ".bin")
