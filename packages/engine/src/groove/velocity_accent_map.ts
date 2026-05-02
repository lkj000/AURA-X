// Velocity Accent Map — E-61
// Maps each step in a grid to a velocity value based on a repeating accent cycle.
//
// velocity(step) = round(floor + ratio × (peak − floor))
//
// Built-in presets (16-step cycles, wrap for longer grids):
//   amapiano — steps 0,8 = 1.00; steps 4,12 = 0.85; even = 0.65; odd = 0.50
//   straight — 4/4 downbeat emphasis; beats at 1.00, hi-hat offbeats at 0.55
//   flat     — single ratio 1.00 (every step gets peak velocity)
//
// customRatios overrides the preset; preset in result is set to "custom".

import type { AccentPreset, VelocityMapStep, VelocityMap } from "../types";

export interface VelocityMapOptions {
  totalSteps?:    number;          // default 16
  preset?:        AccentPreset;    // default "amapiano"
  customRatios?:  number[];        // overrides preset when provided
  peak?:          number;          // max velocity, default 120
  floor?:         number;          // min velocity, default 40
}

const PRESETS: Record<AccentPreset, number[]> = {
  amapiano: [
    1.00, 0.50, 0.65, 0.50,
    0.85, 0.50, 0.65, 0.50,
    1.00, 0.50, 0.65, 0.50,
    0.85, 0.50, 0.65, 0.50,
  ],
  straight: [
    1.00, 0.55, 0.70, 0.55,
    0.90, 0.55, 0.70, 0.55,
    0.95, 0.55, 0.70, 0.55,
    0.90, 0.55, 0.70, 0.55,
  ],
  flat: [1.0],
};

// ── Public API ────────────────────────────────────────────────────────────────

export function generateVelocityMap(options: VelocityMapOptions = {}): VelocityMap {
  const totalSteps = Math.max(1, Math.round(options.totalSteps ?? 16));
  const peak       = Math.max(1, Math.min(127, Math.round(options.peak  ?? 120)));
  const floor      = Math.max(0, Math.min(peak, Math.round(options.floor ?? 40)));
  const preset     = options.preset ?? "amapiano";
  const ratios     = options.customRatios ?? PRESETS[preset];
  const cycleLen   = ratios.length;

  const steps: VelocityMapStep[] = Array.from({ length: totalSteps }, (_, i) => {
    const ratio    = Math.max(0, Math.min(1, ratios[i % cycleLen]));
    const velocity = Math.round(floor + ratio * (peak - floor));
    return { step: i, velocity, ratio };
  });

  return {
    steps,
    preset: options.customRatios ? "custom" : preset,
    peak,
    floor,
  };
}
