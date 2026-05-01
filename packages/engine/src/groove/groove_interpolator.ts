// Groove Interpolator — E-15
// Blends two GroovePlans at alpha ∈ [0, 1] where 0 = pure planA, 1 = pure planB.
//
// Pattern blending rule (per step, per voice):
//   weight = (1 - alpha) * A[step] + alpha * B[step]
//   step fires when weight >= 0.5
//   → both 0: never fires  | both 1: always fires
//   → A=1 B=0: fires when alpha < 0.5
//   → A=0 B=1: fires when alpha >= 0.5
//
// Continuous properties:
//   swing              = lerp(A.swing, B.swing, alpha)
//   densityProfile     = derived from hit count quartile
//   microtimingProfile = A if alpha < 0.5, B otherwise
//   lane / grooveType  = A if alpha < 0.5, B otherwise

import { clamp } from "../_utils";
import type { Lane, GroovePlan, GrooveInterpolation } from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpolateVoice(a: readonly number[], b: readonly number[], alpha: number): readonly number[] {
  const result: number[] = [];
  for (let i = 0; i < 16; i++) {
    const weight = (1 - alpha) * (a[i] ?? 0) + alpha * (b[i] ?? 0);
    result.push(weight >= 0.5 ? 1 : 0);
  }
  return result;
}

function countHits(plan: GroovePlan): number {
  return [plan.kickPattern, plan.hatPattern, plan.shakerPattern, plan.logDrumPattern]
    .reduce((s, p) => s + Array.from(p).filter((v) => v === 1).length, 0);
}

function densityFromHits(hits: number): "sparse" | "medium" | "dense" {
  if (hits <= 16) return "sparse";
  if (hits <= 28) return "medium";
  return "dense";
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface InterpolateOptions {
  alpha: number;   // [0, 1] — 0 = pure A, 1 = pure B
}

export function interpolateGrooves(
  planA: GroovePlan,
  planB: GroovePlan,
  options: InterpolateOptions,
): GrooveInterpolation {
  const alpha  = clamp(options.alpha);
  const dominant = alpha < 0.5 ? planA : planB;

  const kickOut   = interpolateVoice(planA.kickPattern,    planB.kickPattern,    alpha);
  const hatOut    = interpolateVoice(planA.hatPattern,     planB.hatPattern,     alpha);
  const shakerOut = interpolateVoice(planA.shakerPattern,  planB.shakerPattern,  alpha);
  const logOut    = interpolateVoice(planA.logDrumPattern, planB.logDrumPattern, alpha);

  const swingOut   = clamp(lerp(planA.swing, planB.swing, alpha), 0.45, 0.60);
  const totalHits  = [kickOut, hatOut, shakerOut, logOut]
    .reduce((s, p) => s + p.filter((v) => v === 1).length, 0);

  const plan: GroovePlan = {
    grooveType:         `${dominant.lane}_interpolated_${Math.round(alpha * 100)}`,
    lane:               dominant.lane,
    steps:              16,
    kickPattern:        kickOut,
    hatPattern:         hatOut,
    shakerPattern:      shakerOut,
    logDrumPattern:     logOut,
    swing:              swingOut,
    densityProfile:     densityFromHits(totalHits),
    microtimingProfile: dominant.microtimingProfile,
    styleBiasApplied:   true,
  };

  return {
    plan,
    alpha,
    laneA:   planA.lane,
    laneB:   planB.lane,
    hitsA:   countHits(planA),
    hitsB:   countHits(planB),
    hitsOut: totalHits,
  };
}
