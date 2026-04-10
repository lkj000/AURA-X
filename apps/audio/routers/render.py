from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
from services.render_pipeline import run_full_render

router = APIRouter(prefix="/render", tags=["render"])


class RenderRequest(BaseModel):
    raw_audio_file_id: str
    track_id: str
    subgenre: str
    generation_id: Optional[str] = None


@router.post("/full")
async def full_render(req: RenderRequest):
    """Run the complete production pipeline: raw audio → stems → log drum → mix → master."""
    result = run_full_render(
        raw_audio_file_id=req.raw_audio_file_id,
        track_id=req.track_id,
        subgenre=req.subgenre,
        generation_id=req.generation_id,
    )
    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["error"])
    return JSONResponse(result)


@router.get("/status")
def render_status():
    """Check pipeline component availability."""
    statuses = {}
    try:
        import demucs  # noqa: F401
        statuses["demucs"] = True
    except ImportError:
        statuses["demucs"] = False
    try:
        import librosa  # noqa: F401
        statuses["librosa"] = True
    except ImportError:
        statuses["librosa"] = False
    try:
        import pedalboard  # noqa: F401
        statuses["pedalboard"] = True
    except ImportError:
        statuses["pedalboard"] = False

    all_ready = all(statuses.values())
    return {
        "ready": all_ready,
        "components": statuses,
        "pipeline": ["stems", "log_drum", "mix", "master"],
    }
