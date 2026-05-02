"""
Intelligence Router — all five superior capabilities exposed over HTTP.

Endpoints:
  POST /intelligence/synthesize    → full CTL from goal (Markov + voice-leading + adaptive)
  POST /intelligence/optimize      → perception optimization (C1/C2/C3 guarantee)
  POST /intelligence/groove        → Markov groove generation
  POST /intelligence/harmony       → voice-leading voicings
  POST /intelligence/evaluate      → CTL evaluation + optional audio alignment
  POST /intelligence/feedback      → record evaluation result (trains adaptive profiles)
  GET  /intelligence/profiles/{lane} → current learned lane profile
  GET  /intelligence/health        → health check
"""

from __future__ import annotations
import time
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.intelligence.ctl_synthesizer import synthesize_ctl
from ..services.intelligence.ctl_optimizer import optimize_ctl
from ..services.intelligence.markov_groove import MarkovGrooveGenerator
from ..services.intelligence.voice_leading import (
    plan_voice_leading, LANE_MODES, LANE_DEGREE_SEQUENCES,
)
from ..services.intelligence.adaptive_profiles import AdaptiveProfileStore
from ..services.intelligence.perception_engine import (
    predict_ctl_state, measure_audio_perception,
)

router = APIRouter(prefix="/intelligence", tags=["intelligence"])

# ── Singletons shared across all requests ────────────────────────────────────
_groove_gen    = MarkovGrooveGenerator()
_profile_store = AdaptiveProfileStore()


# ── /synthesize ───────────────────────────────────────────────────────────────

class SynthesizeReq(BaseModel):
    title: str
    lane: str
    bpm: Optional[float] = None
    key: Optional[str] = None
    emotional_profile: Optional[str] = None
    created_by: str = "okovanggo_ai"
    generation_mode: str = "mode_1_suno"
    temperature: float = Field(default=0.4, ge=0.0, le=2.0)
    seed: Optional[int] = None

class SynthesizeResp(BaseModel):
    ctl: dict
    groove_novel: bool
    voicings: list[dict]
    perception_state: str
    converged: bool
    synthesis_ms: float

@router.post("/synthesize", response_model=SynthesizeResp)
async def synthesize(req: SynthesizeReq) -> SynthesizeResp:
    t0 = time.monotonic()
    ctl = synthesize_ctl(
        title=req.title, lane=req.lane, bpm=req.bpm, key=req.key,
        emotional_profile=req.emotional_profile, created_by=req.created_by,
        generation_mode=req.generation_mode, temperature=req.temperature,
        seed=req.seed, profile_store=_profile_store,
    )
    ctl = optimize_ctl(ctl, profile_store=_profile_store)
    report = predict_ctl_state(ctl)
    opt    = ctl.get("_perception_optimization", {})
    meta   = ctl.get("_meta", {})
    return SynthesizeResp(
        ctl=ctl,
        groove_novel=meta.get("groove_novel", False),
        voicings=meta.get("voicings", []),
        perception_state=report.state,
        converged=opt.get("converged", report.state == "harmonic"),
        synthesis_ms=round((time.monotonic() - t0) * 1000, 1),
    )


# ── /optimize ─────────────────────────────────────────────────────────────────

class OptimizeReq(BaseModel):
    ctl: dict

class OptimizeResp(BaseModel):
    ctl: dict
    converged: bool
    iterations: int
    initial_state: str
    final_state: str
    mutations_applied: list[str]
    violations: list[str]

@router.post("/optimize", response_model=OptimizeResp)
async def optimize(req: OptimizeReq) -> OptimizeResp:
    result = optimize_ctl(req.ctl, profile_store=_profile_store)
    opt = result.get("_perception_optimization", {})
    return OptimizeResp(
        ctl=result,
        converged=opt.get("converged", False),
        iterations=opt.get("iterations", 0),
        initial_state=opt.get("initial_state", "unknown"),
        final_state=opt.get("final_state", "unknown"),
        mutations_applied=opt.get("mutations_applied", []),
        violations=opt.get("violations", []),
    )


# ── /groove ───────────────────────────────────────────────────────────────────

class GrooveReq(BaseModel):
    lane: str
    temperature: float = Field(default=0.5, ge=0.0, le=2.0)
    seed: Optional[int] = None
    count: int = Field(default=1, ge=1, le=8)

class GrooveResp(BaseModel):
    grooves: list[dict]

@router.post("/groove", response_model=GrooveResp)
async def generate_groove(req: GrooveReq) -> GrooveResp:
    grooves = []
    for i in range(req.count):
        s = (req.seed + i) if req.seed is not None else None
        g = _groove_gen.generate(req.lane, temperature=req.temperature, seed=s)
        grooves.append({
            "id": g.id, "label": g.label, "steps": g.steps,
            "microtiming": g.microtiming, "velocity": g.velocity,
            "swing": g.swing, "is_novel": g.is_novel,
        })
    return GrooveResp(grooves=grooves)


# ── /harmony ──────────────────────────────────────────────────────────────────

class HarmonyReq(BaseModel):
    root: str
    lane: str
    with_seventh: bool = True

class HarmonyResp(BaseModel):
    voicings: list[dict]
    mode: str
    degrees: list[int]
    chord_names: list[str]

@router.post("/harmony", response_model=HarmonyResp)
async def plan_harmony(req: HarmonyReq) -> HarmonyResp:
    import random
    mode    = LANE_MODES.get(req.lane, "aeolian")
    seqs    = LANE_DEGREE_SEQUENCES.get(req.lane, [[0, 5, 6, 0]])
    degrees = random.choice(seqs)
    voicings = plan_voice_leading(req.root, mode, degrees, req.with_seventh)
    return HarmonyResp(
        voicings=[{
            "chord_name": v.chord_name,
            "degree_name": v.degree_name,
            "degree": v.degree,
            "midi_notes": v.midi_notes,
            "bass_note": v.bass_note,
            "pitch_classes": v.pitch_classes,
        } for v in voicings],
        mode=mode,
        degrees=degrees,
        chord_names=[v.chord_name for v in voicings],
    )


# ── /evaluate ─────────────────────────────────────────────────────────────────

class EvaluateReq(BaseModel):
    ctl: dict
    audio_features: Optional[dict] = None

class EvaluateResp(BaseModel):
    ctl_state: str
    c1_pass: bool
    c2_pass: bool
    c3_pass: bool
    violations: list[str]
    b_eff: float
    transient_density: float
    audio_state: Optional[str] = None
    ctl_alignment: Optional[float] = None
    calibration_drift: Optional[float] = None
    recommendation: str

@router.post("/evaluate", response_model=EvaluateResp)
async def evaluate(req: EvaluateReq) -> EvaluateResp:
    report = predict_ctl_state(req.ctl)
    audio_state = ctl_alignment = drift = None

    if req.audio_features:
        meas = measure_audio_perception(req.audio_features, report)
        audio_state   = meas.state_audio
        ctl_alignment = meas.ctl_alignment
        drift         = meas.calibration_drift

    rec = (
        "PASS — harmonic state confirmed" if report.state == "harmonic" else
        f"FAIL — run /intelligence/optimize; violations: {'; '.join(report.violations)}"
    )

    return EvaluateResp(
        ctl_state=report.state, c1_pass=report.c1_pass,
        c2_pass=report.c2_pass, c3_pass=report.c3_pass,
        violations=report.violations,
        b_eff=report.params.b_eff,
        transient_density=report.params.transient_density,
        audio_state=audio_state, ctl_alignment=ctl_alignment,
        calibration_drift=drift, recommendation=rec,
    )


# ── /feedback ─────────────────────────────────────────────────────────────────

class FeedbackReq(BaseModel):
    lane: str
    bpm: float
    composite_score: float
    passed: bool
    b_eff: Optional[float] = None
    transient_density: Optional[float] = None
    energy: Optional[float] = None

@router.post("/feedback")
async def record_feedback(req: FeedbackReq) -> dict:
    _profile_store.record_evaluation(
        lane=req.lane, bpm=req.bpm,
        composite_score=req.composite_score, passed=req.passed,
        b_eff=req.b_eff, transient_density=req.transient_density,
        energy=req.energy,
    )
    count = _profile_store.evaluation_count(req.lane)
    conf  = _profile_store.get(req.lane, "bpm").confidence
    return {
        "recorded": True,
        "lane": req.lane,
        "total_evaluations": count,
        "bpm_confidence": round(conf, 3),
    }


# ── /profiles/{lane} ─────────────────────────────────────────────────────────

@router.get("/profiles/{lane}")
async def get_profile(lane: str) -> dict:
    return {
        "lane": lane,
        "profile": _profile_store.get_lane_profile(lane),
        "pass_rate": _profile_store.get_pass_rate(lane),
        "evaluation_count": _profile_store.evaluation_count(lane),
    }


# ── /health ──────────────────────────────────────────────────────────────────

@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "engine": "aura_x_python_intelligence_v1"}
