// Groove Swing Quantizer — E-38
// Converts a list of 16th-note step indices to absolute tick positions with
// swing applied.
//
// Swing model — pairs of adjacent 16th notes form a "swing unit" of width
// `pairWidth = 2 × ticksPerStep`:
//   even step in pair → tick = pairStart                         (on-grid)
//   odd  step in pair → tick = pairStart + swingRatio × pairWidth (pushed late)
//
// swingRatio = 0.5 + (swingPercent / 100) × 0.25
//   swingPercent 0  → 0.50 (straight — odd step at exact midpoint)
//   swingPercent 50 → 0.75 (2:1 triplet swing)
//
// ticksPerStep = ticksPerBeat / 4  (one 16th note at the given PPQ)

import { clamp } from "../_utils";
import type { SwingResult } from "../types";

export interface SwingOptions {
  swingPercent?: number;   // default 0 — range [0, 50]; 50 = full 2:1 triplet
  ticksPerBeat?: number;   // default 480 — MIDI PPQ
}

// ── Public API ────────────────────────────────────────────────────────────────

export function quantizeSwing(
  steps: readonly number[],
  options: SwingOptions = {},
): SwingResult {
  const swingPct   = clamp((options.swingPercent ?? 0) / 100, 0, 0.5);
  const tpb        = Math.max(1, Math.round(options.ticksPerBeat ?? 480));
  const swingRatio = 0.5 + swingPct * 0.5;   // maps [0,0.5] → [0.5, 0.75]
  const tps        = tpb / 4;                 // ticks per 16th note
  const pairWidth  = 2 * tps;

  const stepPositions = Array.from(steps);
  const tickPositions = stepPositions.map((step) => {
    const pairIndex = Math.floor(step / 2);
    const pairStart = pairIndex * pairWidth;
    const isOdd     = step % 2 === 1;
    return isOdd
      ? Math.round(pairStart + swingRatio * pairWidth)
      : Math.round(pairStart);
  });

  return { stepPositions, tickPositions, swingRatio, ticksPerStep: tps };
}
