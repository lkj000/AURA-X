// 7-metric render evaluation.
// Mirrors aura-x-engine/high_end_engine/render_evaluator.py

import { clamp, gaussScore } from "../_utils";
import {
  LANE_TARGETS,
  type Lane, type GroovePlan, type SamplePlan, type QualityScore,
  type AudioFeatures, type RenderEvaluation,
} from "../types";

// Metric weights (sum = 1.0)
const WEIGHTS = {
  laneFeel:          0.22,
  grooveAdherence:   0.20,
  logDrumFit:        0.18,
  sampleFit:         0.15,
  sectionCoherence:  0.13,
  producerAlignment: 0.12,
  styleSimilarity:   0.00, // 0 = not computed (no live model); set 0.50 default when model exists
};

function computeLaneFeel(groove: GroovePlan, features: AudioFeatures): number {
  const t = LANE_TARGETS[groove.lane];
  const bpmScore  = gaussScore(features.bpm, t.bpm, t.bpmSigma * 1.5);
  const swingScore = gaussScore(groove.swing, t.syncopation, 0.08); // swing vs target
  return clamp(0.60 * bpmScore + 0.40 * swingScore);
}

function computeGrooveAdherence(groove: GroovePlan): number {
  const totalHits = [
    ...groove.kickPattern,
    ...groove.hatPattern,
    ...groove.shakerPattern,
    ...groove.logDrumPattern,
  ].filter(Boolean).length;

  // Amapiano target: 4–16 hits per section, density 0.25–0.65
  const density = totalHits / (4 * 16);
  const densityScore = density >= 0.20 && density <= 0.70
    ? 1 - Math.abs(density - 0.42) / 0.30
    : 0.30;

  // Log drum must be present
  const hasLogDrum = groove.logDrumPattern.some(Boolean) ? 1.0 : 0.3;

  return clamp(0.60 * densityScore + 0.40 * hasLogDrum);
}

function computeLogDrumFit(groove: GroovePlan): number {
  const logHits = groove.logDrumPattern.filter(Boolean).length;
  if (logHits === 0) return 0.10;

  // Per-lane log drum density targets
  const targetHits: Record<Lane, number> = {
    private_school:      2,
    sgija:               4,
    bacardi:             5,
    stixx_sgija:         5,
    mbiraiano:           3,
    three_step:          3,
    gqom_fusion:         5,
    hybrid_rnb_amapiano: 3,
  };
  const target = targetHits[groove.lane] ?? 3;
  const score  = 1 - Math.abs(logHits - target) / 6;
  return clamp(score, 0.15);
}

function computeSampleFit(samplePlan: SamplePlan | null): number {
  if (!samplePlan) return 0.50; // neutral when no sample library

  let filled = 0;
  const slots = [samplePlan.kick, samplePlan.hat, samplePlan.shaker, samplePlan.logDrum];
  for (const s of slots) { if (s.path !== null) filled++; }

  const coverage = filled / 4;
  const tierScore = samplePlan.sampleTier === "elite"  ? 1.0
                  : samplePlan.sampleTier === "strong" ? 0.75
                  : 0.50;

  return clamp(0.60 * coverage + 0.40 * tierScore);
}

function computeSectionCoherence(groove: GroovePlan, features: AudioFeatures): number {
  // Coherence: groove density consistency + BPM stability
  const density = [
    ...groove.kickPattern,
    ...groove.hatPattern,
    ...groove.shakerPattern,
    ...groove.logDrumPattern,
  ].filter(Boolean).length / (4 * 16);

  const densityOk = density >= 0.15 && density <= 0.75;
  const bpmInRange = features.bpm >= 107 && features.bpm <= 122;

  return clamp((densityOk ? 0.65 : 0.35) + (bpmInRange ? 0.35 : 0.15));
}

function computeProducerAlignment(quality: QualityScore, samplePlan: SamplePlan | null): number {
  if (!samplePlan) return 0.50;

  const tierMatch: Record<string, number> = {
    elite_elite: 1.0, elite_strong: 0.80, strong_strong: 0.90,
    strong_developing: 0.60, developing_developing: 0.70, elite_developing: 0.50,
  };
  const key = `${quality.tier}_${samplePlan.sampleTier}`;
  return tierMatch[key] ?? 0.60;
}

export function evaluateRender(
  features: AudioFeatures,
  groove: GroovePlan,
  samplePlan: SamplePlan | null,
  quality: QualityScore,
  styleSimilarityScore = 0.50, // from style model when available
): RenderEvaluation {
  const laneFeel          = computeLaneFeel(groove, features);
  const grooveAdherence   = computeGrooveAdherence(groove);
  const logDrumFit        = computeLogDrumFit(groove);
  const sampleFit         = computeSampleFit(samplePlan);
  const sectionCoherence  = computeSectionCoherence(groove, features);
  const producerAlignment = computeProducerAlignment(quality, samplePlan);
  const styleSimilarity   = styleSimilarityScore;

  const overallRenderScore = clamp(
    WEIGHTS.laneFeel         * laneFeel +
    WEIGHTS.grooveAdherence  * grooveAdherence +
    WEIGHTS.logDrumFit       * logDrumFit +
    WEIGHTS.sampleFit        * sampleFit +
    WEIGHTS.sectionCoherence * sectionCoherence +
    WEIGHTS.producerAlignment * producerAlignment +
    // styleSimilarity is 0-weight unless model is live; add 0.50 default contribution here
    (WEIGHTS.styleSimilarity > 0 ? WEIGHTS.styleSimilarity * styleSimilarity : 0) +
    // Re-normalise when styleSimilarity weight = 0 by distributing to remaining
    (WEIGHTS.styleSimilarity === 0 ? 0 : 0),
  );

  return {
    laneFeel,
    grooveAdherence,
    logDrumFit,
    sampleFit,
    sectionCoherence,
    producerAlignment,
    styleSimilarity,
    overallRenderScore,
    passesGate: overallRenderScore >= 0.65,
  };
}
