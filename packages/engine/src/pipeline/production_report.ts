// Production Report Generator — E-16
// Orchestrates the full engine stack into one consolidated ProductionReport.
// Calls: runQualityGates, generateMixSpec, recommendSamples, planArrangementArc.
// Aggregates and deduplicates all recommendation strings from every module.

import { runQualityGates }   from "./quality_gate";
import { generateMixSpec }   from "../mix/mix_spec";
import { recommendSamples }  from "../intelligence/sample_recommender";
import { planArrangementArc } from "../arrangement/arc_planner";
import type {
  AmapianEvaluation,
  ProductionReport,
  ProductionReportSummary,
} from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function dedup(items: string[]): string[] {
  return [...new Set(items)];
}

function collectRecommendations(
  ev:   AmapianEvaluation,
  gate: ReturnType<typeof runQualityGates>,
  mix:  ReturnType<typeof generateMixSpec>,
): string[] {
  const recs: string[] = [
    // evaluation issues
    ...ev.issues,
    // cultural deviations
    ...ev.cultural.deviations,
    // stem balance issues
    ...ev.stems.balanceIssues,
    // gate failure reasons (failing gates only)
    ...gate.gates
      .filter((g) => !g.passes)
      .flatMap((g) => g.reasons),
    // mix notes
    ...mix.notes,
  ];
  return dedup(recs).slice(0, 12);   // cap at 12 for readability
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateProductionReport(ev: AmapianEvaluation): ProductionReport {
  const lane  = ev.laneScores.bestFitLane;
  const bpm   = Math.round(ev.features.bpm);
  const key   = ev.harmonic?.key ?? null;

  const qualityGate  = runQualityGates(ev);
  const mixSpec      = generateMixSpec(ev);
  const samplePack   = recommendSamples(lane, { evaluation: ev });
  const arrangement  = planArrangementArc(lane, { bpm });

  const summary: ProductionReportSummary = {
    lane,
    bpm,
    key,
    passesThreshold:  ev.passesThreshold,
    grade:            qualityGate.grade,
    readyForRelease:  qualityGate.readyForRelease,
    overallScore:     qualityGate.overallScore,
  };

  return {
    summary,
    qualityGate,
    mixSpec,
    samplePack,
    arrangement,
    recommendations: collectRecommendations(ev, qualityGate, mixSpec),
    generatedAt:     new Date().toISOString(),
  };
}
