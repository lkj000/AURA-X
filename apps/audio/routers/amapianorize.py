from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from services.amapianorize.source_analyzer import (
    analyze_source, LIBROSA_AVAILABLE
)

router = APIRouter(prefix="/amapianorize", tags=["amapianorize"])


class SourceAnalysisRequest(BaseModel):
    audio_file_id: str
    track_id: str


@router.post("/analyze")
async def analyze(req: SourceAnalysisRequest):
    result = analyze_source(
        audio_file_id=req.audio_file_id,
        track_id=req.track_id,
    )
    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["error"])
    return JSONResponse(result)


@router.get("/status")
def amapianorize_status():
    return {
        "librosa_available": LIBROSA_AVAILABLE,
        "pipeline_stages": [
            "analyze", "separate", "groove_inject",
            "log_drum_synthesis", "harmonic_anchor",
            "reconstruct", "blend"
        ],
        "supported_source_characters": [
            "amapiano_adjacent", "deep_house", "electronic",
            "rnb_soul", "afrobeats", "hip_hop", "other"
        ],
    }
