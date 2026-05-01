// Mix Spec Generator — E-11
// Derives per-stem mixing parameters and a master chain spec from an
// AmapianEvaluation. All values are production-ready targets, not absolute
// commands — a producer or DAW automation layer applies them.
//
// Per-stem logic:
//   sub_bass   — center pan, low-shelf boost, heavy comp, no reverb
//   log_drum   — center pan, tight comp, minimal reverb
//   chord_pad  — wide pan (±0.55), moderate comp, room reverb
//   percussion — narrow spread (±0.25), medium comp, short reverb
//   air        — wide pan (±0.7), gentle comp, hall reverb
//
// Master chain: LUFS target tracks lane energy (louder lane → hotter master)

import { clamp } from "../_utils";
import { LANE_TARGETS } from "../types";
import type { AmapianEvaluation, StemName, StemMixParams, MasterChain, MixSpec } from "../types";

// ── Per-stem fixed configs ────────────────────────────────────────────────────

interface StemConfig {
  pan:          number;
  compRatio:    number;
  reverbWet:    number;
  eqLowShelf:   number;   // base dB tweak at 200 Hz
  eqHighShelf:  number;   // base dB tweak at 8 kHz
}

const STEM_CONFIGS: Record<StemName, StemConfig> = {
  sub_bass:   { pan: 0.00,  compRatio: 6.0, reverbWet: 0.00, eqLowShelf:  +2.0, eqHighShelf: -4.0 },
  log_drum:   { pan: 0.00,  compRatio: 5.0, reverbWet: 0.04, eqLowShelf:  +1.0, eqHighShelf: -1.0 },
  chord_pad:  { pan: 0.55,  compRatio: 2.5, reverbWet: 0.22, eqLowShelf:  -3.0, eqHighShelf: +1.5 },
  percussion: { pan: 0.25,  compRatio: 3.5, reverbWet: 0.10, eqLowShelf:  -1.0, eqHighShelf: +2.0 },
  air:        { pan: 0.70,  compRatio: 1.8, reverbWet: 0.35, eqLowShelf:  -6.0, eqHighShelf: +3.0 },
};

const STEM_ORDER: StemName[] = ["sub_bass", "log_drum", "chord_pad", "percussion", "air"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function stemGainDb(presenceScore: number, energy: number, balance: number): number {
  // Louder stems get small cut; quieter get boost, shaped around amapianoBalance
  const baseGain  = (presenceScore - 0.5) * 6;       // ∈ [-3, +3]
  const balanceAdj = (balance - 0.5) * 2;             // ∈ [-1, +1]
  const energyAdj  = (0.5 - energy) * 4;              // under-energy → push up
  return clamp(baseGain + balanceAdj + energyAdj, -12, 6);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateMixSpec(evaluation: AmapianEvaluation): MixSpec {
  const lane    = evaluation.laneScores.bestFitLane;
  const targets = LANE_TARGETS[lane];
  const stemMap = evaluation.stems.stemMap;
  const balance = evaluation.stems.amapianoBalance;

  const stems: StemMixParams[] = STEM_ORDER.map((name) => {
    const stem   = stemMap[name];
    const cfg    = STEM_CONFIGS[name];
    const gainDb = stemGainDb(stem.presenceScore, stem.energy, balance);

    // log_drum and sub_bass are always center; others alternate L/R by index parity
    const pan = (name === "sub_bass" || name === "log_drum")
      ? 0
      : cfg.pan * (STEM_ORDER.indexOf(name) % 2 === 0 ? 1 : -1);

    return {
      stem:          name,
      gainDb:        clamp(gainDb, -12, 6),
      panLR:         clamp(pan, -1, 1),
      eqLowShelfDb:  cfg.eqLowShelf,
      eqHighShelfDb: cfg.eqHighShelf,
      compRatio:     cfg.compRatio,
      reverbWet:     cfg.reverbWet,
    };
  });

  // LUFS: map energy target [0.38, 0.88] → [-14, -9]
  const energyNorm  = clamp((targets.energy - 0.38) / 0.50);
  const lufsTarget  = clamp(-14 + energyNorm * 5, -14, -9);

  // Stereo width: wider for ambient/luxury profiles, narrower for raw/street
  const mixProfile = evaluation.cultural.ctlConditioning.mixProfile;
  const narrowProfiles = new Set(["raw_street", "dark_tribal"]);
  const wideProfiles   = new Set(["luxury_noir", "spiritual_organic", "crossover_rb"]);
  const stereoWidth = clamp(
    narrowProfiles.has(mixProfile) ? 0.85 : wideProfiles.has(mixProfile) ? 1.25 : 1.05,
    0.8, 1.4,
  );

  const master: MasterChain = {
    limitThresholdDb: clamp(-1.0 - (1 - balance) * 2, -6, -0.3),
    eqLowCutHz:       targets.bpm > 116 ? 30 : 25,
    stereoWidth,
    lufsTarget,
  };

  const notes: string[] = [];
  if (balance < 0.5) notes.push("Stem balance below target — boost log_drum and sub_bass presence.");
  if (evaluation.features.energyRms > targets.energy + 0.15) notes.push("Track is hot — headroom limited, reduce input gain.");
  if (evaluation.features.energyRms < targets.energy - 0.15) notes.push("Track is quiet — apply makeup gain before limiting.");
  if (evaluation.cultural.alignmentScore < 0.5) notes.push("Cultural alignment weak — prioritise log_drum clarity in mix.");
  if (!evaluation.passesThreshold) notes.push("Authenticity below threshold — lane identity reinforcement recommended.");

  return { lane, stems, master, notes };
}
