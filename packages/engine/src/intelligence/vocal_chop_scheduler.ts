// Vocal Chop Scheduler — E-30
// Generates a deterministic rhythmic schedule of vocal chop events in a single
// bar (16 16th-note steps) for a given lane.
//
// Placement algorithm:
//   1. Build a kick-step mask from LANE_GRAMMARS (avoidKick = true by default).
//   2. Prefer off-beat steps (odd indices) for sparse density.
//   3. Select `count` steps without replacement using FNV-1a hash seeded by
//      "{lane}_{density}_{bpm}_step_{i}" — fully deterministic.
//   4. Assign per-event pitch (from pentatonic-interval set), duration, and
//      velocity using separate deterministic hashes.
//
// Density → event count: sparse 3 | medium 5 | dense 8
// Max chop duration shrinks with tempo: BPM ≥ 130 → 2 steps, ≥ 110 → 3, else 4
// Pitch options: pentatonic-flavoured semitone set [-7,-5,-3,0,0,2,4,7]
//   (0 appears twice to bias toward the original pitch)

import { hashString } from "../_utils";
import { LANE_GRAMMARS }  from "../types";
import type { Lane, ChopEvent, VocalChopPattern } from "../types";

export interface ChopOptions {
  density?:    "sparse" | "medium" | "dense";   // default "medium"
  bpm?:        number;                           // default 114
  avoidKick?:  boolean;                          // default true
}

const DENSITY_COUNT: Record<string, number> = { sparse: 3, medium: 5, dense: 8 };

const PITCH_SET = [-7, -5, -3, 0, 0, 2, 4, 7] as const;  // 0 weighted ×2

function maxDurSteps(bpm: number): number {
  return bpm >= 130 ? 2 : bpm >= 110 ? 3 : 4;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function scheduleVocalChops(lane: Lane, options: ChopOptions = {}): VocalChopPattern {
  const density   = options.density   ?? "medium";
  const bpm       = options.bpm       ?? 114;
  const avoidKick = options.avoidKick ?? true;
  const count     = DENSITY_COUNT[density];
  const maxDur    = maxDurSteps(bpm);

  // Build kick-step mask
  const kickMask = new Array<number>(16).fill(0);
  for (const idx of LANE_GRAMMARS[lane].kick) kickMask[idx] = 1;

  // Build candidate step pool in preference order
  const candidates: number[] = [];

  // Phase 1: off-beat non-kick (odd steps)
  for (let s = 1; s < 16; s += 2) {
    if (!avoidKick || !kickMask[s]) candidates.push(s);
  }
  // Phase 2: on-beat non-kick
  for (let s = 0; s < 16; s += 2) {
    if (!avoidKick || !kickMask[s]) candidates.push(s);
  }
  // Phase 3: kick steps (fallback if candidate pool too small)
  if (candidates.length < count) {
    for (let s = 0; s < 16; s++) {
      if (!candidates.includes(s)) candidates.push(s);
    }
  }

  // Deterministic selection without replacement
  const seed     = `${lane}_${density}_${bpm}`;
  const pool     = [...candidates];
  const selected: number[] = [];
  let   hIdx     = 0;

  while (selected.length < count && pool.length > 0) {
    const h   = hashString(`${seed}_step_${hIdx++}`);
    const idx = Math.floor(h * pool.length);
    selected.push(pool.splice(idx, 1)[0]);
  }
  selected.sort((a, b) => a - b);

  // Build ChopEvents
  const events: ChopEvent[] = selected.map((step, i) => {
    const pitchH = hashString(`${seed}_pitch_${i}`);
    const durH   = hashString(`${seed}_dur_${i}`);
    const velH   = hashString(`${seed}_vel_${i}`);

    const pitchSemitones = PITCH_SET[Math.floor(pitchH * PITCH_SET.length)];
    const durationSteps  = Math.max(1, Math.floor(durH * maxDur) + 1);
    const velocity       = Math.floor(velH * 48) + 80;   // [80, 127]

    return { step, durationSteps, pitchSemitones, velocity };
  });

  return { lane, bpm, events, density };
}
