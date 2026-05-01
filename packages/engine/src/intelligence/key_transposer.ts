// Key Transposer — E-23
// Transposes a ChordProgression to a target key using the shortest chromatic
// path (≤ 6 semitones). Updates all MIDI note numbers and chord symbol roots.
// Enharmonic spelling follows flat conventions for flat keys; otherwise natural.
//
// Shortest-path rule: offset = ((targetPc − sourcePc + 12) % 12);
//   if offset > 6 → use offset − 12 (descend rather than ascend 7+ semitones).

import type { ChordProgression, ChordVoicing, TransposeResult } from "../types";

// ── Note / pitch-class tables ─────────────────────────────────────────────────

const NOTE_PC: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
  Cb: 11, Db: 1, Eb: 3, Fb: 4, Gb: 6, Ab: 8, Bb: 10,
};

// Canonical name for each pitch class — flats preferred for black keys
const PC_NAME: string[] = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function noteToPC(name: string): number {
  return NOTE_PC[name] ?? 0;
}

function pcToName(pc: number): string {
  return PC_NAME[((pc % 12) + 12) % 12];
}

// ── Chord symbol parser / rebuilder ──────────────────────────────────────────

interface ParsedChord { root: string; suffix: string }

function parseChordSymbol(symbol: string): ParsedChord {
  // 2-char flat roots: Ab, Bb, Cb, Db, Eb, Fb, Gb
  if (symbol.length >= 2 && symbol[1] === "b" && "ABCDEFG".includes(symbol[0])) {
    return { root: symbol.slice(0, 2), suffix: symbol.slice(2) };
  }
  return { root: symbol[0] ?? "", suffix: symbol.slice(1) };
}

function shiftChordSymbol(symbol: string, semitones: number): string {
  const { root, suffix } = parseChordSymbol(symbol);
  const newPc   = (noteToPC(root) + semitones + 120) % 12;
  return pcToName(newPc) + suffix;
}

function shiftKeyString(key: string, semitones: number): string {
  // key looks like "Am", "Gm", "Dm", "Cm", "Bbm" — root + optional 'm'/'maj'/etc
  const { root, suffix } = parseChordSymbol(key);
  const newPc = (noteToPC(root) + semitones + 120) % 12;
  return pcToName(newPc) + suffix;
}

// ── Voicing transposer ────────────────────────────────────────────────────────

function transposeVoicing(voicing: ChordVoicing, semitones: number): ChordVoicing {
  return {
    ...voicing,
    chordSymbol: shiftChordSymbol(voicing.chordSymbol, semitones),
    rootMidi:    voicing.rootMidi + semitones,
    notes:       voicing.notes.map((n) => n + semitones),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function transposeProgression(
  progression: ChordProgression,
  targetKey:   string,
): TransposeResult {
  const originalKey  = progression.key;
  const { root: srcRoot } = parseChordSymbol(originalKey);
  const { root: tgtRoot } = parseChordSymbol(targetKey);

  const srcPc    = noteToPC(srcRoot);
  const tgtPc    = noteToPC(tgtRoot);
  const rawOffset = ((tgtPc - srcPc) + 12) % 12;
  // Shortest path: prefer descending if ascending would be > 6 semitones
  const semitones = rawOffset > 6 ? rawOffset - 12 : rawOffset;

  if (semitones === 0) {
    return { progression, originalKey, targetKey, semitones: 0 };
  }

  const transposedVoicings = progression.voicings.map((v) => transposeVoicing(v, semitones));

  const transposed: ChordProgression = {
    ...progression,
    key:      shiftKeyString(originalKey, semitones),
    voicings: transposedVoicings,
  };

  return { progression: transposed, originalKey, targetKey, semitones };
}
