from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
from services.mixer import render_mix, PEDALBOARD_AVAILABLE
from services.mix_presets import get_mix_preset

router = APIRouter(prefix="/mix", tags=["mix"])


class MixRequest(BaseModel):
    track_id: str
    subgenre: str
    stem_file_ids: dict
    generation_id: Optional[str] = None


@router.post("/render")
async def mix_render(req: MixRequest):
    """
    Mix stems into a stereo master using pedalboard channel strips.
    stem_file_ids: {"drums": id, "bass": id, "vocals": id, "other": id, "log_drum"?: id}
    """
    result = render_mix(
        stem_file_ids=req.stem_file_ids,
        track_id=req.track_id,
        subgenre=req.subgenre,
        generation_id=req.generation_id,
    )
    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["error"])
    return JSONResponse(result)


@router.get("/presets")
def list_presets():
    """List all available mix presets and their subgenre mappings."""
    subgenres = [
        "private_school", "bacardi", "sgija",
        "stixx_sgija", "mbiraiano", "gqom_fusion",
    ]
    return {
        "presets": [
            {"subgenre": sg, "name": get_mix_preset(sg).name}
            for sg in subgenres
        ],
        "pedalboard_available": PEDALBOARD_AVAILABLE,
    }
