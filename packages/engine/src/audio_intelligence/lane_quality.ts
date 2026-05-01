// Per-lane quality metrics and producer score — 8 subgenres.

import { clamp } from "../_utils";
import {
  ELITE_THRESHOLDS,
  type Lane, type AudioFeatures, type LaneQualityMetrics, type QualityScore, type QualityTier,
} from "../types";

type QualityBag = Record<string, number>;

function privateSchoolMetrics(f: AudioFeatures): QualityBag {
  const swing_stability = 1 - Math.abs(f.groove.swingRatio - 0.52);
  const onset_density   = clamp(f.groove.syncopationIndex);
  return {
    space_usage:       clamp(0.68 * (1 - onset_density) + 0.32 * (1 - f.energyRms)),
    harmonic_richness: clamp(0.60 * (1 - f.highEnergy) + 0.40 * (1 - Math.abs(f.energyRms - 0.45))),
    groove_stability:  clamp(0.72 * swing_stability + 0.28 * (1 - Math.abs(f.groove.syncopationIndex - 0.25))),
  };
}

function sgijaMetrics(f: AudioFeatures): QualityBag {
  const swing_stability = 1 - Math.abs(f.groove.swingRatio - 0.53);
  const transient_punch = clamp(f.subBassEnergy * 2);
  return {
    groove_tightness:      clamp(0.58 * swing_stability + 0.42 * f.groove.syncopationIndex),
    log_drum_complexity:   clamp(0.55 * f.groove.syncopationIndex + 0.45 * transient_punch),
    syncopation_precision: clamp(0.60 * f.groove.syncopationIndex + 0.40 * swing_stability),
  };
}

function bacardiMetrics(f: AudioFeatures): QualityBag {
  const brightness      = clamp(f.highEnergy * 2.5);
  const transient_punch = clamp(f.subBassEnergy * 2);
  return {
    transient_strength: clamp(0.62 * transient_punch + 0.38 * brightness),
    percussive_density: clamp(0.64 * f.groove.syncopationIndex + 0.36 * f.groove.syncopationIndex),
    energy_drive:       clamp(0.72 * f.energyRms + 0.28 * transient_punch),
  };
}

function stixxSgijaMetrics(f: AudioFeatures): QualityBag {
  const swing_stability = 1 - Math.abs(f.groove.swingRatio - 0.53);
  const transient_punch = clamp(f.subBassEnergy * 2);
  return {
    aggressive_punch: clamp(0.60 * transient_punch + 0.40 * f.groove.syncopationIndex),
    log_drum_density: clamp(0.55 * f.groove.syncopationIndex + 0.45 * f.energyRms),
    rhythmic_drive:   clamp(0.65 * f.energyRms + 0.35 * swing_stability),
  };
}

function mbiraianoMetrics(f: AudioFeatures): QualityBag {
  const swing_stability = 1 - Math.abs(f.groove.swingRatio - 0.51);
  return {
    melodic_warmth:        clamp(0.70 * (1 - f.highEnergy) + 0.30 * (1 - Math.abs(f.energyRms - 0.38))),
    harmonic_depth:        clamp(0.60 * f.lowMidEnergy + 0.40 * (1 - f.highEnergy)),
    cultural_authenticity: clamp(0.65 * swing_stability + 0.35 * (1 - f.groove.syncopationIndex)),
  };
}

function threeStepMetrics(f: AudioFeatures): QualityBag {
  const swing_stability = 1 - Math.abs(f.groove.swingRatio - 0.53);
  return {
    step_cohesion:     clamp(0.60 * (1 - Math.abs(f.groove.syncopationIndex - 0.42)) + 0.40 * swing_stability),
    triplet_feel:      clamp(0.55 * f.groove.syncopationIndex + 0.45 * f.lowMidEnergy),
    groove_polyrhythm: clamp(0.50 * f.groove.syncopationIndex + 0.30 * f.subBassEnergy + 0.20 * (1 - f.highEnergy)),
  };
}

function gqomFusionMetrics(f: AudioFeatures): QualityBag {
  const transient_punch = clamp(f.subBassEnergy * 2);
  const swing_stability = 1 - Math.abs(f.groove.swingRatio - 0.50);
  return {
    industrial_hardness: clamp(0.60 * transient_punch + 0.40 * f.groove.syncopationIndex),
    dark_energy:         clamp(0.55 * f.energyRms + 0.45 * transient_punch),
    urban_edge:          clamp(0.50 * f.energyRms + 0.30 * f.groove.syncopationIndex + 0.20 * swing_stability),
  };
}

function hybridRnbAmapianoMetrics(f: AudioFeatures): QualityBag {
  const swing_stability = 1 - Math.abs(f.groove.swingRatio - 0.51);
  return {
    melodic_smoothness: clamp(0.65 * (1 - f.highEnergy) + 0.35 * (1 - Math.abs(f.energyRms - 0.62))),
    crossover_balance:  clamp(0.55 * (1 - Math.abs(f.groove.syncopationIndex - 0.28)) + 0.45 * f.lowMidEnergy),
    hook_accessibility: clamp(0.60 * swing_stability + 0.40 * (1 - f.groove.syncopationIndex)),
  };
}

const METRIC_WEIGHTS: Record<string, number> = {
  // private_school
  space_usage:           0.36,
  harmonic_richness:     0.32,
  groove_stability:      0.32,
  // sgija
  groove_tightness:      0.34,
  log_drum_complexity:   0.33,
  syncopation_precision: 0.33,
  // bacardi
  transient_strength:    0.35,
  percussive_density:    0.32,
  energy_drive:          0.33,
  // stixx_sgija
  aggressive_punch:      0.35,
  log_drum_density:      0.35,
  rhythmic_drive:        0.30,
  // mbiraiano
  melodic_warmth:        0.38,
  harmonic_depth:        0.30,
  cultural_authenticity: 0.32,
  // three_step
  step_cohesion:         0.36,
  triplet_feel:          0.34,
  groove_polyrhythm:     0.30,
  // gqom_fusion
  industrial_hardness:   0.35,
  dark_energy:           0.33,
  urban_edge:            0.32,
  // hybrid_rnb_amapiano
  melodic_smoothness:    0.38,
  crossover_balance:     0.30,
  hook_accessibility:    0.32,
};

function producerScore(metrics: QualityBag): number {
  let weighted = 0, totalWeight = 0;
  for (const [key, val] of Object.entries(metrics)) {
    const w = METRIC_WEIGHTS[key] ?? 0.33;
    weighted += val * w;
    totalWeight += w;
  }
  return totalWeight > 0 ? clamp(weighted / totalWeight) : 0;
}

function tierFromScore(score: number, lane: Lane): QualityTier {
  if (score >= ELITE_THRESHOLDS[lane]) return "elite";
  if (score >= 0.70)                   return "strong";
  return "developing";
}

export function scoreLaneQuality(
  features: AudioFeatures,
  lane: Lane,
): QualityScore {
  const metricsMap: Record<Lane, (f: AudioFeatures) => QualityBag> = {
    private_school:      privateSchoolMetrics,
    sgija:               sgijaMetrics,
    bacardi:             bacardiMetrics,
    stixx_sgija:         stixxSgijaMetrics,
    mbiraiano:           mbiraianoMetrics,
    three_step:          threeStepMetrics,
    gqom_fusion:         gqomFusionMetrics,
    hybrid_rnb_amapiano: hybridRnbAmapianoMetrics,
  };

  const raw  = metricsMap[lane](features);
  const ps   = producerScore(raw);
  const tier = tierFromScore(ps, lane);

  const laneMetrics: LaneQualityMetrics = {};
  for (const [k, v] of Object.entries(raw)) {
    (laneMetrics as Record<string, number>)[k] = v;
  }

  return {
    producerScore: ps,
    tier,
    isElite:       tier === "elite",
    laneMetrics,
  };
}
