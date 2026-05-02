// Note Stutter Generator — E-57
// Repeats a single MIDI note N times within a tick window (roll / stutter effect).
//
// Shapes (applied to both spacing and velocity):
//   flat        — equal spacing, equal velocity
//   accelerate  — spacing decreases linearly (hits get faster toward end)
//   decelerate  — spacing increases linearly (hits get slower toward end)
//   crescendo   — velocity ramps from minVelocity → maxVelocity
//   decrescendo — velocity ramps from maxVelocity → minVelocity
//
// Spacing: for non-flat shapes each inter-hit gap is proportional to a weight.
// accelerate weights:  [N, N-1, …, 1]  (large gaps early → short gaps late)
// decelerate weights:  [1, 2, …, N]    (short gaps early → large gaps late)
// crescendo/decrescendo use flat spacing with velocity ramp.

import type { StutterShape, StutterNote, StutterResult } from "../types";

export interface StutterOptions {
  midiNote?:    number;       // default 36 (kick)
  repeats?:     number;       // 2–32 (default 4)
  windowTicks?: number;       // total tick span for all repeats (default 480)
  shape?:       StutterShape; // default "flat"
  minVelocity?: number;       // for crescendo/decrescendo (default 40)
  maxVelocity?: number;       // for crescendo/decrescendo (default 120)
  velocity?:    number;       // flat/accelerate/decelerate base velocity (default 100)
  startTick?:   number;       // default 0
  gapRatio?:    number;       // note duration as fraction of spacing (default 0.5)
}

function spacingWeights(shape: StutterShape, n: number): number[] {
  if (shape === "accelerate") return Array.from({ length: n }, (_, i) => n - i);
  if (shape === "decelerate") return Array.from({ length: n }, (_, i) => i + 1);
  return Array.from({ length: n }, () => 1);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateStutter(options: StutterOptions = {}): StutterResult {
  const midiNote    = Math.max(0, Math.min(127, Math.round(options.midiNote    ?? 36)));
  const repeats     = Math.max(2, Math.min(32,  Math.round(options.repeats     ?? 4)));
  const windowTicks = Math.max(1, Math.round(options.windowTicks ?? 480));
  const shape       = options.shape       ?? "flat";
  const minVel      = Math.max(1, Math.min(127, Math.round(options.minVelocity ?? 40)));
  const maxVel      = Math.max(1, Math.min(127, Math.round(options.maxVelocity ?? 120)));
  const baseVel     = Math.max(1, Math.min(127, Math.round(options.velocity    ?? 100)));
  const startTick   = Math.max(0, Math.round(options.startTick   ?? 0));
  const gapRatio    = Math.max(0.1, Math.min(1, options.gapRatio ?? 0.5));

  const weights   = spacingWeights(shape, repeats);
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const unitTick  = windowTicks / weightSum;

  const notes: StutterNote[] = [];
  let tick = startTick;

  for (let i = 0; i < repeats; i++) {
    const spacing     = weights[i] * unitTick;
    const durTicks    = Math.max(1, Math.round(spacing * gapRatio));

    let velocity = baseVel;
    if (shape === "crescendo") {
      const t = repeats > 1 ? i / (repeats - 1) : 0;
      velocity = Math.round(minVel + t * (maxVel - minVel));
    } else if (shape === "decrescendo") {
      const t = repeats > 1 ? i / (repeats - 1) : 0;
      velocity = Math.round(maxVel - t * (maxVel - minVel));
    }

    notes.push({ midiNote, tick: Math.round(tick), durationTicks: durTicks, velocity });
    tick += spacing;
  }

  return { notes, repeats, shape, windowTicks };
}
