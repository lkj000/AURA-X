from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from services.set_renderer import render_set, LIBROSA_AVAILABLE

router = APIRouter(prefix="/dj", tags=["dj"])


class RenderSetRequest(BaseModel):
    set_plan: dict
    track_id: str


@router.post("/render")
async def render(req: RenderSetRequest):
    """Render a SetPlan JSON into a continuous DJ mix audio file."""
    result = render_set(
        set_plan=req.set_plan,
        track_id=req.track_id,
    )
    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["error"])
    return JSONResponse(result)


@router.get("/status")
def dj_status():
    """Check DJ engine readiness and capabilities."""
    return {
        "ready": LIBROSA_AVAILABLE,
        "librosa_available": LIBROSA_AVAILABLE,
        "capabilities": [
            "crossfade", "log_drum_sync", "filter_fade", "hard_cut",
        ],
        "amapiano_energy_arc": [
            "entry", "build", "peak", "plateau", "exhale",
        ],
    }
