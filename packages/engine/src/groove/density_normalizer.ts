// Groove Density Normalizer — E-40
// Adjusts a 16-step binary pattern to match a target fill ratio by
// deterministically adding or removing steps.
//
// Algorithm:
//   targetCount = round(targetFill × 16)
//   delta = targetCount − currentActiveCount
//   delta > 0 → select |delta| silent steps via hashString seed → turn on
//   delta < 0 → select |delta| active steps via hashString seed → turn off
//   delta = 0 → no change

import { hashString } from "../_utils";
import type { DensityNormalizeResult } from "../types";

export interface NormalizeDensityOptions {
  targetFill?: number;   // default 0.5 — desired fill ratio, clamped to [0, 1]
  seed?:       string;   // default "default" — deterministic selection seed
}

function selectDeterministic(pool: number[], count: number, seed: string): number[] {
  const available = [...pool];
  const selected: number[] = [];
  for (let i = 0; selected.length < count && available.length > 0; i++) {
    const idx = Math.floor(hashString(`${seed}_${i}`) * available.length);
    selected.push(available.splice(idx, 1)[0]);
  }
  return selected;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function normalizeDensity(
  pattern: readonly number[],
  options: NormalizeDensityOptions = {},
): DensityNormalizeResult {
  const targetFill = Math.max(0, Math.min(1, options.targetFill ?? 0.5));
  const seed       = options.seed ?? "default";

  const raw = Array.from(pattern).slice(0, 16);
  while (raw.length < 16) raw.push(0);

  const activeSteps = raw.reduce<number[]>((a, v, i) => (v === 1 ? [...a, i] : a), []);
  const silentSteps = raw.reduce<number[]>((a, v, i) => (v === 0 ? [...a, i] : a), []);

  const originalFill = activeSteps.length / 16;
  const targetCount  = Math.round(targetFill * 16);
  const delta        = targetCount - activeSteps.length;

  const result      = [...raw];
  let stepsAdded    = 0;
  let stepsRemoved  = 0;

  if (delta > 0) {
    for (const i of selectDeterministic(silentSteps, delta, `${seed}_add`)) {
      result[i] = 1;
      stepsAdded++;
    }
  } else if (delta < 0) {
    for (const i of selectDeterministic(activeSteps, -delta, `${seed}_remove`)) {
      result[i] = 0;
      stepsRemoved++;
    }
  }

  const actualFill = result.reduce((s, v) => s + v, 0) / 16;

  return { pattern: result, originalFill, targetFill, actualFill, stepsAdded, stepsRemoved };
}
