// Pattern Retrograde — E-42
// Applies three classical compositional transformations to a 16-step binary
// pattern:
//
//   reversed  — time-reversal (retrograde): pattern read right-to-left
//   mirrored  — pitch-inversion analogue: 0↔1 bit-flip
//   rotated   — cyclic rotation by `rotateBy` steps (default 8, i.e. half-bar)
//   palindrome — true when reversed === original

import type { RetrogradResult } from "../types";

export interface RetrogradeOptions {
  rotateBy?: number;   // default 8 — cyclic shift amount [0, 15]
}

// ── Public API ────────────────────────────────────────────────────────────────

export function retrogradePattern(
  pattern: readonly number[],
  options: RetrogradeOptions = {},
): RetrogradResult {
  const rotateBy = ((options.rotateBy ?? 8) % 16 + 16) % 16;

  const raw = Array.from(pattern).slice(0, 16);
  while (raw.length < 16) raw.push(0);

  const reversed  = [...raw].reverse();
  const mirrored  = raw.map((v) => (v === 1 ? 0 : 1));
  const rotated   = [...raw.slice(rotateBy), ...raw.slice(0, rotateBy)];
  const palindrome = raw.every((v, i) => v === reversed[i]);

  return { original: [...raw], reversed, mirrored, rotated, palindrome };
}
