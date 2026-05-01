// Cultural Encoder — E-04
// Per-lane Gaussian marker scoring against LANE_TARGETS (shared acoustic targets).
// Produces CulturalAlignment: alignmentScore, per-marker scores, deviations, CtlConditioning.

import { gaussScore, clamp } from "../_utils";
import { LANE_TARGETS } from "../types";
import type { AudioFeatures, Lane, CulturalAlignment, CtlConditioning } from "../types";
import { CULTURAL_PROFILES } from "./cultural_profiles";

const MARKER_WEIGHTS = {
  bpm:         0.25,
  energy:      0.20,
  swing:       0.25,
  syncopation: 0.20,
  spectral:    0.10,
} as const;

const DEVIATION_THRESHOLD = 0.45;

export function computeCulturalAlignment(
  features: AudioFeatures,
  lane: Lane,
): CulturalAlignment {
  const profile = CULTURAL_PROFILES[lane];
  const targets = LANE_TARGETS[lane];

  const markerScores: Record<string, number> = {
    bpm:         gaussScore(features.bpm,                     targets.bpm,         targets.bpmSigma),
    energy:      gaussScore(features.energyRms,               targets.energy,      targets.energySigma),
    swing:       gaussScore(features.groove.swingRatio,        targets.swing,       0.035),
    syncopation: gaussScore(features.groove.syncopationIndex,  targets.syncopation, targets.syncopSigma),
    spectral:    gaussScore(features.spectralCentroid,         targets.centroid,    targets.centroidSigma),
  };

  const alignmentScore = clamp(
    MARKER_WEIGHTS.bpm         * markerScores.bpm +
    MARKER_WEIGHTS.energy      * markerScores.energy +
    MARKER_WEIGHTS.swing       * markerScores.swing +
    MARKER_WEIGHTS.syncopation * markerScores.syncopation +
    MARKER_WEIGHTS.spectral    * markerScores.spectral,
  );

  const deviations: string[] = [];
  if (markerScores.bpm < DEVIATION_THRESHOLD)
    deviations.push(`BPM ${features.bpm.toFixed(1)} deviates from ${lane} range ${profile.bpmRange[0]}–${profile.bpmRange[1]}`);
  if (markerScores.energy < DEVIATION_THRESHOLD)
    deviations.push(`Energy ${features.energyRms.toFixed(2)} misaligned with ${lane} cultural energy target`);
  if (markerScores.swing < DEVIATION_THRESHOLD)
    deviations.push(`Swing ${features.groove.swingRatio.toFixed(3)} mismatches ${lane} groove feel`);
  if (markerScores.syncopation < DEVIATION_THRESHOLD)
    deviations.push(`Syncopation ${features.groove.syncopationIndex.toFixed(2)} deviates from ${lane} rhythmic signature`);
  if (markerScores.spectral < DEVIATION_THRESHOLD)
    deviations.push(`Spectral character misaligned with ${lane} production style`);

  const culturalDirectives: string[] = [
    `Lineage: ${profile.lineage.join(" → ")}`,
    `Origin: ${profile.geoOrigin}`,
    `Feel: ${profile.emotionalProfile.join(", ")}`,
    ...profile.productionMarkers.map((m) => `Apply: ${m}`),
  ];

  const ctlConditioning: CtlConditioning = {
    mixProfile:         profile.mixProfile,
    bpmTarget:          targets.bpm,
    keyBias:            [...profile.keyBias],
    culturalDirectives,
  };

  return {
    lane,
    alignmentScore,
    markerScores,
    deviations,
    ctlConditioning,
  };
}
