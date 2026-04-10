from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from services.analyzer import analyze_audio, LIBROSA_AVAILABLE

router = APIRouter(prefix="/analysis", tags=["analysis"])


class AnalysisRequest(BaseModel):
    audio_file_id: str
    track_id: str


@router.post("/analyze")
async def analyze(req: AnalysisRequest):
    """Analyze audio file: BPM, key, mode, energy, onset density."""
    result = analyze_audio(
        audio_file_id=req.audio_file_id,
        track_id=req.track_id,
    )
    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["error"])
    return JSONResponse(result)


@router.get("/status")
def analysis_status():
    """Check analyzer availability and supported features."""
    return {
        "librosa_available": LIBROSA_AVAILABLE,
        "features": ["bpm", "key", "mode", "energy", "onset_density"],
        "key_algorithm": "krumhansl_schmuckler",
    }
