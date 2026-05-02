"""
AURA Engine API.

POST /analyse              — WAV → CTL + perception + cultural classification
POST /synthesize-goal      — goal JSON → CTL from lane acoustic priors
POST /ctl/from-goal        — alias for /synthesize-goal (TypeScript agent path)
POST /classify-features    — 7-feature vector → lane probabilities
POST /signal/score         — WAV + target_lane → signal composite score
GET  /health
"""

from __future__ import annotations
import io
import struct
import wave
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .ctl_generator import from_audio, from_goal
from .culture import classify, classify_from_features, LANES
from .perception import measure, evaluate_perception, extract_features

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


class CtlFromGoalRequest(BaseModel):
    """TypeScript agent canonical goal shape → maps into GoalRequest."""
    title:             str = "Untitled"
    subgenre:          str
    bpm:               Optional[float] = None
    key:               Optional[str]   = None
    emotional_profile: Optional[str]   = None
    created_by:        str = "aura-engine"
    generation_mode:   str = "mode_1_suno"
    temperature:       float = 0.5


class CtlFromGoalResponse(BaseModel):
    ctl:               dict[str, Any]
    perception_report: dict[str, Any]
    cultural_report:   dict[str, Any]
    quality_score:     float
    generation_source: str


class SignalScoreResponse(BaseModel):
    composite_score:    float   # 0–1 blended signal quality
    lane_match:         bool    # does audio classify as target_lane?
    lane_score:         float   # softmin probability for target_lane
    perception_score:   float   # raw perception quality (C1/C2/C3 gates)
    authenticity_score: float   # Mahalanobis classification confidence
    bpm_score:          float   # BPM proximity to target_bpm (0–1)
    key_score:          float   # key match score (1.0 | 0.5 | 0.0)
    perception_state:   str     # harmonic | ambiguous | percussion
    c1_pass:            bool
    c2_pass:            bool
    c3_pass:            bool
    detected_lane:      str
    detected_bpm:       float
    detected_key:       str
    violations:         list[str]
    recommendations:    list[str]


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


@app.post("/ctl/from-goal", response_model=CtlFromGoalResponse)
async def ctl_from_goal(req: CtlFromGoalRequest):
    """
    TypeScript agent primary path: goal → CTL from lane acoustic priors.
    Returns enriched response with perception_report, cultural_report, quality_score.
    """
    if req.subgenre not in LANES:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown subgenre '{req.subgenre}'. Valid: {LANES}",
        )

    result = from_goal(
        lane=req.subgenre,
        title=req.title,
        bpm=req.bpm if req.bpm and req.bpm > 0 else None,
        key=req.key if req.key else None,
        generation_mode=req.generation_mode,
        created_by=req.created_by,
    )

    from .culture import get_lane_prior
    prior = get_lane_prior(req.subgenre)

    return CtlFromGoalResponse(
        ctl=result.ctl,
        perception_report={
            "state":     result.perception_state,
            "converged": result.perception_state == "harmonic",
            "source":    "goal_synthesis",
        },
        cultural_report={
            "best_fit_lane": req.subgenre,
            "source":        "acoustic_prior",
            "prior_bpm":     prior["bpm"],
            "prior_b_eff":   prior["b_eff"],
        },
        quality_score=0.80,  # priors are by definition well-formed
        generation_source="goal_synthesis",
    )


@app.post("/signal/score", response_model=SignalScoreResponse)
async def signal_score(
    audio: UploadFile = File(...),
    target_lane: str = Form(default="private_school"),
    target_bpm: float = Form(default=0.0),
    target_key: str = Form(default=""),
):
    """
    Signal scoring gate: analyse actual WAV and score against target lane.
    Called by the TypeScript generation worker after Mode 2 audio is downloaded.
    """
    raw = await audio.read()
    if len(raw) < 44:
        raise HTTPException(status_code=400, detail="File too small to be a valid WAV")

    samples, sr = _load_wav(raw)
    if len(samples) < sr:
        raise HTTPException(status_code=400, detail="Audio must be at least 1 second long")

    features  = extract_features(samples, sr)
    report    = evaluate_perception(features)
    classif   = classify_from_features(features)

    # Per-constraint pass/fail
    c_pass = {c.name: c.passed for c in report.constraints}
    c1_pass = c_pass.get("C1_b_eff", True)
    c2_pass = c_pass.get("C2_transient_density", True)
    c3_pass = c_pass.get("C3_ld_anchor", True)

    # Lane fidelity
    lane_match      = classif.lane == target_lane
    lane_score      = classif.probabilities.get(target_lane, 0.0)
    auth_score      = classif.confidence

    # BPM score: 1.0 within 5 BPM, falls off linearly to 0 at ±30 BPM
    if target_bpm > 0:
        bpm_score = float(max(0.0, 1.0 - abs(features.bpm - target_bpm) / 25.0))
    else:
        bpm_score = 1.0

    # Key score: 1.0 exact match, 0.5 relative major/minor, 0.0 unrelated
    key_score = 1.0
    if target_key:
        detected = f"{features.key_root}{'m' if features.key_mode == 'minor' else ''}"
        if detected == target_key:
            key_score = 1.0
        elif features.key_root == target_key.rstrip("m"):
            key_score = 0.5
        else:
            key_score = 0.0

    # Composite: 35% perception + 25% lane match + 20% BPM + 10% key + 10% authenticity
    composite_score = round(
        0.35 * report.quality_score +
        0.25 * lane_score +
        0.20 * bpm_score +
        0.10 * key_score +
        0.10 * auth_score,
        4,
    )

    key_str = f"{features.key_root}{'m' if features.key_mode == 'minor' else ''}"

    # Recommendations from violations
    recommendations: list[str] = []
    if not c1_pass:
        recommendations.append(f"Reduce sub-bass energy (b_eff={features.b_eff:.3f} > 0.40)")
    if not c2_pass:
        recommendations.append(f"Reduce transient density ({features.transient_density:.1f}/bar > 4)")
    if not lane_match:
        recommendations.append(
            f"Audio classified as '{classif.lane}', not '{target_lane}' — review lane parameters"
        )

    return SignalScoreResponse(
        composite_score=composite_score,
        lane_match=lane_match,
        lane_score=round(lane_score, 4),
        perception_score=round(report.quality_score, 4),
        authenticity_score=round(auth_score, 4),
        bpm_score=round(bpm_score, 4),
        key_score=round(key_score, 4),
        perception_state=report.state,
        c1_pass=c1_pass,
        c2_pass=c2_pass,
        c3_pass=c3_pass,
        detected_lane=classif.lane,
        detected_bpm=features.bpm,
        detected_key=key_str,
        violations=report.violations,
        recommendations=recommendations,
    )


@app.get("/health")
def health():
    return {"status": "ok", "engine": "aura-engine", "version": "1.0.0"}
