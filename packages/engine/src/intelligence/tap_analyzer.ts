// BPM Tap Analyzer — E-52
// Estimates BPM from a sequence of tap timestamps (milliseconds).
//
// Algorithm:
//   1. Compute inter-tap intervals: diffs[i] = timestamps[i+1] − timestamps[i]
//   2. BPM = 60 000 / median(diffs)
//   3. stdDev of diffs → confidence = 1 / (1 + stdDev / median)
//
// Requires ≥ 2 taps.  Returns bpm=0, confidence=0 for fewer taps.

import type { TapAnalysis } from "../types";

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid    = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function stdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function analyzeTaps(timestamps: readonly number[]): TapAnalysis {
  const tapCount = timestamps.length;

  if (tapCount < 2) {
    return { bpm: 0, confidence: 0, tapCount, intervalMs: 0, stdDevMs: 0, inAmapianoRange: false };
  }

  const diffs: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    diffs.push(timestamps[i] - timestamps[i - 1]);
  }

  const intervalMs  = median(diffs);
  const mean        = diffs.reduce((s, v) => s + v, 0) / diffs.length;
  const stdDevMs    = stdDev(diffs, mean);
  const bpm         = intervalMs > 0 ? 60_000 / intervalMs : 0;
  const confidence  = intervalMs > 0 ? 1 / (1 + stdDevMs / intervalMs) : 0;

  return {
    bpm:             Math.round(bpm * 10) / 10,   // 1 d.p.
    confidence:      Math.min(1, confidence),
    tapCount,
    intervalMs:      Math.round(intervalMs * 10) / 10,
    stdDevMs:        Math.round(stdDevMs  * 10) / 10,
    inAmapianoRange: bpm >= 100 && bpm <= 130,
  };
}
