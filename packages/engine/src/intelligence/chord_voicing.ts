// Chord Voicing Engine — E-17
// Generates Amapiano-style 4-chord progressions per lane. Each voicing omits
// the 5th for wider spread, places the root in bass (octave 3), and spreads
// colour tones across octaves 4–5.
//
// MIDI octave convention: C3=48, C4=60, C5=72
// Amapiano voicing rule: root (bass), then m3/M3, m7/maj7, M9/P11 — no 5th

import type { Lane, ChordFunction, ChordVoicing, ChordProgression } from "../types";

// ── Note / interval tables ────────────────────────────────────────────────────

const NOTE_PC: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
  Cb: 11, Db: 1, Eb: 3, Gb: 6, Ab: 8, Bb: 10,
};

// Amapiano chord intervals (5th omitted for wide voicing)
const CHORD_INTERVALS: Record<string, number[]> = {
  m7:   [0, 3, 10],          // root, m3, m7
  m9:   [0, 3, 10, 14],      // root, m3, m7, M9
  m11:  [0, 3, 10, 17],      // root, m3, m7, P11
  maj7: [0, 4, 11],          // root, M3, maj7
  maj9: [0, 4, 11, 14],      // root, M3, maj7, M9
  m:    [0, 3, 7],           // pure minor (organic, no extension)
  m7b5: [0, 3, 6, 10],       // half-diminished — dark tension
};

// ── Per-lane progression templates ───────────────────────────────────────────
// Each entry: [rootName, chordType, chordFunction, tensionScore]

type ProgEntry = [string, string, ChordFunction, number];

const LANE_PROGRESSIONS: Record<Lane, ProgEntry[]> = {
  private_school: [
    ["A", "m9",   "tonic",       0.18],
    ["D", "m9",   "subdominant", 0.22],
    ["E", "m7",   "dominant",    0.28],
    ["F", "maj7", "tension",     0.32],
  ],
  sgija: [
    ["G", "m7",  "tonic",       0.20],
    ["C", "m7",  "subdominant", 0.22],
    ["D", "m7",  "dominant",    0.30],
    ["G", "m7",  "tonic",       0.20],
  ],
  bacardi: [
    ["A", "m7",  "tonic",       0.22],
    ["F", "m7",  "subdominant", 0.25],
    ["C", "m7",  "dominant",    0.30],
    ["G", "m7",  "tension",     0.35],
  ],
  stixx_sgija: [
    ["C", "m7",  "tonic",       0.25],
    ["F", "m7",  "subdominant", 0.28],
    ["G", "m7",  "dominant",    0.35],
    ["C", "m7",  "tonic",       0.25],
  ],
  mbiraiano: [
    ["A", "m",   "tonic",       0.12],
    ["E", "m",   "subdominant", 0.15],
    ["D", "m",   "dominant",    0.18],
    ["A", "m",   "tonic",       0.12],
  ],
  three_step: [
    ["D", "m9",  "tonic",       0.20],
    ["G", "m11", "subdominant", 0.28],
    ["A", "m7",  "dominant",    0.30],
    ["F", "maj9","tension",     0.35],
  ],
  gqom_fusion: [
    ["C",  "m7",   "tonic",       0.30],
    ["F",  "m7",   "subdominant", 0.32],
    ["Bb", "m7",   "dominant",    0.38],
    ["C",  "m7b5", "tension",     0.55],
  ],
  hybrid_rnb_amapiano: [
    ["A", "m9",  "tonic",       0.18],
    ["D", "m9",  "subdominant", 0.22],
    ["G", "m7",  "dominant",    0.28],
    ["E", "m7",  "tension",     0.30],
  ],
};

// The tonic key label used in each lane's progression
const LANE_KEY: Record<Lane, string> = {
  private_school:      "Am",
  sgija:               "Gm",
  bacardi:             "Am",
  stixx_sgija:         "Cm",
  mbiraiano:           "Am",
  three_step:          "Dm",
  gqom_fusion:         "Cm",
  hybrid_rnb_amapiano: "Am",
};

// ── Voicing builder ───────────────────────────────────────────────────────────

function buildVoicing(entry: ProgEntry): ChordVoicing {
  const [rootName, chordType, fn, tension] = entry;
  const rootPc    = NOTE_PC[rootName] ?? 0;
  const intervals = CHORD_INTERVALS[chordType] ?? [0, 3, 7];

  const bassNote  = 48 + rootPc;                      // octave 3
  const upperNotes = intervals.map((i) => 60 + rootPc + i); // octave 4+

  return {
    chordSymbol: `${rootName}${chordType}`,
    rootMidi:    bassNote,
    notes:       [bassNote, ...upperNotes],
    function:    fn,
    tension,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface VoicingOptions {
  lane: Lane;
}

export function buildChordProgression(options: VoicingOptions): ChordProgression {
  const { lane } = options;
  const voicings = LANE_PROGRESSIONS[lane].map(buildVoicing);

  return {
    lane,
    key:          LANE_KEY[lane],
    voicings,
    loopable:     true,
    amapianoStyle: true,
  };
}
