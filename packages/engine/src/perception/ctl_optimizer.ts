// CTL Perception Optimizer — implements the OptimizerLoop from aura-x-engine.
//
// Given a CTL, iteratively adjusts instrumentation weights, groove pattern
// transient density, and log drum density curves until the CTL predicts a
// harmonic perception state (C1 + C2 + C3 all satisfied).
//
// This runs BEFORE audio generation — no audio rendering required.
// The agent pipeline becomes:
//
//   synthesizeCtlFromGoal → optimizeCTLForHarmonicState → applyHarmonyPlan → generate

import type { CTLv1 } from "@aura-x/ctl";
import { clamp } from "../_utils";
import {
  predictCTLPerceptionState,
  extractCTLPerceptionParams,
  C1_B_EFF_HARMONIC_MAX,
  C1_OPTIMAL_ALPHA_B,
  C2_MAX_TRANSIENTS,
  C3_MIN_LD_DENSITY,
} from "./ctl_perception_bridge";
import type { CTLPerceptionReport } from "./ctl_perception_bridge";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PerceptionOptimizationResult {
  ctl:               CTLv1;
  converged:         boolean;
  iterations:        number;
  initial_state:     CTLPerceptionReport;
  final_state:       CTLPerceptionReport;
  mutations_applied: string[];
}

// ── C1 fix: reduce bass dominance ─────────────────────────────────────────────
// Scale down log_drum body_weight so that alpha_B × gain_ld < C1_B_EFF_HARMONIC_MAX.
// If alpha_B is the problem, also soften kick and bass weights.

const C1_LD_SCALE  = 0.88;   // per-iteration scaling factor for log drum
const C1_BASS_SCALE = 0.85;  // per-iteration scaling factor for other bass

function fixC1(ctl: CTLv1, params: ReturnType<typeof extractCTLPerceptionParams>): {
  ctl: CTLv1; mutation: string;
} {
  // Target: alpha_B ≤ C1_OPTIMAL_ALPHA_B (0.32) so b_eff lands safely below 0.40
  const instr = ctl.instrumentation.map(inst => {
    if (inst.family === "log_drum") {
      return { ...inst, body_weight: clamp(inst.body_weight * C1_LD_SCALE) };
    }
    if ((inst.family === "bass" || inst.family === "kick") && params.alpha_B > 0.40) {
      return { ...inst, body_weight: clamp(inst.body_weight * C1_BASS_SCALE) };
    }
    return inst;
  });

  const newB = extractCTLPerceptionParams({ ...ctl, instrumentation: instr }).b_eff;
  return {
    ctl: { ...ctl, instrumentation: instr },
    mutation: `c1_fix: scaled bass family weights → B_eff ${params.b_eff.toFixed(3)}→${newB.toFixed(3)}`,
  };
}

// ── C2 fix: prune transients ──────────────────────────────────────────────────
// Remove non-primary K+L tokens until ≤ 4 per bar.
// Primary positions (0-indexed 16-step bar): 0 (beat 1), 8 (beat 3).
// Pass 1: removes K at non-primary positions.
// Pass 2: removes L at non-primary positions (handles log-drum-dense patterns
//         like three_step where all non-primary K tokens are already gone).

const PRIMARY_TRANSIENT_POSITIONS = new Set([0, 8]);

function fixC2(ctl: CTLv1, params: ReturnType<typeof extractCTLPerceptionParams>): {
  ctl: CTLv1; mutation: string;
} {
  const before = params.transient_density;

  const patterns = ctl.groove_patterns.map(p => {
    const steps = Array.from(p.steps as readonly string[]);
    let count = steps.filter(s => s === "K" || s === "L").length;

    // Pass 1: remove non-primary kicks, back to front
    for (let i = steps.length - 1; i >= 0 && count > C2_MAX_TRANSIENTS; i--) {
      if (steps[i] === "K" && !PRIMARY_TRANSIENT_POSITIONS.has(i)) {
        steps[i] = "-";
        count--;
      }
    }

    // Pass 2: if still over threshold, remove non-primary log drum hits
    for (let i = steps.length - 1; i >= 0 && count > C2_MAX_TRANSIENTS; i--) {
      if (steps[i] === "L" && !PRIMARY_TRANSIENT_POSITIONS.has(i)) {
        steps[i] = "g";  // downgrade to ghost hit — preserves some anchor presence
        count--;
      }
    }

    return { ...p, steps: steps as CTLv1["groove_patterns"][0]["steps"] };
  });

  const after = patterns.length > 0
    ? patterns.reduce((s, p) => s + (p.steps as readonly string[]).filter(t => t === "K" || t === "L").length, 0) / patterns.length
    : 0;

  return {
    ctl: { ...ctl, groove_patterns: patterns },
    mutation: `c2_fix: pruned transients → ${before.toFixed(1)}→${after.toFixed(1)}/bar`,
  };
}

// ── C3 fix: restore anchor continuity ────────────────────────────────────────
// Raise any log_drum_density curve point below the floor.

function fixC3(ctl: CTLv1): { ctl: CTLv1; mutation: string } {
  const ldCurve = ctl.curves.log_drum_density.map(pt =>
    pt.value < C3_MIN_LD_DENSITY
      ? { ...pt, value: C3_MIN_LD_DENSITY }
      : pt
  );
  const changed = ldCurve.filter(
    (pt, i) => pt.value !== ctl.curves.log_drum_density[i].value
  ).length;

  return {
    ctl: { ...ctl, curves: { ...ctl.curves, log_drum_density: ldCurve } },
    mutation: `c3_fix: raised ${changed} log drum density point${changed !== 1 ? "s" : ""} to floor ${C3_MIN_LD_DENSITY}`,
  };
}

// ── Public optimizer ──────────────────────────────────────────────────────────

const MAX_ITERATIONS = 6;

export function optimizeCTLForHarmonicState(
  ctl: CTLv1
): PerceptionOptimizationResult {
  let current       = ctl;
  const mutations: string[] = [];
  const initial_state = predictCTLPerceptionState(current);

  // Already converged — return unchanged
  if (initial_state.state === "harmonic") {
    return {
      ctl: current,
      converged: true,
      iterations: 0,
      initial_state,
      final_state: initial_state,
      mutations_applied: [],
    };
  }

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const report = predictCTLPerceptionState(current);

    if (report.state === "harmonic") {
      return {
        ctl: current,
        converged: true,
        iterations: iter,
        initial_state,
        final_state: report,
        mutations_applied: mutations,
      };
    }

    const params = report.params;

    // Apply fixes in order of severity — C1 first (dominant constraint)
    if (!report.c1_pass || params.b_eff >= C1_B_EFF_HARMONIC_MAX) {
      const fix = fixC1(current, params);
      current = fix.ctl;
      mutations.push(fix.mutation);
    }

    if (!report.c2_pass) {
      const fix = fixC2(current, params);
      current = fix.ctl;
      mutations.push(fix.mutation);
    }

    if (!report.c3_pass) {
      const fix = fixC3(current);
      current = fix.ctl;
      mutations.push(fix.mutation);
    }
  }

  const final_state = predictCTLPerceptionState(current);

  return {
    ctl: current,
    converged: final_state.state === "harmonic",
    iterations: MAX_ITERATIONS,
    initial_state,
    final_state,
    mutations_applied: mutations,
  };
}
