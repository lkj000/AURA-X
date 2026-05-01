// Groove Pattern Combiner — E-45
// Merges two 16-step binary patterns using a chosen blend mode.
//
// Modes:
//   or         — 1 if A OR B is active
//   and        — 1 if A AND B are both active
//   xor        — 1 if exactly one of A, B is active
//   a_not_b    — 1 if A is active AND B is silent
//   b_not_a    — 1 if B is active AND A is silent
//   interleave — even steps from A, odd steps from B

import type { CombineMode, CombineResult } from "../types";

export interface CombineOptions {
  mode?: CombineMode;   // default "or"
}

// ── Public API ────────────────────────────────────────────────────────────────

export function combinePatterns(
  patA: readonly number[],
  patB: readonly number[],
  options: CombineOptions = {},
): CombineResult {
  const mode = options.mode ?? "or";

  const a = Array.from(patA).slice(0, 16);
  const b = Array.from(patB).slice(0, 16);
  while (a.length < 16) a.push(0);
  while (b.length < 16) b.push(0);

  const pattern    = new Array<number>(16).fill(0);
  const sourceMask = new Array<"A" | "B" | "AB" | "none">(16).fill("none");

  for (let i = 0; i < 16; i++) {
    const av = a[i] === 1;
    const bv = b[i] === 1;
    let active = false;

    switch (mode) {
      case "or":         active = av || bv;          break;
      case "and":        active = av && bv;           break;
      case "xor":        active = av !== bv;          break;
      case "a_not_b":    active = av && !bv;          break;
      case "b_not_a":    active = bv && !av;          break;
      case "interleave": active = i % 2 === 0 ? av : bv; break;
    }

    pattern[i] = active ? 1 : 0;

    if (!active) {
      sourceMask[i] = "none";
    } else if (av && bv) {
      sourceMask[i] = "AB";
    } else if (av) {
      sourceMask[i] = "A";
    } else {
      sourceMask[i] = "B";
    }
  }

  const density = pattern.reduce((s, v) => s + v, 0) / 16;
  return { pattern, mode, sourceMask, density };
}
