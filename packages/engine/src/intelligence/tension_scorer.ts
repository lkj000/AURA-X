// Harmonic Tension Scorer — E-33
// Scores each ChordVoicing in a ChordProgression for harmonic dissonance by
// computing the mean pairwise interval dissonance across all note pairs.
//
// Interval dissonance weights (directed, mod 12):
//   0 unison   0.00   7 P5     0.05
//   1 m2       0.90   8 m6     0.20
//   2 M2       0.65   9 M6     0.10
//   3 m3       0.15  10 m7     0.50
//   4 M3       0.10  11 M7     0.70
//   5 P4       0.15
//   6 tritone  1.00
//
// For a chord with N notes there are N(N−1)/2 pairs.  Each pair contributes
// its interval dissonance weight.  The mean is the chord's tension score.
//
// Tension labels:
//   resolved  < 0.15
//   mild      < 0.30
//   moderate  < 0.50
//   tense     < 0.70
//   dissonant ≥ 0.70

import { clamp } from "../_utils";
import type { ChordProgression, ChordTension, TensionArc, TensionLabel } from "../types";

const DISSONANCE: readonly number[] = [
  0.00,  // 0  unison
  0.90,  // 1  m2
  0.65,  // 2  M2
  0.15,  // 3  m3
  0.10,  // 4  M3
  0.15,  // 5  P4
  1.00,  // 6  tritone
  0.05,  // 7  P5
  0.20,  // 8  m6
  0.10,  // 9  M6
  0.50,  // 10 m7
  0.70,  // 11 M7
];

function labelFromTension(t: number): TensionLabel {
  if (t < 0.15) return "resolved";
  if (t < 0.30) return "mild";
  if (t < 0.50) return "moderate";
  if (t < 0.70) return "tense";
  return "dissonant";
}

function chordTension(notes: readonly number[]): number {
  if (notes.length < 2) return 0;
  let total = 0;
  let count = 0;
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      const diff = Math.abs(notes[i] - notes[j]) % 12;
      total += DISSONANCE[diff];
      count++;
    }
  }
  return count > 0 ? clamp(total / count) : 0;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function scoreTension(progression: ChordProgression): TensionArc {
  if (progression.voicings.length === 0) {
    return { key: progression.key, chords: [], meanTension: 0, peakTension: 0, resolution: 0 };
  }

  const chords: ChordTension[] = progression.voicings.map((v) => {
    const tension = chordTension(v.notes);
    return { chordSymbol: v.chordSymbol, tension, label: labelFromTension(tension) };
  });

  const meanTension = chords.reduce((s, c) => s + c.tension, 0) / chords.length;
  const peakTension = chords.reduce((m, c) => Math.max(m, c.tension), 0);
  const resolution  = chords[chords.length - 1].tension;

  return { key: progression.key, chords, meanTension, peakTension, resolution };
}
