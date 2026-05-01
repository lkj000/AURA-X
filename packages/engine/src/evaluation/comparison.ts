// Comparative Evaluation Engine — E-08
// Compares a source AmapianEvaluation against a generated/revised one across
// 8 weighted Amapiano authenticity dimensions. Produces a ComparisonReport with
// per-dimension deltas, weighted overall delta, and human-readable improvement
// and regression lists. Used to close the generation feedback loop.

import { clamp, gaussScore } from "../_utils";
import { LANE_TARGETS, AMAPIANO_THRESHOLD } from "../types";
import type { AmapianEvaluation, DimensionDelta, ComparisonReport } from "../types";
import { evaluateBuffer } from "../pipeline/evaluation";

// Delta magnitude thresholds
const IMPROVEMENT_THRESHOLD = 0.04;
const REGRESSION_THRESHOLD  = 0.04;

// ── Dimension extractors → score in [0, 1] ────────────────────────────────────

function authenticityScore(ev: AmapianEvaluation): number {
  return ev.laneScores.overallAuthenticity;
}

function qualityScore(ev: AmapianEvaluation): number {
  return ev.quality.producerScore;
}

function culturalScore(ev: AmapianEvaluation): number {
  return ev.cultural.alignmentScore;
}

function perceptionScore(ev: AmapianEvaluation): number {
  // 1.0 for full gate pass; penalise by number of violations
  return clamp(1.0 - ev.perception.violations.length * 0.18);
}

function logDrumScore(ev: AmapianEvaluation): number {
  if (ev.logDrum?.isLogDrum) return clamp(ev.logDrum.confidence);
  if (ev.logDrum)            return clamp(ev.logDrum.confidence * 0.5);
  return ev.stems.stemMap.log_drum.presenceScore * 0.5;
}

function grooveScore(ev: AmapianEvaluation): number {
  const lane    = ev.laneScores.bestFitLane;
  const target  = LANE_TARGETS[lane];
  const swingFit = gaussScore(ev.features.groove.swingRatio, target.swing, 0.035);
  const syncFit  = gaussScore(ev.features.groove.syncopationIndex, target.syncopation, target.syncopSigma);
  return clamp(0.6 * swingFit + 0.4 * syncFit);
}

function stemBalanceScore(ev: AmapianEvaluation): number {
  return ev.stems.amapianoBalance;
}

function bpmProximityScore(ev: AmapianEvaluation): number {
  const lane   = ev.laneScores.bestFitLane;
  const target = LANE_TARGETS[lane];
  return gaussScore(ev.features.bpm, target.bpm, target.bpmSigma);
}

// ── Dimension config ──────────────────────────────────────────────────────────

interface DimConfig {
  key:     string;
  weight:  number;
  extract: (ev: AmapianEvaluation) => number;
  label:   (delta: number) => string;
}

const DIMENSIONS: DimConfig[] = [
  {
    key: "authenticity", weight: 0.25, extract: authenticityScore,
    label: (d) => `Lane authenticity ${d > 0 ? "improved" : "regressed"} ${fmt(d)} (threshold ${AMAPIANO_THRESHOLD})`,
  },
  {
    key: "quality", weight: 0.20, extract: qualityScore,
    label: (d) => `Producer quality score ${d > 0 ? "improved" : "regressed"} ${fmt(d)}`,
  },
  {
    key: "cultural_alignment", weight: 0.15, extract: culturalScore,
    label: (d) => `Cultural alignment ${d > 0 ? "improved" : "regressed"} ${fmt(d)}`,
  },
  {
    key: "perception", weight: 0.15, extract: perceptionScore,
    label: (d) => `O.211 perception gate ${d > 0 ? "improved" : "regressed"} ${fmt(d)}`,
  },
  {
    key: "log_drum", weight: 0.10, extract: logDrumScore,
    label: (d) => `Log drum presence ${d > 0 ? "improved" : "regressed"} ${fmt(d)}`,
  },
  {
    key: "groove", weight: 0.08, extract: grooveScore,
    label: (d) => `Groove (swing + syncopation) ${d > 0 ? "improved" : "regressed"} ${fmt(d)}`,
  },
  {
    key: "stem_balance", weight: 0.07, extract: stemBalanceScore,
    label: (d) => `Stem frequency balance ${d > 0 ? "improved" : "regressed"} ${fmt(d)}`,
  },
  {
    key: "bpm_proximity", weight: 0.00, extract: bpmProximityScore,
    label: (d) => `BPM lane proximity ${d > 0 ? "improved" : "regressed"} ${fmt(d)}`,
  },
];

// remaining weight goes to bpm_proximity
const totalExplicit = DIMENSIONS.slice(0, -1).reduce((s, d) => s + d.weight, 0);
DIMENSIONS[DIMENSIONS.length - 1].weight = clamp(1 - totalExplicit);

function fmt(delta: number): string {
  const pct = (Math.abs(delta) * 100).toFixed(1);
  return `${delta > 0 ? "+" : "-"}${pct}%`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function compareEvaluations(
  source:    AmapianEvaluation,
  generated: AmapianEvaluation,
): ComparisonReport {
  const deltas: DimensionDelta[] = DIMENSIONS.map(({ key, weight, extract, label }) => {
    const src  = clamp(extract(source));
    const gen  = clamp(extract(generated));
    const d    = clamp(gen - src, -1, 1);
    const imp  = d >  IMPROVEMENT_THRESHOLD;
    const reg  = d < -REGRESSION_THRESHOLD;
    return { dimension: key, source: src, generated: gen, delta: d, weight, improved: imp, regressed: reg };
  });

  const totalWeight  = DIMENSIONS.reduce((s, d) => s + d.weight, 0);
  const overallDelta = clamp(
    deltas.reduce((s, d) => s + d.delta * d.weight, 0) / (totalWeight || 1),
    -1, 1,
  );

  const improvements: string[] = [];
  const regressions:  string[] = [];

  DIMENSIONS.forEach(({ label }, i) => {
    const d = deltas[i];
    if (d.improved)  improvements.push(label(d.delta));
    if (d.regressed) regressions.push(label(d.delta));
  });

  return {
    sourceLane:    source.laneScores.bestFitLane,
    generatedLane: generated.laneScores.bestFitLane,
    deltas,
    overallDelta,
    improved:  overallDelta > 0,
    regressions,
    improvements,
  };
}

export function compareBuffers(
  sourceBuffer:    Buffer,
  generatedBuffer: Buffer,
): ComparisonReport {
  return compareEvaluations(
    evaluateBuffer(sourceBuffer),
    evaluateBuffer(generatedBuffer),
  );
}
