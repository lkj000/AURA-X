// Chord Stab Pattern Generator — E-47
// Generates Amapiano-standard chord_pad stab rhythms per lane.
//
// Each lane has a characteristic 16-step base template.  Density adjusts the
// hit count: sparse removes steps, dense adds steps — both deterministically
// via hashString seeded by lane + seed.
//
// syncopation = (hits on non-downbeat steps) / stabCount
// Downbeats = steps 0, 4, 8, 12 (quarter-note positions)

import { hashString } from "../_utils";
import type { Lane, StabPattern } from "../types";

export interface StabOptions {
  intensity?: "sparse" | "medium" | "dense";   // default "medium"
  seed?:      string;                           // default lane name
}

// Base 16-step templates — characteristic stab feel per lane
const TEMPLATES: Record<Lane, number[]> = {
  private_school:       [0,0,1,0, 1,0,0,1, 0,0,1,0, 1,0,0,0],
  sgija:                [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0],
  bacardi:              [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
  stixx_sgija:          [1,0,1,0, 0,0,1,0, 1,0,1,0, 0,0,1,0],
  mbiraiano:            [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,0],
  three_step:           [1,0,0,1, 0,0,1,0, 0,1,0,0, 0,0,1,0],
  gqom_fusion:          [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
  hybrid_rnb_amapiano:  [0,1,0,0, 0,0,0,1, 0,1,0,0, 0,0,0,1],
};

// Quarter-note downbeat positions (not syncopated)
const DOWNBEATS = new Set([0, 4, 8, 12]);

function selectDeterministic(pool: number[], count: number, seed: string): number[] {
  const available = [...pool];
  const selected: number[] = [];
  for (let i = 0; selected.length < count && available.length > 0; i++) {
    const idx = Math.floor(hashString(`${seed}_${i}`) * available.length);
    selected.push(available.splice(idx, 1)[0]);
  }
  return selected;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateChordStab(lane: Lane, options: StabOptions = {}): StabPattern {
  const intensity = options.intensity ?? "medium";
  const seed      = options.seed      ?? lane;

  const base  = [...TEMPLATES[lane]];
  const active = base.reduce<number[]>((a, v, i) => (v === 1 ? [...a, i] : a), []);
  const silent = base.reduce<number[]>((a, v, i) => (v === 0 ? [...a, i] : a), []);

  const pattern = [...base];

  if (intensity === "sparse" && active.length > 2) {
    const removeCount = Math.max(1, Math.floor(active.length / 3));
    for (const i of selectDeterministic(active, removeCount, `${seed}_sparse`)) {
      pattern[i] = 0;
    }
  } else if (intensity === "dense" && silent.length > 0) {
    const addCount = Math.max(1, Math.floor(silent.length / 3));
    for (const i of selectDeterministic(silent, addCount, `${seed}_dense`)) {
      pattern[i] = 1;
    }
  }

  const stabCount   = pattern.reduce((s, v) => s + v, 0);
  const offBeatHits = pattern.filter((v, i) => v === 1 && !DOWNBEATS.has(i)).length;
  const syncopation = stabCount > 0 ? offBeatHits / stabCount : 0;

  return { pattern, lane, stabCount, syncopation };
}
