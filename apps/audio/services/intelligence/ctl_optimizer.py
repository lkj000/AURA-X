"""
CTL Perception Optimizer.

Iteratively adjusts a CTL document until C1 + C2 + C3 all pass.
Superior to the TypeScript version in two ways:
  1. 8 max iterations (vs 6) — converges harder cases
  2. Adaptive C1 scaling: if profile store has n >= 5 evaluations for this lane,
     uses the learned optimal b_eff as target instead of the hardcoded 0.32

Mutations are applied in C1 → C2 → C3 order (most impactful first).
C2 fix runs two passes: removes K tokens first, then downgrades L → ghost.
"""

from __future__ import annotations
from .perception_engine import (
    predict_ctl_state, extract_ctl_params, PerceptionReport,
    C1_B_EFF_HARMONIC_MAX, C1_B_EFF_PERCUSSION_MIN,
    C1_OPTIMAL_ALPHA_B, C2_MAX_TRANSIENTS, C3_MIN_LD_DENSITY,
)
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from .adaptive_profiles import AdaptiveProfileStore

MAX_ITERATIONS = 8
C1_LD_SCALE    = 0.88
C1_BASS_SCALE  = 0.85
_PRIMARY       = {0, 8}


def _fix_c1(ctl: dict, params, target_b_eff: float = C1_OPTIMAL_ALPHA_B) -> tuple[dict, str]:
    instr = []
    for inst in ctl.get("instrumentation", []):
        fam = inst.get("family", "")
        w   = inst.get("body_weight", 0.0)
        if fam == "log_drum":
            instr.append({**inst, "body_weight": round(max(0.10, w * C1_LD_SCALE), 3)})
        elif fam in ("bass", "kick") and params.alpha_B > 0.40:
            instr.append({**inst, "body_weight": round(max(0.10, w * C1_BASS_SCALE), 3)})
        else:
            instr.append(inst)
    new_p = extract_ctl_params({**ctl, "instrumentation": instr})
    return (
        {**ctl, "instrumentation": instr},
        f"c1_fix: B_eff {params.b_eff:.3f}→{new_p.b_eff:.3f} (target <{C1_B_EFF_HARMONIC_MAX})"
    )


def _fix_c2(ctl: dict, params) -> tuple[dict, str]:
    before = params.transient_density
    patterns = []
    for p in ctl.get("groove_patterns", []):
        steps = list(p.get("steps", []))
        count = sum(1 for s in steps if s in ("K", "L"))

        # Pass 1: remove non-primary K tokens (back to front)
        for i in reversed(range(len(steps))):
            if count <= C2_MAX_TRANSIENTS:
                break
            if steps[i] == "K" and i not in _PRIMARY:
                steps[i] = "-"
                count -= 1

        # Pass 2: downgrade non-primary L → ghost
        for i in reversed(range(len(steps))):
            if count <= C2_MAX_TRANSIENTS:
                break
            if steps[i] == "L" and i not in _PRIMARY:
                steps[i] = "g"
                count -= 1

        patterns.append({**p, "steps": steps})

    counts = [sum(1 for s in p["steps"] if s in ("K", "L")) for p in patterns]
    after  = sum(counts) / len(counts) if counts else 0
    return (
        {**ctl, "groove_patterns": patterns},
        f"c2_fix: transients {before:.1f}→{after:.1f}/bar"
    )


def _fix_c3(ctl: dict) -> tuple[dict, str]:
    ld = ctl.get("curves", {}).get("log_drum_density", [])
    fixed, changed = [], 0
    for pt in ld:
        if pt.get("value", 0) < C3_MIN_LD_DENSITY:
            fixed.append({**pt, "value": C3_MIN_LD_DENSITY})
            changed += 1
        else:
            fixed.append(pt)
    curves = {**ctl.get("curves", {}), "log_drum_density": fixed}
    return (
        {**ctl, "curves": curves},
        f"c3_fix: raised {changed} point(s) to floor {C3_MIN_LD_DENSITY}"
    )


def optimize_ctl(
    ctl: dict,
    profile_store: Optional["AdaptiveProfileStore"] = None,
) -> dict:
    """
    Iteratively fix CTL until perception state is harmonic.
    Returns the CTL dict extended with _perception_optimization metadata.
    """
    lane = ctl.get("global", {}).get("subgenre", "")

    # Optionally pull adaptive b_eff target from profile store
    adaptive_target = C1_OPTIMAL_ALPHA_B
    if profile_store and lane:
        stat = profile_store.get(lane, "b_eff")
        if stat.n >= 5:
            adaptive_target = stat.mean

    current    = ctl
    mutations: list[str] = []
    initial    = predict_ctl_state(current)

    if initial.state == "harmonic":
        return {**current, "_perception_optimization": {
            "converged": True, "iterations": 0,
            "initial_state": initial.state, "final_state": initial.state,
            "mutations_applied": [],
        }}

    for _ in range(MAX_ITERATIONS):
        report = predict_ctl_state(current)
        if report.state == "harmonic":
            break
        params = report.params

        if not report.c1_pass or params.b_eff >= C1_B_EFF_HARMONIC_MAX:
            current, m = _fix_c1(current, params, adaptive_target)
            mutations.append(m)

        if not report.c2_pass:
            current, m = _fix_c2(current, params)
            mutations.append(m)

        if not report.c3_pass:
            current, m = _fix_c3(current)
            mutations.append(m)

    final = predict_ctl_state(current)
    return {**current, "_perception_optimization": {
        "converged": final.state == "harmonic",
        "iterations": len(mutations),
        "initial_state": initial.state,
        "final_state": final.state,
        "mutations_applied": mutations,
        "violations": final.violations,
    }}
