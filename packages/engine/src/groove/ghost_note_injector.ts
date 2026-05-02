// Ghost Note Injector — E-58
// Places low-velocity ghost notes on empty steps between main hits.
//
// Algorithm:
//   1. Enumerate all steps [0, totalSteps).
//   2. Exclude occupiedSteps (the main-hit positions).
//   3. For each empty step, include it as a ghost when
//      hashString(`${seed}-${step}`) < density.
//   4. Assign velocity via linear interpolation within [minVelocity, maxVelocity]
//      using hashString(`${seed}-vel-${step}`).

import type { GhostNote, GhostNoteResult } from "../types";
import { hashString } from "../_utils";

export interface GhostOptions {
  totalSteps?:    number;    // default 16
  occupiedSteps?: number[];  // steps with a main hit (default [])
  midiNote?:      number;    // ghost note number (default 38 — snare)
  density?:       number;    // 0–1 fraction of empty steps to fill (default 0.4)
  minVelocity?:   number;    // default 20
  maxVelocity?:   number;    // default 45
  ticksPerStep?:  number;    // default 120
  startTick?:     number;    // default 0
  seed?:          string;    // default "ghost"
}

// ── Public API ────────────────────────────────────────────────────────────────

export function injectGhostNotes(options: GhostOptions = {}): GhostNoteResult {
  const totalSteps   = Math.max(1, Math.round(options.totalSteps    ?? 16));
  const occupied     = new Set((options.occupiedSteps ?? []).map((s) => Math.round(s)));
  const midiNote     = Math.max(0, Math.min(127, Math.round(options.midiNote    ?? 38)));
  const density      = Math.max(0, Math.min(1, options.density      ?? 0.4));
  const minVelocity  = Math.max(1, Math.min(127, Math.round(options.minVelocity ?? 20)));
  const maxVelocity  = Math.max(1, Math.min(127, Math.round(options.maxVelocity ?? 45)));
  const tps          = Math.max(1, Math.round(options.ticksPerStep  ?? 120));
  const startTick    = Math.max(0, Math.round(options.startTick     ?? 0));
  const seed         = options.seed ?? "ghost";

  const ghosts: GhostNote[] = [];

  for (let step = 0; step < totalSteps; step++) {
    if (occupied.has(step)) continue;
    if (hashString(`${seed}-${step}`) >= density) continue;

    const velFrac  = hashString(`${seed}-vel-${step}`);
    const velocity = Math.round(minVelocity + velFrac * (maxVelocity - minVelocity));
    const tick     = startTick + step * tps;

    ghosts.push({ step, tick, midiNote, velocity });
  }

  return { ghosts, density, totalSteps };
}
