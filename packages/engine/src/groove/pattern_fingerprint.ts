// Pattern Fingerprinting & Similarity Engine — E-09
// Produces a deterministic 32-char hex fingerprint for any GroovePlan and
// computes weighted voice-level similarity between two plans.
// Voice weights: log_drum 0.35 (Amapiano identity), kick 0.30, hat 0.20, shaker 0.15.
// isMatch threshold: overallSim >= 0.75.

import { hashString, hammingDistance } from "../_utils";
import type { GroovePlan, PatternFingerprint, PatternSimilarity } from "../types";

const MATCH_THRESHOLD = 0.75;

const WEIGHTS = { log: 0.35, kick: 0.30, hat: 0.20, shaker: 0.15 };

function toArray(p: readonly number[]): number[] {
  return Array.from(p);
}

function vectorKey(p: readonly number[]): string {
  return Array.from(p).join("");
}

function voiceSim(a: readonly number[], b: readonly number[]): number {
  const dist = hammingDistance(toArray(a), toArray(b));
  return 1 - dist / 16;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function fingerprintGroovePlan(plan: GroovePlan): PatternFingerprint {
  const combined = [
    plan.lane,
    vectorKey(plan.kickPattern),
    vectorKey(plan.hatPattern),
    vectorKey(plan.shakerPattern),
    vectorKey(plan.logDrumPattern),
  ].join("|");

  // Two chained hashes → 32 hex chars
  const h1 = Math.round(hashString(combined)          * 0xffffffff) >>> 0;
  const h2 = Math.round(hashString(combined + "\x00") * 0xffffffff) >>> 0;
  const h3 = Math.round(hashString(combined + "\x01") * 0xffffffff) >>> 0;
  const h4 = Math.round(hashString(combined + "\x02") * 0xffffffff) >>> 0;
  const hash = [h1, h2, h3, h4].map((n) => n.toString(16).padStart(8, "0")).join("");

  const totalHits = [
    ...plan.kickPattern, ...plan.hatPattern,
    ...plan.shakerPattern, ...plan.logDrumPattern,
  ].filter((v) => v === 1).length;

  return {
    lane: plan.lane,
    hash,
    vectors: {
      kick:   plan.kickPattern,
      hat:    plan.hatPattern,
      shaker: plan.shakerPattern,
      log:    plan.logDrumPattern,
    },
    density: totalHits / 64,
  };
}

export function comparePatterns(a: GroovePlan, b: GroovePlan): PatternSimilarity {
  const fpA = fingerprintGroovePlan(a);
  const fpB = fingerprintGroovePlan(b);

  const kickSim   = voiceSim(fpA.vectors.kick,   fpB.vectors.kick);
  const hatSim    = voiceSim(fpA.vectors.hat,    fpB.vectors.hat);
  const shakerSim = voiceSim(fpA.vectors.shaker, fpB.vectors.shaker);
  const logSim    = voiceSim(fpA.vectors.log,    fpB.vectors.log);

  const overallSim = WEIGHTS.log * logSim + WEIGHTS.kick * kickSim +
                     WEIGHTS.hat * hatSim + WEIGHTS.shaker * shakerSim;

  return {
    fingerprintA: fpA.hash,
    fingerprintB: fpB.hash,
    kickSim,
    hatSim,
    shakerSim,
    logSim,
    overallSim,
    isMatch: overallSim >= MATCH_THRESHOLD,
  };
}
