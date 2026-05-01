// Euclidean Rhythm Generator — E-43
// Distributes `hits` onsets across `steps` positions as evenly as possible
// using the Bjorklund algorithm (Toussaint, 2005).
//
// Algorithm:
//   1. Start with `hits` buckets of [1] and `steps−hits` buckets of [0].
//   2. Repeatedly append the shorter tail into the longer head, one-for-one.
//   3. Terminate when the tail has ≤ 1 bucket.
//   4. Flatten and apply cyclic offset rotation.
//
// Classic results:
//   E(3,8)  → [1,0,0,1,0,0,1,0]  — Afro-Cuban tresillo
//   E(5,8)  → [1,0,1,1,0,1,1,0]  — Cuban cinquillo
//   E(4,16) → [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]  — four-on-the-floor

import type { EuclideanResult } from "../types";

export interface EuclideanOptions {
  offset?: number;   // default 0 — cyclic left-rotation of the result
}

function bjorklund(hits: number, steps: number): number[] {
  if (hits <= 0) return new Array(steps).fill(0);
  if (hits >= steps) return new Array(steps).fill(1);

  let head: number[][] = Array.from({ length: hits },       () => [1]);
  let tail: number[][] = Array.from({ length: steps - hits }, () => [0]);

  while (tail.length > 1) {
    const count     = Math.min(head.length, tail.length);
    const newHead   = head.slice(0, count).map((h, i) => [...h, ...tail[i]]);
    const remainder = [...head.slice(count), ...tail.slice(count)];
    head = newHead;
    tail = remainder;
  }

  return [...head, ...tail].flat();
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateEuclidean(
  hits:    number,
  steps:   number,
  options: EuclideanOptions = {},
): EuclideanResult {
  const s      = Math.max(1, Math.round(steps));
  const h      = Math.max(0, Math.min(s, Math.round(hits)));
  const offset = ((options.offset ?? 0) % s + s) % s;

  const base    = bjorklund(h, s);
  const pattern = offset === 0
    ? base
    : [...base.slice(offset), ...base.slice(0, offset)];

  return { pattern, hits: h, steps: s, offset, density: h / s };
}
