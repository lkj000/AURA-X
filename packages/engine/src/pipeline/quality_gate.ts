// Quality Gate Pipeline — E-14
// Runs five production gates against an AmapianEvaluation and returns a
// consolidated QualityGateReport with per-gate results, weighted score,
// letter grade (S/A/B/C/F), and a release-readiness verdict.
//
// Gates (weights sum to 1.0):
//   authenticity   0.30 — lane overallAuthenticity >= 0.60
//   perception     0.25 — O.211 perception gate passes
//   cultural       0.20 — cultural alignmentScore >= 0.35
//   quality        0.15 — producer score >= 0.50
//   stem_balance   0.10 — amapianoBalance >= 0.40
//
// Grade scale:   S ≥ 0.90 (all pass) | A ≥ 0.80 (all pass) |
//                B ≥ 0.70 (4+ pass)  | C ≥ 0.60 (3+ pass)  | F otherwise

import { clamp } from "../_utils";
import { AMAPIANO_THRESHOLD } from "../types";
import type { AmapianEvaluation, GateResult, GradeLabel, QualityGateReport } from "../types";

const CULTURAL_MIN   = 0.35;
const QUALITY_MIN    = 0.50;
const STEM_BAL_MIN   = 0.40;

// ── Gate builders ─────────────────────────────────────────────────────────────

function authenticityGate(ev: AmapianEvaluation): GateResult {
  const score     = ev.laneScores.overallAuthenticity;
  const passes    = score >= AMAPIANO_THRESHOLD;
  const reasons: string[] = passes
    ? [`Lane authenticity ${(score * 100).toFixed(1)}% — above ${(AMAPIANO_THRESHOLD * 100).toFixed(0)}% threshold`]
    : [
        `Lane authenticity ${(score * 100).toFixed(1)}% — below ${(AMAPIANO_THRESHOLD * 100).toFixed(0)}% threshold`,
        ...ev.issues.slice(0, 2),
      ];
  return { name: "authenticity", passes, score, threshold: AMAPIANO_THRESHOLD, weight: 0.30, reasons };
}

function perceptionGate(ev: AmapianEvaluation): GateResult {
  const score     = ev.perception.passesGate ? 1.0 : clamp(1 - ev.perception.violations.length * 0.25);
  const passes    = ev.perception.passesGate;
  const reasons: string[] = passes
    ? [`O.211 perception gate cleared (bEff ${ev.perception.bEff.toFixed(3)})`]
    : [`O.211 perception gate failed`, ...ev.perception.violations.slice(0, 2)];
  return { name: "perception", passes, score, threshold: 1.0, weight: 0.25, reasons };
}

function culturalGate(ev: AmapianEvaluation): GateResult {
  const score   = ev.cultural.alignmentScore;
  const passes  = score >= CULTURAL_MIN;
  const reasons: string[] = passes
    ? [`Cultural alignment ${(score * 100).toFixed(1)}% — exceeds ${(CULTURAL_MIN * 100).toFixed(0)}% floor`]
    : [
        `Cultural alignment ${(score * 100).toFixed(1)}% — below ${(CULTURAL_MIN * 100).toFixed(0)}% floor`,
        ...ev.cultural.deviations.slice(0, 2),
      ];
  return { name: "cultural", passes, score, threshold: CULTURAL_MIN, weight: 0.20, reasons };
}

function qualityGate(ev: AmapianEvaluation): GateResult {
  const score   = ev.quality.producerScore;
  const passes  = score >= QUALITY_MIN;
  const reasons: string[] = passes
    ? [`Producer score ${(score * 100).toFixed(1)}% (${ev.quality.tier})`]
    : [`Producer score ${(score * 100).toFixed(1)}% — below ${(QUALITY_MIN * 100).toFixed(0)}% minimum (${ev.quality.tier})`];
  return { name: "quality", passes, score, threshold: QUALITY_MIN, weight: 0.15, reasons };
}

function stemBalanceGate(ev: AmapianEvaluation): GateResult {
  const score   = ev.stems.amapianoBalance;
  const passes  = score >= STEM_BAL_MIN;
  const reasons: string[] = passes
    ? [`Stem balance ${(score * 100).toFixed(1)}% — Amapiano frequency balance satisfied`]
    : [
        `Stem balance ${(score * 100).toFixed(1)}% — below ${(STEM_BAL_MIN * 100).toFixed(0)}% floor`,
        ...ev.stems.balanceIssues.slice(0, 2),
      ];
  return { name: "stem_balance", passes, score, threshold: STEM_BAL_MIN, weight: 0.10, reasons };
}

// ── Grade + summary ───────────────────────────────────────────────────────────

function grade(overallScore: number, allPass: boolean, passCount: number): GradeLabel {
  if (allPass && overallScore >= 0.90) return "S";
  if (allPass && overallScore >= 0.80) return "A";
  if (passCount >= 4 && overallScore >= 0.70) return "B";
  if (passCount >= 3 && overallScore >= 0.60) return "C";
  return "F";
}

function summary(g: GradeLabel, lane: string, allPass: boolean, passCount: number): string {
  if (g === "S") return `Grade S — ${lane} is production-ready with elite authenticity.`;
  if (g === "A") return `Grade A — ${lane} passes all gates, strong release candidate.`;
  if (g === "B") return `Grade B — ${lane} passes ${passCount}/5 gates, minor improvements needed.`;
  if (g === "C") return `Grade C — ${lane} passes ${passCount}/5 gates, significant work required.`;
  return `Grade F — ${lane} fails ${5 - passCount} critical gate(s), not ready for release.`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function runQualityGates(ev: AmapianEvaluation): QualityGateReport {
  const lane  = ev.laneScores.bestFitLane;
  const gates = [
    authenticityGate(ev),
    perceptionGate(ev),
    culturalGate(ev),
    qualityGate(ev),
    stemBalanceGate(ev),
  ];

  const allPass      = gates.every((g) => g.passes);
  const passCount    = gates.filter((g) => g.passes).length;
  const overallScore = clamp(gates.reduce((s, g) => s + g.score * g.weight, 0));
  const g            = grade(overallScore, allPass, passCount);

  return {
    lane,
    gates,
    allPass,
    passCount,
    overallScore,
    grade:           g,
    readyForRelease: allPass && g !== "F",
    summary:         summary(g, lane, allPass, passCount),
  };
}
