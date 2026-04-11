from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from services.amapianorize.source_analyzer import (
    analyze_source, LIBROSA_AVAILABLE
)
from services.amapianorize.rhythm_transplant import (
    transplant_rhythm, GROOVE_TEMPLATES
)

router = APIRouter(prefix="/amapianorize", tags=["amapianorize"])


class SourceAnalysisRequest(BaseModel):
    audio_file_id: str
    track_id: str


class RhythmTransplantRequest(BaseModel):
    audio_file_id: str
    track_id: str
    target_subgenre: str = "private_school"
    target_bpm: Optional[float] = None
    generation_id: Optional[str] = None


@router.post("/analyze")
async def analyze(req: SourceAnalysisRequest):
    result = analyze_source(
        audio_file_id=req.audio_file_id,
        track_id=req.track_id,
    )
    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["error"])
    return JSONResponse(result)


@router.post("/rhythm-transplant")
async def rhythm_transplant_endpoint(req: RhythmTransplantRequest):
    result = transplant_rhythm(
        audio_file_id=req.audio_file_id,
        track_id=req.track_id,
        target_subgenre=req.target_subgenre,
        target_bpm=req.target_bpm,
        generation_id=req.generation_id,
    )
    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["error"])
    return JSONResponse(result)


@router.get("/grooves")
def list_grooves():
    return {
        "grooves": [
            {
                "subgenre": k,
                "swing": v["swing"],
                "log_drum_positions": v["log_drum_positions"],
            }
            for k, v in GROOVE_TEMPLATES.items()
        ]
    }


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
