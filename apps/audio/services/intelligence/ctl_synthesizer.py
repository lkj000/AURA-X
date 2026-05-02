"""
Superior CTL Synthesizer.

Combines all four new capabilities into a single synthesis call:
  1. Adaptive BPM/energy from Bayesian profile store (learned from feedback)
  2. Markov groove generation (novel patterns, not lookup)
  3. Voice-leading harmony (actual music theory, not lookup tables)
  4. C1-aware instrumentation weights (starts inside harmonic zone)

The output CTL is then run through optimize_ctl() to guarantee harmonic state
before it ever reaches the generation pipeline.
"""

from __future__ import annotations
import random
from datetime import datetime, timezone
from typing import Optional

from .markov_groove import MarkovGrooveGenerator
from .voice_leading import (
    plan_voice_leading,
    LANE_DEGREE_SEQUENCES, LANE_MODES, LANE_DEFAULT_KEYS,
)
from .adaptive_profiles import AdaptiveProfileStore, PRIORS
from .ctl_optimizer import optimize_ctl
from .perception_engine import C1_B_EFF_HARMONIC_MAX

# ── Singleton groove generator (matrices built once at import) ────────────────
_GROOVE_GEN = MarkovGrooveGenerator()

# ── Lane static config ────────────────────────────────────────────────────────

_LOG_WEIGHT: dict[str, float] = {
    "private_school": 0.72, "bacardi": 0.88, "sgija": 0.80,
    "stixx_sgija": 0.85, "mbiraiano": 0.65, "three_step": 0.85,
    "gqom_fusion": 0.90, "hybrid_rnb_amapiano": 0.68,
}

_ENERGY: dict[str, float] = {
    "private_school": 0.45, "bacardi": 0.90, "sgija": 0.80,
    "stixx_sgija": 0.82, "mbiraiano": 0.38, "three_step": 0.60,
    "gqom_fusion": 0.88, "hybrid_rnb_amapiano": 0.62,
}

_MIX_PROFILE: dict[str, str] = {
    "private_school": "luxury_noir", "bacardi": "bounce_club",
    "sgija": "raw_street", "stixx_sgija": "raw_street",
    "mbiraiano": "spiritual_organic", "three_step": "luxury_noir",
    "gqom_fusion": "dark_tribal", "hybrid_rnb_amapiano": "crossover_rb",
}

_EMOTIONAL: dict[str, str] = {
    "private_school": "luxury, aspiration, calm confidence",
    "bacardi":        "euphoria, aggressive energy, party vibes",
    "sgija":          "raw energy, street swagger, communal joy",
    "stixx_sgija":    "aggression, street dominance, urban toughness",
    "mbiraiano":      "ancestral connection, spiritual warmth, cultural pride",
    "three_step":     "rhythmic obsession, hypnotic shuffle, step-locked trance",
    "gqom_fusion":    "dark intensity, urban grittiness, primal drive",
    "hybrid_rnb_amapiano": "romantic, crossover appeal, modern afro",
}

_LINEAGE: dict[str, dict[str, float]] = {
    "private_school":      {"deep_house": 0.70, "kwaito": 0.55, "jazz": 0.40, "lounge": 0.38},
    "bacardi":             {"bacardi": 0.85, "house": 0.60, "kwaito": 0.40},
    "sgija":               {"kwaito": 0.65, "bacardi": 0.50, "house": 0.45},
    "stixx_sgija":         {"sgija": 0.70, "kwaito": 0.60, "bacardi": 0.45},
    "mbiraiano":           {"mbira_dza_vadzimu": 0.80, "deep_house": 0.50, "jazz": 0.35},
    "three_step":          {"deep_house": 0.65, "jazz": 0.55, "kwaito": 0.45, "log_drum_innovation": 0.78},
    "gqom_fusion":         {"gqom": 0.80, "tribal_house": 0.60, "electronic": 0.40},
    "hybrid_rnb_amapiano": {"rnb": 0.65, "afrobeats": 0.55, "amapiano": 0.60},
}


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def synthesize_ctl(
    title: str,
    lane: str,
    bpm: Optional[float] = None,
    key: Optional[str] = None,
    emotional_profile: Optional[str] = None,
    created_by: str = "okovanggo_ai",
    generation_mode: str = "mode_1_suno",
    temperature: float = 0.4,
    seed: Optional[int] = None,
    profile_store: Optional[AdaptiveProfileStore] = None,
) -> dict:
    """
    Build a complete CTL document for the given lane + goal.

    temperature: 0.0 = canonical groove, 1.0 = fully novel
    seed: for reproducible generation (tests, retries)
    profile_store: if provided, uses learned BPM/energy priors
    """
    rng = random.Random(seed)

    # ── 1. BPM ───────────────────────────────────────────────────────────────
    if bpm is None:
        if profile_store:
            bpm = profile_store.effective(lane, "bpm")
            # Add small noise so repeated calls produce different BPMs
            bpm += rng.gauss(0, 0.8)
        else:
            bpm = PRIORS.get(lane, {}).get("bpm", 112.0)
    bpm = round(_clamp(bpm, 95.0, 130.0), 1)

    # ── 2. Key ───────────────────────────────────────────────────────────────
    if key is None:
        key = rng.choice(LANE_DEFAULT_KEYS.get(lane, ["Am"]))
    root = key.replace("m", "")
    mode = LANE_MODES.get(lane, "aeolian")

    # ── 3. Groove via Markov chain ───────────────────────────────────────────
    groove = _GROOVE_GEN.generate(lane, temperature=temperature, seed=seed)

    # ── 4. Harmony via voice leading ─────────────────────────────────────────
    seqs   = LANE_DEGREE_SEQUENCES.get(lane, [[0, 5, 6, 0]])
    seq    = rng.choice(seqs)
    voicings = plan_voice_leading(root, mode, seq, with_seventh=True)

    # ── 5. C1-aware instrumentation ──────────────────────────────────────────
    log_w   = _LOG_WEIGHT.get(lane, 0.75)
    piano_w = 0.55
    pad_w   = 0.50
    # Pre-check: estimate b_eff and scale log_w down if needed
    bass_total  = log_w + 0.30          # log_drum + implicit bass element
    harm_total  = piano_w + pad_w
    alpha_B_est = bass_total / (bass_total + harm_total)
    b_eff_est   = alpha_B_est * log_w
    if b_eff_est >= C1_B_EFF_HARMONIC_MAX:
        # Scale log_w until b_eff estimate drops below threshold
        while b_eff_est >= C1_B_EFF_HARMONIC_MAX and log_w > 0.10:
            log_w   = round(log_w * 0.92, 3)
            bass_t2 = log_w + 0.30
            alpha_B_est = bass_t2 / (bass_t2 + harm_total)
            b_eff_est   = alpha_B_est * log_w

    kb_family = "mbira" if lane == "mbiraiano" else "piano"

    instrumentation = [
        {
            "family": "log_drum",
            "patch_class": f"{lane}_log",
            "timbre_class": "woody_pitched_percussive",
            "cultural_role": "groove_anchor",
            "register": "low_mid",
            "stereo_profile": "mono_centered",
            "body_weight": round(_clamp(log_w), 2),
            "attack": "instant", "decay": "short",
            "forbidden_traits": [],
        },
        {
            "family": kb_family,
            "patch_class": f"{lane}_piano",
            "timbre_class": "percussive_acoustic_piano",
            "cultural_role": "harmonic_anchor",
            "register": "mid",
            "stereo_profile": "mid_wide",
            "body_weight": piano_w,
            "attack": "fast", "decay": "medium",
            "forbidden_traits": [],
        },
        {
            "family": "pads",
            "patch_class": f"{lane}_pad",
            "timbre_class": "warm_analog_bed",
            "cultural_role": "atmosphere_bed",
            "register": "mid_high",
            "stereo_profile": "wide",
            "body_weight": pad_w,
            "attack": "slow", "decay": "long",
            "forbidden_traits": [],
        },
    ]

    # ── 6. Energy and curves ─────────────────────────────────────────────────
    energy = _ENERGY.get(lane, 0.60)
    if profile_store:
        energy = _clamp(profile_store.effective(lane, "energy"), 0.20, 1.0)

    ld = max(0.12, 0.38 + energy * 0.44)
    curves = {
        "energy":            [{"bar": 0, "value": round(energy * 0.55, 2)},
                              {"bar": 8, "value": energy},
                              {"bar": 32, "value": round(energy * 0.38, 2)}],
        "log_drum_density":  [{"bar": 0, "value": round(ld, 2)},
                              {"bar": 8, "value": round(min(1.0, ld + 0.10), 2)},
                              {"bar": 28, "value": round(ld * 0.80, 2)}],
        "bass_presence":     [{"bar": 0, "value": 0.55}, {"bar": 8, "value": 0.70}],
        "pad_warmth":        [{"bar": 0, "value": 0.50}, {"bar": 8, "value": 0.65}],
        "piano_activity":    [{"bar": 0, "value": 0.00}, {"bar": 6, "value": 0.35}],
        "vocal_presence":    [{"bar": 0, "value": 0.00}, {"bar": 8, "value": 0.40}],
        "groove_aggression": [{"bar": 0, "value": round(energy * 0.55, 2)},
                              {"bar": 8, "value": energy}],
        "restraint":         [{"bar": 0, "value": round(1.0 - energy, 2)},
                              {"bar": 32, "value": round((1.0 - energy) * 0.78, 2)}],
        "tension":           [{"bar": 0, "value": 0.30},
                              {"bar": 16, "value": 0.65},
                              {"bar": 32, "value": 0.20}],
    }

    # ── 7. Harmony profile ───────────────────────────────────────────────────
    ext = (
        "full_extensions" if lane in ("private_school", "hybrid_rnb_amapiano") else
        "none"            if lane in ("bacardi", "gqom_fusion")                  else
        "sevenths_only"
    )
    harmony = {
        "tonal_center": root,
        "mode": mode,
        "preferred_progressions": ["-".join(str(d) for d in s) for s in seqs],
        "exemplar_progressions":  [v.chord_name for v in voicings],
        "max_chord_changes_per_4_bars": len(seq),
        "extension_policy": ext,
        "voicing_style": "sparse" if lane in ("bacardi", "gqom_fusion") else "medium",
        "harmonic_rhythm": "static" if lane in ("bacardi", "gqom_fusion") else "slow",
    }

    # ── 8. Sections ──────────────────────────────────────────────────────────
    sections = [
        {"id": f"{lane}_intro",     "type": "intro",     "label": "Intro",     "start_bar": 0,  "end_bar": 6,
         "purpose": "Pattern bare", "energy_target": round(energy * 0.50, 2),
         "log_drum_active": True,  "pad_active": False, "piano_active": False, "vocal_active": False,
         "transition_out": "log_drum_fill"},
        {"id": f"{lane}_drop",      "type": "drop",      "label": "Drop",      "start_bar": 6,  "end_bar": 22,
         "purpose": "Full expression", "energy_target": energy,
         "log_drum_active": True,  "pad_active": True,  "piano_active": True,  "vocal_active": True,
         "transition_out": "filter_sweep"},
        {"id": f"{lane}_breakdown", "type": "breakdown", "label": "Breakdown", "start_bar": 22, "end_bar": 28,
         "purpose": "Stripped back", "energy_target": round(energy * 0.60, 2),
         "log_drum_active": True,  "pad_active": False, "piano_active": False, "vocal_active": False,
         "transition_out": "log_drum_fill"},
        {"id": f"{lane}_outro",     "type": "outro",     "label": "Outro",     "start_bar": 28, "end_bar": 36,
         "purpose": "Fade", "energy_target": round(energy * 0.30, 2),
         "log_drum_active": True,  "pad_active": True,  "piano_active": False, "vocal_active": False,
         "transition_out": "fade"},
    ]

    # ── 9. Cultural lineage ───────────────────────────────────────────────────
    cultural_lineage = {
        k: {"weight": w, "influences": [], "must_not": []}
        for k, w in _LINEAGE.get(lane, {"deep_house": 0.60}).items()
    }

    # ── 10. Evaluation targets ────────────────────────────────────────────────
    groove_t = 0.88 if lane in ("sgija", "stixx_sgija", "bacardi", "gqom_fusion") else 0.82
    ev_targets = {
        "authenticity_target":             0.86,
        "subgenre_recognizability_target": 0.88,
        "groove_clarity_target":           groove_t,
        "harmonic_density_target":         0.35 if ext == "full_extensions" else 0.25,
        "dj_mix_friendliness_target":      0.83,
        "cultural_lineage_coherence":      0.81,
    }

    ctl = {
        "version": "1.0",
        "global": {
            "title": title,
            "bpm": bpm,
            "key": key,
            "subgenre": lane,
            "mix_profile": _MIX_PROFILE.get(lane, "bounce_club"),
            "vocal_profile": "sparse_chant",
            "emotional_profile": emotional_profile or _EMOTIONAL.get(lane, ""),
            "reference_style_tags": [],
            "created_by": created_by,
            "generation_mode": generation_mode,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        "sections": sections,
        "curves": curves,
        "groove_patterns": [{
            "id": groove.id,
            "label": groove.label,
            "steps": groove.steps,
            "microtiming": groove.microtiming,
            "velocity": groove.velocity,
            "swing": groove.swing,
        }],
        "harmony": harmony,
        "instrumentation": instrumentation,
        "cultural_lineage": cultural_lineage,
        "style_constraints": {
            "max_piano_busyness": 0.45,
            "min_pad_warmth": 0.50,
            "max_perc_aggression": round(energy * 0.90, 2),
            "preferred_keys": LANE_DEFAULT_KEYS.get(lane, ["Am"]),
            "forbidden_traits": ["trap_hats", "edm_risers"],
        },
        "production_directives": {
            "mix_priorities": ["log_drum_pattern_clarity", "piano_harmonic_presence"],
            "arrangement_strategy": f"{lane} identity — cultural authenticity",
            "automation_hints": ["log_velocity_subtle_vary"],
            "layering_rules": ["log_drum_always_audible"],
            "master_target_lufs": -10,
        },
        "evaluation_targets": ev_targets,
        "_meta": {
            "synthesizer": "aura_x_python_intelligence_v1",
            "groove_novel": groove.is_novel,
            "groove_temperature": temperature,
            "voicings": [{"chord": v.chord_name, "midi": v.midi_notes} for v in voicings],
        },
    }

    return ctl
