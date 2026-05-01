// Session Drift Detector — E-18
// Monitors a time series of AmapianEvaluations and detects when a session
// is drifting away from the target lane across 4 key signals.
//
// Trend classification (per signal):
//   velocity > +0.020  → improving
//   velocity < -0.020  → degrading
//   stddev   > 0.120   → volatile (regardless of slope)
//   otherwise          → stable
//
// driftDetected: true when any signal has velocity < -0.050
// overallTrend:  worst-case across all signals
//   (degrading > volatile > stable > improving)

import { clamp, mean } from "../_utils";
import type { Lane, AmapianEvaluation, DriftTrend, SignalTrace, DriftReport } from "../types";

const DRIFT_VELOCITY_THRESHOLD  = -0.050;
const TREND_IMPROVE_THRESHOLD   =  0.020;
const TREND_DEGRADE_THRESHOLD   = -0.020;
const VOLATILE_STDDEV_THRESHOLD  =  0.120;

// ── Math helpers ──────────────────────────────────────────────────────────────

function stddev(values: number[], avg: number): number {
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// Ordinary least-squares slope over [0, n-1] x-axis
function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = mean(values);
  const num   = values.reduce((s, y, x) => s + (x - xMean) * (y - yMean), 0);
  const den   = values.reduce((s, _, x) => s + (x - xMean) ** 2, 0);
  return den === 0 ? 0 : num / den;
}

function classifyTrend(velocity: number, sd: number): DriftTrend {
  if (sd > VOLATILE_STDDEV_THRESHOLD)   return "volatile";
  if (velocity >  TREND_IMPROVE_THRESHOLD) return "improving";
  if (velocity <  TREND_DEGRADE_THRESHOLD) return "degrading";
  return "stable";
}

// Worst-case trend priority: degrading > volatile > stable > improving
const TREND_PRIORITY: Record<DriftTrend, number> = {
  degrading: 3, volatile: 2, stable: 1, improving: 0,
};

function worstTrend(trends: DriftTrend[]): DriftTrend {
  return trends.reduce((worst, t) =>
    TREND_PRIORITY[t] > TREND_PRIORITY[worst] ? t : worst,
  "improving" as DriftTrend);
}

// ── Signal extractors ─────────────────────────────────────────────────────────

const SIGNALS: Array<{
  name:    string;
  extract: (ev: AmapianEvaluation) => number;
  recovery: (lane: Lane) => string;
}> = [
  {
    name:     "authenticity",
    extract:  (ev) => ev.laneScores.overallAuthenticity,
    recovery: (lane) => `Re-anchor groove to ${lane} canonical grammar — authenticity signal is drifting.`,
  },
  {
    name:     "quality",
    extract:  (ev) => ev.quality.producerScore,
    recovery: ()   => "Upgrade sample tier — producer quality score is regressing.",
  },
  {
    name:     "cultural",
    extract:  (ev) => ev.cultural.alignmentScore,
    recovery: (lane) => `Cultural alignment weakening — review key and BPM against ${lane} targets.`,
  },
  {
    name:     "stemBalance",
    extract:  (ev) => ev.stems.amapianoBalance,
    recovery: ()   => "Log drum presence fading — boost stem balance in mix.",
  },
];

// ── Public API ────────────────────────────────────────────────────────────────

export function detectDrift(
  targetLane:  Lane,
  evaluations: AmapianEvaluation[],
): DriftReport {
  const n = evaluations.length;

  const traces: SignalTrace[] = SIGNALS.map(({ name, extract }) => {
    const values   = evaluations.map(extract).map((v) => clamp(v));
    const avg      = mean(values);
    const sd       = n > 1 ? stddev(values, avg) : 0;
    const rawSlope = linearSlope(values);
    const velocity = clamp(rawSlope * (n - 1), -1, 1);  // normalise to per-series scale
    const trend    = classifyTrend(velocity, sd);
    return { signal: name, values, mean: avg, trend, velocity };
  });

  const driftDetected   = traces.some((t) => t.velocity < DRIFT_VELOCITY_THRESHOLD);
  const criticalSignals = traces.filter((t) => t.trend === "degrading").map((t) => t.signal);
  const overallTrend    = worstTrend(traces.map((t) => t.trend));

  const recovery = criticalSignals.length > 0
    ? SIGNALS
        .filter(({ name }) => criticalSignals.includes(name))
        .map(({ recovery }) => recovery(targetLane))
    : ["Session signals stable — continue current approach."];

  return {
    targetLane,
    iterations: n,
    traces,
    overallTrend,
    driftDetected,
    criticalSignals,
    recovery,
  };
}
