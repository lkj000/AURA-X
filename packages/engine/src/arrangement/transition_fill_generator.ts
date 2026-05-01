// Section Transition Fill Generator — E-49
// Generates a 16-step fill pattern designed to bridge two adjacent sections.
//
// Fill shapes by transition type:
//   build_to_drop      — escalating density: sparse first half, dense second half
//   drop_to_breakdown  — decelerating: dense first half, sparse second half
//   breakdown_to_build — crescendo: single hit at bar start, builds to end
//   drop_to_outro      — sparse stutter: periodic hits fading out
//
// The base shape is then lane-biased via deterministic step selection (hashString)
// and the climax step is the last active step (for build_to_drop) or first
// active step (for drop_to_breakdown).

import { hashString } from "../_utils";
import type { Lane, TransitionType, TransitionFill } from "../types";

export interface FillOptions {
  seed?: string;   // default `${lane}_${transitionType}`
}

// Base active-step pools for each transition type (indices into 0..15)
const FILL_SHAPES: Record<TransitionType, number[]> = {
  build_to_drop:      [8, 9, 10, 11, 12, 13, 14, 15],   // second half dense
  drop_to_breakdown:  [0, 1, 2,  3,  4,  5,  6,  7 ],   // first half dense
  breakdown_to_build: [0, 4, 8,  10, 12, 13, 14, 15],   // sparse → dense
  drop_to_outro:      [0, 4, 8,  12],                    // periodic quarter-notes
};

// Number of hits to place (before lane bias)
const FILL_HITS: Record<TransitionType, number> = {
  build_to_drop:      8,
  drop_to_breakdown:  6,
  breakdown_to_build: 5,
  drop_to_outro:      4,
};

function selectDeterministic(pool: number[], count: number, seed: string): number[] {
  const available = [...pool];
  const selected: number[] = [];
  for (let i = 0; selected.length < count && available.length > 0; i++) {
    const idx = Math.floor(hashString(`${seed}_${i}`) * available.length);
    selected.push(available.splice(idx, 1)[0]);
  }
  return selected.sort((a, b) => a - b);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateTransitionFill(
  lane: Lane,
  transitionType: TransitionType,
  options: FillOptions = {},
): TransitionFill {
  const seed    = options.seed ?? `${lane}_${transitionType}`;
  const pool    = FILL_SHAPES[transitionType];
  const count   = Math.min(FILL_HITS[transitionType], pool.length);
  const active  = selectDeterministic(pool, count, seed);

  const pattern = new Array<number>(16).fill(0);
  for (const i of active) pattern[i] = 1;

  const density     = active.length / 16;
  const climaxStep  = transitionType === "drop_to_breakdown" || transitionType === "drop_to_outro"
    ? active[0] ?? -1
    : active[active.length - 1] ?? -1;

  return { pattern, transitionType, lane, density, climaxStep };
}
