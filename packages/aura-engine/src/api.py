"""
AURA Engine API — POST /analyse, POST /synthesize-goal, GET /health.

POST /analyse
  Accepts: WAV file (multipart form-data, field "audio")
  Returns: full CTL + perception report + cultural classification + quality score

POST /synthesize-goal
  Accepts: JSON {lane, title, bpm?, key?, generation_mode?, created_by?}
  Returns: CTL from lane acoustic priors (cold start, no audio required)

GET /classify-features
  Accepts: JSON 7-feature vector
  Returns: classification result + probabilities

GET /health
  Returns: {"status": "ok", "engine": "aura-engine", "version": "1.0.0"}
"""

from __future__ import annotations
import io
import struct
import wave
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .ctl_generator import from_audio, from_goal
from .culture import classify, LANES
from .perception import measure

app = FastAPI(title="AURA Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / response models ─────────────────────────────────────────────────

class GoalRequest(BaseModel):
    lane:            str
    title:           str = "Untitled"
    bpm:             Optional[float] = None
    key:             Optional[str]   = None
    generation_mode: str = "mode_1_suno"
    created_by:      str = "aura-engine"


class ClassifyRequest(BaseModel):
    bpm:                 float
    b_eff:               float
    swing_ratio:         float = Field(default=1.0)
    transient_density:   float
    key_mode:            str   = Field(default="minor", pattern="^(major|minor)$")
    microtiming_std_ms:  float = Field(default=8.0)
    tempo_stability:     float = Field(default=0.7)
    temperature:         float = Field(default=2.0)


class AnalyseResponse(BaseModel):
    ctl:                    dict[str, Any]
    lane:                   str
    perception_state:       str
    quality_score:          float
    bpm_measured:           Optional[float]
    key_measured:           Optional[str]
    classification_confidence: Optional[float]
    classification_probabilities: dict[str, float]
    violations:             list[str]
    synthesis_ms:           int


class GoalResponse(BaseModel):
    ctl:              dict[str, Any]
    lane:             str
    perception_state: str
    synthesis_ms:     int


# ── WAV parsing ───────────────────────────────────────────────────────────────

def _load_wav(data: bytes) -> tuple[np.ndarray, int]:
    """Parse WAV bytes → (float32 mono array, sample_rate)."""
    try:
        buf = io.BytesIO(data)
        with wave.open(buf) as wf:
            sr        = wf.getframerate()
            n_frames  = wf.getnframes()
            n_ch      = wf.getnchannels()
            samp_w    = wf.getsampwidth()
            raw       = wf.readframes(n_frames)

        if samp_w == 2:
            samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
        elif samp_w == 4:
            samples = np.frombuffer(raw, dtype=np.int32).astype(np.float32) / 2147483648.0
        elif samp_w == 3:
            # 24-bit — unpack manually
            n = len(raw) // 3
            arr = np.zeros(n, dtype=np.int32)
            for i in range(n):
                b0, b1, b2 = raw[3*i], raw[3*i+1], raw[3*i+2]
                val = (b2 << 16) | (b1 << 8) | b0
                if val >= 0x800000:
                    val -= 0x1000000
                arr[i] = val
            samples = arr.astype(np.float32) / 8388608.0
        else:
            raise ValueError(f"Unsupported sample width: {samp_w}")

        if n_ch > 1:
            samples = samples.reshape(-1, n_ch).mean(axis=1)

        return samples, sr
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid WAV: {exc}")


# ── Routes ────────────────────────────────────────────────────────────────────

@app.post("/analyse", response_model=AnalyseResponse)
async def analyse(audio: UploadFile = File(...)):
    """
    Full analysis pipeline: WAV → features → classify → CTL + perception.
    Accepts WAV file (mono or stereo, 16/24/32-bit PCM, any sample rate).
    """
    raw = await audio.read()
    if len(raw) < 44:
        raise HTTPException(status_code=400, detail="File too small to be a valid WAV")

    samples, sr = _load_wav(raw)

    if len(samples) < sr:  # < 1 second
        raise HTTPException(status_code=400, detail="Audio must be at least 1 second long")

    result = from_audio(samples, sr, title=audio.filename or "Untitled")
    report = measure(samples, sr)

    from .culture import classify_from_features
    classification = classify_from_features(report.features)

    return AnalyseResponse(
        ctl=result.ctl,
        lane=result.lane,
        perception_state=result.perception_state,
        quality_score=report.quality_score,
        bpm_measured=result.bpm_measured,
        key_measured=result.key_measured,
        classification_confidence=result.classification_confidence,
        classification_probabilities=classification.probabilities,
        violations=report.violations,
        synthesis_ms=result.synthesis_ms,
    )


@app.post("/synthesize-goal", response_model=GoalResponse)
async def synthesize_goal(req: GoalRequest):
    """Cold-start CTL from goal: no audio required, uses lane acoustic priors."""
    if req.lane not in LANES:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown lane '{req.lane}'. Valid: {LANES}",
        )

    result = from_goal(
        lane=req.lane,
        title=req.title,
        bpm=req.bpm,
        key=req.key,
        generation_mode=req.generation_mode,
        created_by=req.created_by,
    )

    return GoalResponse(
        ctl=result.ctl,
        lane=result.lane,
        perception_state=result.perception_state,
        synthesis_ms=result.synthesis_ms,
    )


@app.post("/classify-features")
async def classify_features(req: ClassifyRequest):
    """Classify a feature vector into its most probable lane."""
    result = classify(
        bpm=req.bpm,
        b_eff=req.b_eff,
        swing_ratio=req.swing_ratio,
        transient_density=req.transient_density,
        key_mode=req.key_mode,
        microtiming_std_ms=req.microtiming_std_ms,
        tempo_stability=req.tempo_stability,
        temperature=req.temperature,
    )
    return {
        "lane":          result.lane,
        "distance":      result.distance,
        "confidence":    result.confidence,
        "probabilities": result.probabilities,
    }


@app.get("/health")
def health():
    return {"status": "ok", "engine": "aura-engine", "version": "1.0.0"}
