from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
from services.master import master_audio, TARGET_LUFS, PEDALBOARD_AVAILABLE

router = APIRouter(prefix="/master", tags=["master"])


class MasterRequest(BaseModel):
    mix_file_id: str
    track_id: str
    subgenre: str
    generation_id: Optional[str] = None


@router.post("/render")
async def master_render(req: MasterRequest):
    """
    Master a mixed stereo file: stereo width → EQ → limiting → LUFS normalization.
    """
    result = master_audio(
        mix_file_id=req.mix_file_id,
        track_id=req.track_id,
        subgenre=req.subgenre,
        generation_id=req.generation_id,
    )
    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["error"])
    return JSONResponse(result)


@router.get("/targets")
def lufs_targets():
    """Return target LUFS values per subgenre."""
    return {
        "targets": TARGET_LUFS,
        "default": -10.0,
        "pedalboard_available": PEDALBOARD_AVAILABLE,
    }
