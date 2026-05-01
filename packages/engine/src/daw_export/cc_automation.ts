// MIDI CC Automation Generator — E-51
// Generates a sequence of MIDI CC value points across a tick range.
//
// Normalised shape (t ∈ [0, 1]):
//   ramp_up   → t
//   ramp_down → 1 − t
//   swell     → sin(πt)       peaks at t = 0.5
//   dip       → 1 − sin(πt)   troughs at t = 0.5
//   flat      → 1             constant at maxValue
//
// Scaled value = round(minValue + norm × (maxValue − minValue))
// Tick spacing = durationTicks / (resolution − 1)

import type { CcShape, CcAutomation } from "../types";

export interface CcAutomationOptions {
  cc?:            number;    // default 11 (expression)
  channel?:       number;    // default 0
  shape?:         CcShape;   // default "swell"
  startTick?:     number;    // default 0
  durationTicks?: number;    // default 1920 (one bar at PPQ 480, 4/4)
  minValue?:      number;    // default 0
  maxValue?:      number;    // default 127
  resolution?:    number;    // default 16
}

function normalisedValue(shape: CcShape, t: number): number {
  switch (shape) {
    case "ramp_up":   return t;
    case "ramp_down": return 1 - t;
    case "swell":     return Math.sin(Math.PI * t);
    case "dip":       return 1 - Math.sin(Math.PI * t);
    case "flat":      return 1;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateCcAutomation(options: CcAutomationOptions = {}): CcAutomation {
  const cc            = Math.max(0, Math.min(127, Math.round(options.cc          ?? 11)));
  const channel       = Math.max(0, Math.min(15,  Math.round(options.channel     ?? 0)));
  const shape         = options.shape         ?? "swell";
  const startTick     = options.startTick     ?? 0;
  const durationTicks = Math.max(1, Math.round(options.durationTicks ?? 1920));
  const minValue      = Math.max(0,   Math.min(127, Math.round(options.minValue  ?? 0)));
  const maxValue      = Math.max(0,   Math.min(127, Math.round(options.maxValue  ?? 127)));
  const resolution    = Math.max(2,   Math.round(options.resolution              ?? 16));
  const endTick       = startTick + durationTicks;
  const range         = maxValue - minValue;

  const points = Array.from({ length: resolution }, (_, i) => {
    const t     = i / (resolution - 1);
    const tick  = startTick + Math.round(i * durationTicks / (resolution - 1));
    const value = Math.max(0, Math.min(127, Math.round(minValue + normalisedValue(shape, t) * range)));
    return { tick, channel, cc, value };
  });

  return { points, cc, channel, shape, startTick, endTick, minValue, maxValue };
}
