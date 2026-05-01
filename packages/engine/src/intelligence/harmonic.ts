// Harmonic analysis — chroma-based key detection with Amapiano vocabulary.
// Mirrors aura-x-engine/intelligence/harmonic.py

import { computeChroma } from "../_dsp";
import { clamp } from "../_utils";
import type { HarmonicProfile, AmapianChord } from "../types";

// Pitch class names (chromatic, A4=440)
const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Krumhansl-Schmuckler key profiles (major / minor)
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Amapiano-typical minor keys in preference order
const AMAPIANO_MINOR_KEYS = ["A", "D", "F", "G", "E", "B", "C"];

// Typical Amapiano chord qualities
const AMAPIANO_QUALITIES = ["min7", "maj7", "dom7", "min9", "maj9", "min11"];

// Typical Amapiano progressions (in semitone steps from tonic)
const PROGRESSION_TEMPLATES = [
  [0, 9, 4, 11], // i–VI–III–VII
  [0, 5, 7],     // i–iv–V
  [0, 10, 8, 7], // i–bVII–bVI–V
];

function correlate(chroma: Float64Array, profile: number[]): number {
  // Pearson correlation between chroma and profile
  const n  = 12;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0, sy2 = 0;
  for (let i = 0; i < n; i++) {
    sx += chroma[i]; sy += profile[i];
    sxy += chroma[i] * profile[i];
    sx2 += chroma[i] * chroma[i];
    sy2 += profile[i] * profile[i];
  }
  const num  = n * sxy - sx * sy;
  const den  = Math.sqrt((n * sx2 - sx * sx) * (n * sy2 - sy * sy));
  return den < 1e-10 ? 0 : num / den;
}

function detectKey(chroma: Float64Array): { key: string; mode: "minor" | "major"; correlation: number } {
  let best = { key: "A", mode: "minor" as "minor" | "major", correlation: -Infinity };

  for (let root = 0; root < 12; root++) {
    // Rotate chroma to start at this root
    const rotated = new Float64Array(12);
    for (let i = 0; i < 12; i++) rotated[i] = chroma[(i + root) % 12];

    const majCorr = correlate(rotated, MAJOR_PROFILE);
    const minCorr = correlate(rotated, MINOR_PROFILE);

    if (majCorr > best.correlation) {
      best = { key: PITCH_NAMES[root], mode: "major", correlation: majCorr };
    }
    if (minCorr > best.correlation) {
      best = { key: PITCH_NAMES[root], mode: "minor", correlation: minCorr };
    }
  }

  return best;
}

function buildChordProgression(rootPc: number, chroma: Float64Array): AmapianChord[] {
  const template = PROGRESSION_TEMPLATES[0]; // i–VI–III–VII is most common
  return template.map((offset) => {
    const pc    = (rootPc + offset) % 12;
    const root  = PITCH_NAMES[pc];
    // Assign quality based on chroma energy — minor if adjacent pitch active
    const minor3rd = chroma[(pc + 3) % 12] > 0.4;
    const quality   = minor3rd ? "min7" : "maj7";
    const bassNote  = root;

    // Wide-spaced MIDI voicing (root + 3rd + 7th + 9th an octave up)
    const base = 36 + pc;
    const third = base + (minor3rd ? 3 : 4);
    const seventh = base + (minor3rd ? 10 : 11);
    const ninth  = base + 14;

    return { root, quality, bassNote, voicing: [base, third, seventh, ninth] as number[] };
  });
}

function amapianoCompatibility(key: string, mode: string, chroma: Float64Array): number {
  // Amapiano prefers minor keys from the typical set
  const keyMatch = AMAPIANO_MINOR_KEYS.includes(key) ? 0.5 : 0.0;
  const modeMatch = mode === "minor" ? 0.3 : 0.1;

  // Harmonic richness — how many pitch classes are active (> 0.3)
  let activeCount = 0;
  for (let i = 0; i < 12; i++) { if (chroma[i] > 0.3) activeCount++; }
  const richness = clamp(activeCount / 7, 0, 1) * 0.2;

  return clamp(keyMatch + modeMatch + richness);
}

export function analyzeHarmony(samples: number[], sampleRate: number): HarmonicProfile | null {
  if (samples.length < sampleRate * 0.5) return null;

  const chroma = computeChroma(samples, sampleRate);
  const { key, mode } = detectKey(chroma);

  const rootPc    = PITCH_NAMES.indexOf(key);
  const chords    = buildChordProgression(rootPc, chroma);

  let activeCount = 0;
  for (let i = 0; i < 12; i++) { if (chroma[i] > 0.3) activeCount++; }
  const harmonicRichness = activeCount / 12;

  // Simple bass intervals: tonic + 5th + minor 7th
  const bassIntervals = [0, 7, 10] as number[];

  const compatibility = amapianoCompatibility(key, mode, chroma);

  return {
    key:                   `${key}${mode === "minor" ? "m" : ""}`,
    mode,
    chromaVector:          Array.from(chroma) as readonly number[],
    chordProgression:      chords,
    harmonicRichness,
    bassIntervals:         bassIntervals as readonly number[],
    amapianoCompatibility: compatibility,
  };
}
