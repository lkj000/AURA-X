// Sidechain Pattern Generator — E-25
// Generates a 16-step gain automation curve simulating the classic Amapiano
// sidechain pump effect, keyed to the kick voice of a GroovePlan.
//
// On each kick step gain drops instantaneously to (1 − depth).
// Recovery follows a quadratic ease-in over releaseSteps 16th-note steps
// back to 1.0.  When two kick release windows overlap, the minimum gain wins.
// The pattern wraps modulo 16 (kick on step 15 recovers into steps 0–1).

import { clamp } from "../_utils";
import type { GroovePlan, SidechainCurve } from "../types";

export interface SidechainOptions {
  depth?:        number;   // sidechain depth [0, 1],  default 0.70
  releaseSteps?: number;   // steps to full recovery,  default 3
  bpm?:          number;   // tempo in BPM,            default 112
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateSidechain(
  plan:    GroovePlan,
  options: SidechainOptions = {},
): SidechainCurve {
  const depth        = clamp(options.depth        ?? 0.70);
  const releaseSteps = Math.max(1, Math.round(options.releaseSteps ?? 3));
  const bpm          = options.bpm ?? 112;

  // Collect kick step indices
  const kickSteps: number[] = [];
  for (let i = 0; i < 16; i++) {
    if (plan.kickPattern[i] === 1) kickSteps.push(i);
  }

  const gains = new Float64Array(16).fill(1.0);

  for (const step of kickSteps) {
    for (let r = 0; r <= releaseSteps; r++) {
      const s   = (step + r) % 16;
      const t   = r / releaseSteps;                             // 0 at kick → 1 at end of release
      const raw = r === 0
        ? 1 - depth                                             // instantaneous dip
        : clamp(1 - depth * (1 - t) * (1 - t));               // quadratic recovery
      if (raw < gains[s]) gains[s] = raw;                      // minimum wins when windows overlap
    }
  }

  const stepMs    = 60_000 / (bpm * 4);
  const releaseMs = stepMs * releaseSteps;

  return {
    bpm,
    depth,
    releaseMs,
    stepGains: Array.from(gains),
    kickSteps,
  };
}
