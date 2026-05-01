// Compressor Settings Generator — E-28
// Computes per-stem dynamic compression parameters from a target BPM and
// MixProfile.
//
// BPM scaling: timing values normalised to 114 BPM reference.
//   attackMs  × (114 / bpm)   — faster tempo → snappier transient response
//   releaseMs × (114 / bpm)   — tempo-proportional recovery
//
// MixProfile adjustments (applied uniformly across all stems):
//   raw_street        → threshold +4 dB, ratio ×1.40  (aggressive, punchy)
//   bounce_club       → threshold +2 dB, ratio ×1.20  (club punch)
//   luxury_noir       → threshold −4 dB, ratio ×0.80  (gentle glue)
//   spiritual_organic → threshold −6 dB, ratio ×0.70  (very gentle)
//   dark_tribal       → threshold ±0 dB, ratio ×1.10  (moderate)
//   crossover_rb      → threshold +1 dB, ratio ×0.90  (balanced)
//
// makeupDb grows proportionally with ratio increase to compensate for GR.
// kneeDb is mix-profile independent (fixed by stem type).

import { clamp } from "../_utils";
import type { MixProfile, StemName, CompressorParams, CompressorSpec } from "../types";

const STEM_ORDER: StemName[] = ["sub_bass", "log_drum", "chord_pad", "percussion", "air"];

interface BaseComp { thresholdDb: number; ratio: number; attackMs: number; releaseMs: number; makeupDb: number; kneeDb: number }

const BASE: Record<StemName, BaseComp> = {
  sub_bass:   { thresholdDb: -18, ratio: 4.0, attackMs: 20, releaseMs: 200, makeupDb: 4, kneeDb: 4 },
  log_drum:   { thresholdDb: -12, ratio: 6.0, attackMs:  5, releaseMs:  80, makeupDb: 3, kneeDb: 2 },
  chord_pad:  { thresholdDb: -20, ratio: 3.0, attackMs: 30, releaseMs: 400, makeupDb: 3, kneeDb: 6 },
  percussion: { thresholdDb: -10, ratio: 8.0, attackMs:  2, releaseMs:  60, makeupDb: 2, kneeDb: 1 },
  air:        { thresholdDb: -24, ratio: 2.0, attackMs: 80, releaseMs: 800, makeupDb: 2, kneeDb: 8 },
};

const PROFILE_ADJ: Record<MixProfile, { thresholdOffset: number; ratioMul: number }> = {
  raw_street:        { thresholdOffset: +4, ratioMul: 1.40 },
  bounce_club:       { thresholdOffset: +2, ratioMul: 1.20 },
  luxury_noir:       { thresholdOffset: -4, ratioMul: 0.80 },
  spiritual_organic: { thresholdOffset: -6, ratioMul: 0.70 },
  dark_tribal:       { thresholdOffset:  0, ratioMul: 1.10 },
  crossover_rb:      { thresholdOffset: +1, ratioMul: 0.90 },
};

// ── Public API ────────────────────────────────────────────────────────────────

export function generateCompressorSpec(bpm: number, mixProfile: MixProfile): CompressorSpec {
  const bpmScale                   = 114 / Math.max(bpm, 1);
  const { thresholdOffset, ratioMul } = PROFILE_ADJ[mixProfile];

  const params: CompressorParams[] = STEM_ORDER.map((stem) => {
    const b           = BASE[stem];
    const thresholdDb = clamp(b.thresholdDb + thresholdOffset, -60, 0);
    const ratio       = Math.max(1, parseFloat((b.ratio * ratioMul).toFixed(2)));
    const attackMs    = clamp(parseFloat((b.attackMs  * bpmScale).toFixed(2)), 0.1, 200);
    const releaseMs   = clamp(parseFloat((b.releaseMs * bpmScale).toFixed(2)), 10, 2000);
    const makeupDb    = clamp(b.makeupDb + (ratio - b.ratio) * 0.4, 0, 24);
    const kneeDb      = b.kneeDb;

    return { stem, thresholdDb, ratio, attackMs, releaseMs, makeupDb, kneeDb };
  });

  return { bpm, mixProfile, params };
}
