// Pitch Bend Curve Generator — E-50
// Generates pitch bend automation for Amapiano log drum performance techniques.
//
// Normalised value v ∈ [−1, 1]; actual semitones = v × peakSemitones.
//
// Shape formulas (t ∈ [0, 1]):
//   glide_up   → t − 1               starts −1 (below pitch), rises to 0
//   glide_down → −t                  starts 0, drops to −1 (log drum decay)
//   wobble     → sin(4πt)            two full wobble cycles per note
//   vibrato    → sin(8πt)            four fast vibrato cycles per note
//
// Points are evenly spaced:
//   tick(i) = startTick + round(i × durationTicks / (resolution − 1))

import type { PitchBendShape, PitchBendCurve } from "../types";

export interface PitchBendOptions {
  startTick?:     number;         // default 0
  durationTicks?: number;         // default 480 (one beat at PPQ 480)
  peakSemitones?: number;         // default 2.0
  shape?:         PitchBendShape; // default "wobble"
  resolution?:    number;         // default 16 — number of curve points
}

function shapeValue(shape: PitchBendShape, t: number): number {
  switch (shape) {
    case "glide_up":   return t - 1;
    case "glide_down": return -t;
    case "wobble":     return Math.sin(4 * Math.PI * t);
    case "vibrato":    return Math.sin(8 * Math.PI * t);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generatePitchBend(options: PitchBendOptions = {}): PitchBendCurve {
  const startTick     = options.startTick     ?? 0;
  const durationTicks = Math.max(1, options.durationTicks ?? 480);
  const peakSemitones = Math.abs(options.peakSemitones   ?? 2.0);
  const shape         = options.shape         ?? "wobble";
  const resolution    = Math.max(2, Math.round(options.resolution ?? 16));

  const endTick = startTick + durationTicks;

  const points = Array.from({ length: resolution }, (_, i) => {
    const t    = i / (resolution - 1);
    const tick = startTick + Math.round(i * durationTicks / (resolution - 1));
    return { tick, value: shapeValue(shape, t) };
  });

  return { points, startTick, endTick, peakSemitones, shape };
}
