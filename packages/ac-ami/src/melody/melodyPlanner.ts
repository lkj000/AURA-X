import type { Lane } from "@aura-x/engine";

export type MelodyNote = {
  pitch:         number;
  step:          number;
  durationSteps: number;
  velocity:      number;
  chordTone:     boolean;
};

export type MelodyPlan = {
  lane:  Lane;
  key:   string;
  bpm:   number;
  bars:  number;
  notes: MelodyNote[];
};

export type MelodyPlannerOptions = {
  bars?:     number;
  density?:  number;
  register?: "low" | "mid" | "high";
  style?:    "stepwise" | "arpeggiated" | "mixed";
};

// ─────────────────────────────────────────────────────────────────────────────

const ROOT_SEMITONE: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3,
  E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8,
  Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

const MAJOR_PENTA = [0, 2, 4, 7, 9];
const MINOR_PENTA = [0, 3, 5, 7, 10];

const REGISTER_OCTAVE: Record<string, number> = { low: 4, mid: 5, high: 6 };

const LANE_RHYTHM: Partial<Record<Lane, number[]>> = {
  private_school:        [0, 2, 4, 6, 8, 10, 12, 14],
  bacardi:               [0, 4, 8, 12],
  sgija:                 [0, 2, 3, 6, 8, 10, 11, 14],
  stixx_sgija:           [0, 1, 2, 4, 6, 8, 9, 10, 12, 14],
  mbiraiano:             [0, 3, 4, 7, 8, 11, 12, 15],
  three_step:            [0, 3, 6, 9, 12],
  gqom_fusion:           [0, 4, 8, 12],
  hybrid_rnb_amapiano:   [0, 2, 4, 8, 10, 12],
};

const DEFAULT_RHYTHM: number[] = [0, 4, 8, 12];

// ─────────────────────────────────────────────────────────────────────────────

function parseKey(key: string): { root: number; minor: boolean } {
  const minor = key.endsWith("m");
  const note  = minor ? key.slice(0, -1) : key;
  const root  = ROOT_SEMITONE[note] ?? 0;
  return { root, minor };
}

function buildScale(root: number, minor: boolean, octave: number): number[] {
  const intervals = minor ? MINOR_PENTA : MAJOR_PENTA;
  const base      = (octave + 1) * 12 + root;
  const scale: number[] = [];
  for (let o = 0; o < 2; o++) {
    for (const iv of intervals) scale.push(base + o * 12 + iv);
  }
  return scale;
}

function barRhythm(lane: Lane, density: number): number[] {
  const base = (LANE_RHYTHM[lane] ?? DEFAULT_RHYTHM).slice();
  if (density < 0.35) return base.filter((_, i) => i % 2 === 0);
  if (density >= 0.80) {
    const extra = new Set(base);
    for (let s = 0; s < 16; s++) if (s % 2 === 0) extra.add(s);
    return Array.from(extra).sort((a, b) => a - b);
  }
  return base;
}

function contourIdx(
  noteIndex: number,
  barStep:   number,
  scale:     number[],
  style:     string,
  prev:      number,
): number {
  const len = scale.length;
  if (style === "arpeggiated") {
    return noteIndex % len;
  }
  if (style === "stepwise") {
    const dir = barStep < 8 ? 1 : -1;
    return Math.min(len - 1, Math.max(0, prev + dir));
  }
  // mixed: arpeggiated on even notes, stepwise on odd
  if (noteIndex % 2 === 0) return noteIndex % len;
  const dir = barStep < 8 ? 1 : -1;
  return Math.min(len - 1, Math.max(0, prev + dir));
}

function noteVelocity(barStep: number, density: number): number {
  const strong = barStep % 8 === 0;
  const base   = strong ? 95 : 68;
  return Math.round(base * (0.7 + density * 0.3));
}

function noteDuration(density: number): number {
  if (density < 0.35) return 3;
  if (density < 0.65) return 2;
  return 1;
}

// ─────────────────────────────────────────────────────────────────────────────

export function planMelody(
  lane:    Lane,
  key:     string,
  bpm:     number,
  opts:    MelodyPlannerOptions = {},
): MelodyPlan {
  const bars     = Math.min(32, Math.max(1, opts.bars     ?? 4));
  const density  = Math.min(1,  Math.max(0, opts.density  ?? 0.5));
  const register = opts.register ?? "mid";
  const style    = opts.style    ?? "mixed";

  const { root, minor } = parseKey(key);
  const octave = REGISTER_OCTAVE[register];
  const scale  = buildScale(root, minor, octave);
  const rhythm = barRhythm(lane, density);
  const dur    = noteDuration(density);

  const notes: MelodyNote[] = [];
  let prevIdx = 0;
  let globalNoteIdx = 0;
  const STEPS_PER_BAR = 16;

  for (let bar = 0; bar < bars; bar++) {
    for (const barStep of rhythm) {
      const step    = bar * STEPS_PER_BAR + barStep;
      const idx     = contourIdx(globalNoteIdx, barStep, scale, style, prevIdx);
      const pitch   = scale[idx];
      const vel     = noteVelocity(barStep, density);
      const chord   = MAJOR_PENTA.includes((pitch - root + 144) % 12);
      notes.push({ pitch, step, durationSteps: dur, velocity: vel, chordTone: chord });
      prevIdx = idx;
      globalNoteIdx++;
    }
  }

  return { lane, key, bpm, bars, notes };
}
