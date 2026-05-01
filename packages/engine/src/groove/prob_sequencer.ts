// Probabilistic Step Sequencer — E-53
// Resolves a 16-step binary pattern from per-step fire probabilities using
// deterministic FNV-1a hash.
//
// Resolution: step i fires when hashString(`${seed}_step_${i}`) < probability[i]
//
// If probabilities array is shorter than 16, remaining steps use baseProbability.
// If longer, it is truncated to 16.

import { hashString } from "../_utils";
import type { ProbabilisticPattern } from "../types";

export interface ProbSeqOptions {
  probabilities?:   number[];   // per-step [0, 1]; default: uniform baseProbability
  baseProbability?: number;     // default 0.5 — fill for missing probability entries
  seed?:            string;     // default "default"
}

// ── Public API ────────────────────────────────────────────────────────────────

export function resolveProb(options: ProbSeqOptions = {}): ProbabilisticPattern {
  const base    = Math.max(0, Math.min(1, options.baseProbability ?? 0.5));
  const seed    = options.seed ?? "default";
  const input   = options.probabilities?.slice(0, 16) ?? [];

  const probabilities = Array.from({ length: 16 }, (_, i) =>
    Math.max(0, Math.min(1, input[i] ?? base)),
  );

  const pattern = probabilities.map((p, i) =>
    hashString(`${seed}_step_${i}`) < p ? 1 : 0,
  );

  const hitCount = (pattern as number[]).reduce((s, v) => s + v, 0);

  return { pattern, probabilities, hitCount, density: hitCount / 16 };
}
