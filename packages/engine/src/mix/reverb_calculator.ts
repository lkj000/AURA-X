// Reverb Tail Calculator — E-27
// Computes per-stem reverb parameters (pre-delay, RT60 decay, wet level,
// room size) from a target BPM and MixProfile.
//
// BPM scaling:  all time values normalised to 114 BPM reference.
//   decay   × (114 / bpm)   — faster tempo → shorter tail to avoid mud
//   preDelay × (114 / bpm)  — tempo-proportional pre-delay
//
// MixProfile multipliers adjust decay and wet level:
//   raw_street        → dry & punchy (decay ×0.65, wet ×0.55)
//   bounce_club       → club-tight   (decay ×0.85, wet ×0.75)
//   luxury_noir       → lush         (decay ×1.20, wet ×0.90)
//   spiritual_organic → very lush    (decay ×1.50, wet ×1.15)
//   dark_tribal       → atmospheric  (decay ×1.10, wet ×0.85)
//   crossover_rb      → balanced     (decay ×0.90, wet ×0.70)
//
// roomSize is derived: clamp(decayMs / 4000)
// All output values are clamped to their documented ranges.

import { clamp } from "../_utils";
import type { MixProfile, StemName, ReverbParams, ReverbSpec } from "../types";

const STEM_ORDER: StemName[] = ["sub_bass", "log_drum", "chord_pad", "percussion", "air"];

// Base reverb parameters at 114 BPM (reference tempo)
const BASE: Record<StemName, { preDelay: number; decay: number; wet: number }> = {
  sub_bass:   { preDelay:  0, decay:  180, wet: 0.05 },
  log_drum:   { preDelay:  8, decay:  380, wet: 0.15 },
  chord_pad:  { preDelay: 16, decay: 1200, wet: 0.30 },
  percussion: { preDelay:  4, decay:  550, wet: 0.18 },
  air:        { preDelay: 32, decay: 1800, wet: 0.45 },
};

const PROFILE_MUL: Record<MixProfile, { decay: number; wet: number }> = {
  raw_street:        { decay: 0.65, wet: 0.55 },
  bounce_club:       { decay: 0.85, wet: 0.75 },
  luxury_noir:       { decay: 1.20, wet: 0.90 },
  spiritual_organic: { decay: 1.50, wet: 1.15 },
  dark_tribal:       { decay: 1.10, wet: 0.85 },
  crossover_rb:      { decay: 0.90, wet: 0.70 },
};

// ── Public API ────────────────────────────────────────────────────────────────

export function calculateReverb(bpm: number, mixProfile: MixProfile): ReverbSpec {
  const bpmScale              = 114 / Math.max(bpm, 1);
  const { decay: dm, wet: wm } = PROFILE_MUL[mixProfile];

  const params: ReverbParams[] = STEM_ORDER.map((stem) => {
    const b          = BASE[stem];
    const preDelayMs = clamp(Math.round(b.preDelay * bpmScale), 0, 200);
    const decayMs    = clamp(Math.round(b.decay * bpmScale * dm), 50, 4000);
    const wetLevel   = clamp(b.wet * wm);
    const roomSize   = clamp(decayMs / 4000);
    return { stem, preDelayMs, decayMs, wetLevel, roomSize };
  });

  return { bpm, mixProfile, params };
}
