// Chord Inversion Generator — E-60
// Generates root position and all valid close-position inversions of a chord.
//
// Algorithm per inversion n (0 = root, 1 = first, …):
//   Repeat n times: remove the lowest note, append it + 12 to the top.
//
// Inversions available:
//   root   — [C4, E4, G4]
//   first  — [E4, G4, C5]
//   second — [G4, C5, E5]
//   third  — [B4, D5, F5, G5]  (4-note chords only)
//
// Inversions beyond (notes.length − 1) are skipped.
// Notes are deduplicated and clamped to [0, 127] before processing.

import type { InversionType, ChordInversion, InversionSet } from "../types";

export interface InversionOptions {
  notes?:  number[];          // MIDI note numbers (default [])
  types?:  InversionType[];   // which inversions to include (default: all valid)
}

const INVERSION_N: Record<InversionType, number> = {
  root: 0, first: 1, second: 2, third: 3,
};

const ALL_TYPES: InversionType[] = ["root", "first", "second", "third"];

function applyInversion(sorted: number[], n: number): number[] {
  const result = [...sorted];
  for (let i = 0; i < n; i++) {
    const lowest = result.shift()!;
    result.push(Math.min(127, lowest + 12));
  }
  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateInversions(options: InversionOptions = {}): InversionSet {
  const raw = options.notes ?? [];

  if (raw.length === 0) return { original: [], inversions: [] };

  const original = [...new Set(
    raw.map((n) => Math.max(0, Math.min(127, Math.round(n))))
  )].sort((a, b) => a - b);

  const maxN       = original.length - 1;
  const requested  = options.types ?? ALL_TYPES.slice(0, maxN + 1);

  const inversions: ChordInversion[] = [];

  for (const type of requested) {
    const n = INVERSION_N[type];
    if (n > maxN) continue;

    const notes = applyInversion(original, n);
    inversions.push({
      type,
      notes,
      bassNote: notes[0],
      span:     notes[notes.length - 1] - notes[0],
    });
  }

  return { original, inversions };
}
