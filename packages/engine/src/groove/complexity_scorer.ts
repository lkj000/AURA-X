// Groove Complexity Scorer — E-22
// Measures rhythmic complexity of a GroovePlan across four dimensions:
//
//   entropy       Shannon entropy of each voice's 16-step binary pattern,
//                 normalized to [0,1] (max at 8 hits / 16 steps).
//   syncopation   Fraction of hits falling on off-beat steps (1,3,5,…,15).
//   density       Total active hits across all 4 voices / 64.
//   independence  Mean normalised Hamming distance across all 6 voice pairs.
//
// Overall score weights: syncopation 0.30, entropy 0.25, independence 0.25,
//   density 0.20.
//
// Tier: minimal < 0.20 | sparse < 0.35 | moderate < 0.50 | complex < 0.70
//       | dense >= 0.70

import { clamp, hammingDistance } from "../_utils";
import type { GroovePlan, VoiceName, VoiceComplexity, GrooveComplexityScore, ComplexityTier } from "../types";

const VOICE_ORDER: VoiceName[] = ["kick", "hat", "shaker", "log"];

// ── Math helpers ──────────────────────────────────────────────────────────────

function binaryEntropy(pattern: readonly number[]): number {
  const n = pattern.length;
  if (n === 0) return 0;
  const k = Array.from(pattern).filter((v) => v === 1).length;
  const p = k / n;
  if (p === 0 || p === 1) return 0;
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

function offBeatSyncopation(pattern: readonly number[]): number {
  const total  = Array.from(pattern).filter((v) => v === 1).length;
  if (total === 0) return 0;
  const offBeat = pattern.reduce((s, v, i) => s + (v === 1 && i % 2 === 1 ? 1 : 0), 0);
  return offBeat / total;
}

function voiceDensity(pattern: readonly number[]): number {
  return Array.from(pattern).filter((v) => v === 1).length / 16;
}

function pairIndependence(a: readonly number[], b: readonly number[]): number {
  return hammingDistance(Array.from(a), Array.from(b)) / 16;
}

function tierFromScore(s: number): ComplexityTier {
  if (s < 0.20) return "minimal";
  if (s < 0.35) return "sparse";
  if (s < 0.50) return "moderate";
  if (s < 0.70) return "complex";
  return "dense";
}

// ── Public API ────────────────────────────────────────────────────────────────

export function scoreGrooveComplexity(plan: GroovePlan): GrooveComplexityScore {
  const patterns: Record<VoiceName, readonly number[]> = {
    kick:   plan.kickPattern,
    hat:    plan.hatPattern,
    shaker: plan.shakerPattern,
    log:    plan.logDrumPattern,
  };

  const voiceScores: VoiceComplexity[] = VOICE_ORDER.map((voice) => ({
    voice,
    entropy:     binaryEntropy(patterns[voice]),
    syncopation: offBeatSyncopation(patterns[voice]),
    density:     voiceDensity(patterns[voice]),
  }));

  // Aggregate entropy — simple mean
  const entropy = voiceScores.reduce((s, v) => s + v.entropy, 0) / voiceScores.length;

  // Log-drum weighted syncopation (log carries most Amapiano identity)
  const LOG_WEIGHTS: Record<VoiceName, number> = { log: 0.40, kick: 0.25, hat: 0.20, shaker: 0.15 };
  const syncopation = clamp(
    voiceScores.reduce((s, v) => s + v.syncopation * LOG_WEIGHTS[v.voice], 0),
  );

  // Total density
  const totalHits = VOICE_ORDER.reduce((s, v) => s + Array.from(patterns[v]).filter((x) => x === 1).length, 0);
  const density   = totalHits / 64;

  // Mean pair independence across C(4,2) = 6 pairs
  let pairSum = 0;
  let pairCount = 0;
  for (let i = 0; i < VOICE_ORDER.length; i++) {
    for (let j = i + 1; j < VOICE_ORDER.length; j++) {
      pairSum += pairIndependence(patterns[VOICE_ORDER[i]], patterns[VOICE_ORDER[j]]);
      pairCount++;
    }
  }
  const independence = pairCount > 0 ? pairSum / pairCount : 0;

  const overall = clamp(
    0.30 * syncopation +
    0.25 * entropy +
    0.25 * independence +
    0.20 * density,
  );

  return {
    voiceScores,
    entropy,
    syncopation,
    density,
    independence,
    overall,
    complexityTier: tierFromScore(overall),
  };
}
