// Virtual Stem Decomposer — E-03
// Frequency-band decomposition into 5 Amapiano virtual stems using FFT analysis.
// No external ML models — pure stdlib DSP.
//
// Stems: sub_bass (20–60 Hz) · log_drum (60–200 Hz) · chord_pad (200–2000 Hz)
//        percussion (2000–8000 Hz) · air (8000–20000 Hz)
//
// Per stem: energy fraction, tonality (tonal vs. noise), transience (block CV),
//           presenceScore (enriched with fingerprints where available), isActive flag.

import { fftInPlace } from "../_dsp";
import { clamp } from "../_utils";
import type { AudioFeatures, StemName, VirtualStem, StemDecomposition } from "../types";

// ── Band definitions ──────────────────────────────────────────────────────────

const STEM_BANDS: Record<StemName, readonly [number, number]> = {
  sub_bass:   [20,    60],
  log_drum:   [60,   200],
  chord_pad:  [200, 2000],
  percussion: [2000, 8000],
  air:        [8000, 20000],
} as const;

// Fraction of total-stem energy that constitutes "full" presence for each stem.
// Values are calibrated against typical Amapiano track energy distributions.
const PRESENCE_SCALE: Record<StemName, number> = {
  sub_bass:   0.10,
  log_drum:   0.25,
  chord_pad:  0.32,
  percussion: 0.18,
  air:        0.06,
};

// isActive threshold: presenceScore at which a stem is considered meaningfully present
const ACTIVE_THRESHOLD = 0.15;

// Ideal relative energy fractions for an Amapiano mix (lo, hi)
const STEM_TARGETS: Record<StemName, readonly [number, number]> = {
  sub_bass:   [0.03, 0.18],
  log_drum:   [0.18, 0.48],
  chord_pad:  [0.18, 0.48],
  percussion: [0.05, 0.25],
  air:        [0.01, 0.12],
} as const;

const STEM_ORDER: StemName[] = ["sub_bass", "log_drum", "chord_pad", "percussion", "air"];

// ── FFT helpers ───────────────────────────────────────────────────────────────

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// Energy fraction of total FFT power within [lowHz, highHz]
function bandEnergyFraction(
  re: Float64Array, im: Float64Array,
  binWidth: number,
  lowHz: number, highHz: number,
): number {
  let bandPow = 0, totalPow = 0;
  const halfN = re.length >> 1;
  for (let k = 1; k < halfN; k++) {
    const pw = re[k] * re[k] + im[k] * im[k];
    totalPow += pw;
    const hz = k * binWidth;
    if (hz >= lowHz && hz <= highHz) bandPow += pw;
  }
  return totalPow > 0 ? bandPow / totalPow : 0;
}

// Spectral flatness in band: 0 = pure tone, 1 = white noise
function bandTonality(
  re: Float64Array, im: Float64Array,
  binWidth: number,
  lowHz: number, highHz: number,
): number {
  const mags: number[] = [];
  const halfN = re.length >> 1;
  for (let k = 1; k < halfN; k++) {
    const hz = k * binWidth;
    if (hz >= lowHz && hz <= highHz) {
      mags.push(Math.sqrt(re[k] * re[k] + im[k] * im[k]));
    }
  }
  if (mags.length < 2) return 0.5;
  const logSum   = mags.reduce((s, v) => s + Math.log(v + 1e-12), 0);
  const geomMean = Math.exp(logSum / mags.length);
  const arithMean = mags.reduce((s, v) => s + v, 0) / mags.length;
  // flatness ∈ [0,1]; tonality = 1 - flatness
  const flatness = arithMean > 0 ? geomMean / arithMean : 0;
  return clamp(1 - flatness);
}

// Per-band transience: coefficient of variation of block energies over time
function bandTransience(
  samples: number[],
  sampleRate: number,
  lowHz: number, highHz: number,
  windowSize = 1024,
): number {
  const numWindows = Math.floor(samples.length / windowSize);
  if (numWindows < 3) return 0.50;

  const re = new Float64Array(windowSize);
  const im = new Float64Array(windowSize);
  const freqRes = sampleRate / windowSize;
  const windowEnergies: number[] = [];

  for (let w = 0; w < numWindows; w++) {
    re.fill(0); im.fill(0);
    const start = w * windowSize;
    for (let i = 0; i < windowSize; i++) re[i] = samples[start + i] ?? 0;
    fftInPlace(re, im);
    let bandPow = 0;
    for (let k = 1; k < windowSize >> 1; k++) {
      const hz = k * freqRes;
      if (hz >= lowHz && hz <= highHz) bandPow += re[k] * re[k] + im[k] * im[k];
    }
    windowEnergies.push(bandPow);
  }

  const meanE = windowEnergies.reduce((s, v) => s + v, 0) / windowEnergies.length;
  if (meanE === 0) return 0;
  const variance = windowEnergies.reduce((s, v) => s + (v - meanE) ** 2, 0) / windowEnergies.length;
  return clamp(Math.sqrt(variance) / (meanE * 3)); // CV/3 → [0,1] at CV=3
}

// ── Presence scoring ──────────────────────────────────────────────────────────

function stemPresence(
  name: StemName,
  energy: number,
  features: AudioFeatures | undefined,
): number {
  const base = clamp(energy / PRESENCE_SCALE[name]);

  if (name === "log_drum" && features?.logDrum) {
    const ld = features.logDrum;
    return clamp(
      0.50 * base +
      0.30 * ld.woodResonance +
      0.20 * (ld.isLogDrum ? 1 : ld.confidence),
    );
  }

  if (name === "chord_pad" && features?.harmonic) {
    const h = features.harmonic;
    return clamp(
      0.50 * base +
      0.30 * h.harmonicRichness +
      0.20 * h.amapianoCompatibility,
    );
  }

  return base;
}

// ── Balance diagnostics ───────────────────────────────────────────────────────

function balanceDiagnostics(
  stems: VirtualStem[],
  totalEnergy: number,
): { stemsInTarget: number; issues: string[] } {
  const issues: string[] = [];
  let stemsInTarget = 0;

  for (const stem of stems) {
    const [lo, hi] = STEM_TARGETS[stem.name];
    const frac = totalEnergy > 0 ? stem.energy / totalEnergy : 0;
    if (frac >= lo && frac <= hi) {
      stemsInTarget++;
    } else {
      const pct = (frac * 100).toFixed(1);
      if (stem.name === "log_drum" && frac < lo)
        issues.push(`Log drum underrepresented (${pct}% < ${(lo * 100).toFixed(0)}%) — boost 60–200 Hz`);
      else if (stem.name === "log_drum" && frac > hi)
        issues.push(`Log drum over-dominant (${pct}% > ${(hi * 100).toFixed(0)}%) — reduce log drum level`);
      else if (stem.name === "chord_pad" && frac < lo)
        issues.push(`Chord pad too quiet (${pct}%) — add piano/keys layers`);
      else if (stem.name === "chord_pad" && frac > hi)
        issues.push(`Chord pad over-dominant (${pct}%) — balance with log drum`);
      else if (stem.name === "air" && frac > hi)
        issues.push(`Excessive high-frequency content (${pct}%) — roll off above 8 kHz`);
    }
  }

  return { stemsInTarget, issues };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function decomposeStems(
  samples: number[],
  sampleRate: number,
  features?: AudioFeatures,
): StemDecomposition {
  // Single large FFT for energy + tonality (4096 samples, Hann-windowed)
  const N    = Math.min(4096, samples.length);
  const size = nextPow2(N);
  const re   = new Float64Array(size);
  const im   = new Float64Array(size);

  for (let i = 0; i < N; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    re[i] = (samples[i] ?? 0) * w;
  }
  fftInPlace(re, im);
  const binWidth = sampleRate / size;

  const stems: VirtualStem[] = STEM_ORDER.map((name) => {
    const [lo, hi] = STEM_BANDS[name];
    const energy     = bandEnergyFraction(re, im, binWidth, lo, hi);
    const tonality   = bandTonality(re, im, binWidth, lo, hi);
    const transience = bandTransience(samples, sampleRate, lo, hi);
    const pScore     = stemPresence(name, energy, features);

    return {
      name,
      bandHz:        [lo, hi] as const,
      energy,
      tonality,
      transience,
      presenceScore: pScore,
      isActive:      pScore >= ACTIVE_THRESHOLD,
    };
  });

  const totalEnergy = stems.reduce((s, st) => s + st.energy, 0);
  const dominantStem = stems.reduce((best, s) => s.energy > best.energy ? s : best).name;

  const { stemsInTarget, issues } = balanceDiagnostics(stems, totalEnergy);
  const amapianoBalance = stemsInTarget / STEM_ORDER.length;

  const stemMap = Object.fromEntries(
    stems.map((s) => [s.name, s]),
  ) as Record<StemName, VirtualStem>;

  return {
    stems,
    stemMap,
    totalEnergy,
    dominantStem,
    amapianoBalance,
    balanceIssues: issues,
  };
}
