// Scale Quantizer — E-32
// Snaps an array of MIDI note numbers to the nearest degree of a given
// key / scale using the shortest chromatic path (≤ 6 semitones).
//
// Algorithm per note:
//   1. Derive pitch class: notePC = note % 12
//   2. Compute interval from root: (notePC − rootPC + 12) % 12
//   3. Find the scale interval whose shift |targetIv − interval| is minimal
//      (wrapping at 12); resolve ties by taking the first (lower) candidate.
//   4. Compute signed shift; apply ±12 correction if |shift| > 6.
//   5. quantized = clamp(note + shift, 0, 127)
//
// Scales (semitone intervals from root):
//   major            [0,2,4,5,7,9,11]      — Ionian
//   natural_minor    [0,2,3,5,7,8,10]      — Aeolian
//   dorian           [0,2,3,5,7,9,10]      — jazz/Amapiano favourite
//   phrygian         [0,1,3,5,7,8,10]
//   mixolydian       [0,2,4,5,7,9,10]
//   minor_pentatonic [0,3,5,7,10]          — 5-note minor
//   major_pentatonic [0,2,4,7,9]           — 5-note major
//   blues            [0,3,5,6,7,10]        — minor pent + b5 blue note

import type { ScaleName, QuantizedNote, ScaleQuantizeResult } from "../types";

const NOTE_PC: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
  Cb: 11, Db: 1, Eb: 3, Fb: 4, Gb: 6, Ab: 8, Bb: 10,
  "C#": 1, "D#": 3, "F#": 6, "G#": 8, "A#": 10,
};

export const SCALE_INTERVALS: Record<ScaleName, readonly number[]> = {
  major:            [0, 2, 4, 5, 7, 9, 11],
  natural_minor:    [0, 2, 3, 5, 7, 8, 10],
  dorian:           [0, 2, 3, 5, 7, 9, 10],
  phrygian:         [0, 1, 3, 5, 7, 8, 10],
  mixolydian:       [0, 2, 4, 5, 7, 9, 10],
  minor_pentatonic: [0, 3, 5, 7, 10],
  major_pentatonic: [0, 2, 4, 7, 9],
  blues:            [0, 3, 5, 6, 7, 10],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function nearestInterval(intervalFromRoot: number, intervals: readonly number[]): number {
  let bestIv       = intervals[0];
  let bestAbsShift = 12;

  for (const iv of intervals) {
    let shift = iv - intervalFromRoot;
    if (shift >  6) shift -= 12;
    if (shift < -6) shift += 12;
    const abs = Math.abs(shift);
    if (abs < bestAbsShift) { bestAbsShift = abs; bestIv = iv; }
  }
  return bestIv;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function quantizeToScale(
  notes: number[],
  root:  string,
  scale: ScaleName,
): ScaleQuantizeResult {
  const rootPC    = NOTE_PC[root] ?? 0;
  const intervals = SCALE_INTERVALS[scale];

  const quantizedNotes: QuantizedNote[] = notes.map((note) => {
    const n        = Math.max(0, Math.min(127, note));
    const notePC   = ((n % 12) + 12) % 12;
    const interval = ((notePC - rootPC) + 12) % 12;
    const targetIv = nearestInterval(interval, intervals);

    let shift = targetIv - interval;
    if (shift >  6) shift -= 12;
    if (shift < -6) shift += 12;

    const quantized = Math.max(0, Math.min(127, n + shift));
    return { original: n, quantized, shiftSemitones: shift };
  });

  const movedCount = quantizedNotes.filter((n) => n.shiftSemitones !== 0).length;
  const maxShift   = quantizedNotes.reduce((m, n) => Math.max(m, Math.abs(n.shiftSemitones)), 0);

  return { root, scale, notes: quantizedNotes, movedCount, maxShift };
}
