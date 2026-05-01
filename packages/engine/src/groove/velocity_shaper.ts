// Pattern Velocity Shaper — E-37
// Maps a 16-step binary pattern to per-step MIDI velocities using an Amapiano
// accent grid and deterministic micro-variations.
//
// Accent grid (step weight):
//   step 0, 8         → 1.00  (downbeats — beat 1 & 3)
//   step 4, 12        → 0.85  (backbeats — beat 2 & 4)
//   step 2, 6, 10, 14 → 0.70  (eighth-note off-beats)
//   all odd steps     → 0.50  (ghost/syncopation) or 0.65 when ghost=false
//
// velocity = clamp(round(base × (w + accentStrength × (w − 0.5)) + microVar), 1, 127)
// microVar = (hashString(`${seed}_${step}`) − 0.5) × 8   (≈ ±4)

import { hashString, clamp } from "../_utils";
import type { VelocityShape } from "../types";

export interface VelocityShapeOptions {
  baseVelocity?:    number;   // default 80 — base MIDI velocity clamped to [1, 127]
  accentStrength?:  number;   // default 0.25 — extra boost on accented steps [0, 1]
  ghost?:           boolean;  // default true  — odd steps at weight 0.50; false → 0.65
  seed?:            string;   // default "default" — seed for micro-variation
}

const MICRO_RANGE = 8;

function accentWeight(step: number, ghost: boolean): number {
  if (step === 0 || step === 8)  return 1.00;
  if (step === 4 || step === 12) return 0.85;
  if (step % 2 === 0)            return 0.70;
  return ghost ? 0.50 : 0.65;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function shapeVelocities(
  pattern: readonly number[],
  options: VelocityShapeOptions = {},
): VelocityShape {
  const base   = Math.max(1, Math.min(127, Math.round(options.baseVelocity  ?? 80)));
  const accent = clamp(options.accentStrength ?? 0.25);
  const ghost  = options.ghost ?? true;
  const seed   = options.seed  ?? "default";

  const raw = Array.from(pattern).slice(0, 16);
  while (raw.length < 16) raw.push(0);

  const velocities = new Array<number>(16).fill(0);

  for (let i = 0; i < 16; i++) {
    if (raw[i] !== 1) continue;
    const w        = accentWeight(i, ghost);
    const microVar = (hashString(`${seed}_${i}`) - 0.5) * MICRO_RANGE;
    const v        = Math.round(base * (w + accent * (w - 0.5)) + microVar);
    velocities[i]  = Math.max(1, Math.min(127, v));
  }

  const activeVels    = velocities.filter((v) => v > 0);
  const peakVel       = activeVels.length > 0 ? Math.max(...activeVels) : -Infinity;
  const peakStep      = activeVels.length > 0 ? velocities.indexOf(peakVel) : -1;
  const meanVelocity  = activeVels.length > 0
    ? activeVels.reduce((s, v) => s + v, 0) / activeVels.length
    : 0;

  return { pattern: [...raw], velocities, peakStep, meanVelocity };
}
