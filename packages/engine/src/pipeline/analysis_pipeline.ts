// Analysis Pipeline — E-06
// Single entry point: WAV buffer → AmapianEvaluation + CTLv1 + GateReport + confidence.
// Chains evaluateBuffer → synthesizeCtl → gate computation in one call.

import { clamp } from "../_utils";
import { AMAPIANO_THRESHOLD } from "../types";
import type { AmapianEvaluation, GateReport } from "../types";
import { evaluateBuffer } from "./evaluation";
import { synthesizeCtl } from "../ctl_synthesis/ctl_synthesizer";
import type { CTLv1 } from "../ctl_synthesis/ctl_synthesizer";

// Minimum cultural alignment score to pass the cultural gate
const CULTURAL_GATE_MIN = 0.35;

export interface AnalysisPlan {
  evaluation:      AmapianEvaluation;
  ctl:             CTLv1;
  passesAllGates:  boolean;
  gateReport:      GateReport;
  confidence:      number;     // [0, 1]
  recommendations: string[];
}

export function analyzeAndPlan(
  buffer:    Buffer,
  title:     string,
  createdBy: string,
): AnalysisPlan {
  const evaluation = evaluateBuffer(buffer);
  const ctl        = synthesizeCtl(evaluation, title, createdBy);

  // ── Gate report ───────────────────────────────────────────────────────────
  const authenticityGate = {
    passes:    evaluation.passesThreshold,
    score:     evaluation.laneScores.overallAuthenticity,
    threshold: AMAPIANO_THRESHOLD,
  };

  const perceptionGate = {
    passes:     evaluation.perception.passesGate,
    violations: evaluation.perception.violations,
    bEff:       evaluation.perception.bEff,
    density:    evaluation.perception.density,
  };

  const culturalGate = {
    passes:         evaluation.cultural.alignmentScore >= CULTURAL_GATE_MIN,
    alignmentScore: evaluation.cultural.alignmentScore,
    deviations:     evaluation.cultural.deviations,
  };

  const allPass = authenticityGate.passes && perceptionGate.passes && culturalGate.passes;

  const gateReport: GateReport = {
    authenticityGate,
    perceptionGate,
    culturalGate,
    allPass,
  };

  // ── Confidence — product of three independent signals ────────────────────
  const perceptionConfidence = evaluation.perception.passesGate
    ? 1.0
    : clamp(1.0 - evaluation.perception.violations.length * 0.15);

  const confidence = clamp(
    evaluation.laneScores.laneConfidence *
    (evaluation.cultural.alignmentScore * 0.5 + 0.5) *
    perceptionConfidence,
  );

  // ── Recommendations ───────────────────────────────────────────────────────
  const recommendations: string[] = [];

  if (allPass) {
    recommendations.push(
      `Ready for generation — ${evaluation.laneScores.bestFitLane} CTL synthesized (confidence ${(confidence * 100).toFixed(0)}%)`,
    );
  }

  for (const issue of evaluation.issues) {
    recommendations.push(issue);
  }

  for (const deviation of evaluation.cultural.deviations) {
    if (!recommendations.includes(deviation)) recommendations.push(deviation);
  }

  if (!authenticityGate.passes) {
    recommendations.push(
      `Increase authenticity score from ${authenticityGate.score.toFixed(3)} to ≥ ${AMAPIANO_THRESHOLD}`,
    );
  }

  return {
    evaluation,
    ctl,
    passesAllGates: allPass,
    gateReport,
    confidence,
    recommendations,
  };
}
