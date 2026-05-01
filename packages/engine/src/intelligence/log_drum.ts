// Log drum fingerprinting — the heart of Amapiano authenticity.
// Mirrors aura-x-engine/intelligence/log_drum.py
//
// The Amapiano log drum is identified by:
//   - Fundamental in 60–200 Hz (target ~110 Hz)
//   - Pitch "glide" (wobble) ≥ 0.5 semitones
//   - Harmonic-rich, wood-like timbre
//   - Short attack (< 40 ms), moderate decay (30–80 dB/s)
//   - wood_resonance ≥ 0.35 and confidence ≥ 0.55

import { gaussScore, clamp } from "../_utils";
import { fftInPlace, estimateFundamental } from "../_dsp";
import type { LogDrumFingerprint } from "../types";

const FRAME_SIZE = 256;

function detectOnsetFrame(samples: number[]): number {
  const energy: number[] = [];
  for (let i = 0; i + FRAME_SIZE <= samples.length; i += FRAME_SIZE) {
    let rms = 0;
    for (let j = 0; j < FRAME_SIZE; j++) rms += samples[i + j] ** 2;
    energy.push(Math.sqrt(rms / FRAME_SIZE));
  }
  const maxE = Math.max(0, ...energy);
  const threshold = maxE * 0.40;

  for (let i = 1; i < energy.length; i++) {
    if (energy[i] > threshold && energy[i] > energy[i - 1]) return i;
  }
  return 0;
}

function harmonicRatioFromFft(samples: number[], sampleRate: number, fundamental: number): number {
  const N    = 512;
  const n    = Math.min(N, samples.length);
  const size = nextPow2(n);
  const re   = new Float64Array(size);
  const im   = new Float64Array(size);

  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    re[i] = samples[i] * w;
  }
  fftInPlace(re, im);

  const binWidth = sampleRate / size;
  let harmonicE = 0, totalE = 1e-10;

  for (let k = 1; k < size / 2; k++) {
    const freq  = k * binWidth;
    const power = re[k] * re[k] + im[k] * im[k];
    totalE += power;
    const ratio         = freq / fundamental;
    const nearestHarm   = Math.round(ratio);
    if (nearestHarm >= 1 && Math.abs(ratio - nearestHarm) < 0.15) harmonicE += power;
  }

  return clamp(harmonicE / totalE);
}

export function extractLogDrumFingerprint(
  samples: number[],
  sampleRate: number,
): LogDrumFingerprint | null {
  if (samples.length < sampleRate * 0.05) return null;

  // 1. Find onset
  const onsetFrame   = detectOnsetFrame(samples);
  const attackStart  = onsetFrame * FRAME_SIZE;
  const attackLen    = Math.floor(sampleRate * 0.25); // 250 ms attack window
  const attackWindow = samples.slice(attackStart, Math.min(attackStart + attackLen, samples.length));

  if (attackWindow.length < 64) return null;

  // 2. Fundamental frequency
  const fundamental = estimateFundamental(attackWindow, sampleRate);
  if (fundamental < 50 || fundamental > 300) return null;

  // 3. Attack time (onset → peak amplitude, in ms)
  let peakIdx = 0, peakAmp = 0;
  for (let i = 0; i < attackWindow.length; i++) {
    const a = Math.abs(attackWindow[i]);
    if (a > peakAmp) { peakAmp = a; peakIdx = i; }
  }
  const attackMs = (peakIdx / sampleRate) * 1000;

  // 4. Decay rate (peak → end of window, dB/s)
  const peakDb  = 20 * Math.log10(Math.max(1e-10, peakAmp));
  const endAmp  = Math.abs(attackWindow[attackWindow.length - 1]);
  const endDb   = 20 * Math.log10(Math.max(1e-10, endAmp));
  const winSec  = attackWindow.length / sampleRate;
  const decayDbPerSec = Math.max(0, (peakDb - endDb) / winSec);

  // 5. Harmonic ratio via FFT
  const harmonicRatio = harmonicRatioFromFft(attackWindow, sampleRate, fundamental);
  const noiseRatio    = 1 - harmonicRatio;

  // 6. Pitch glide (early vs late fundamental)
  const split   = Math.floor(attackWindow.length * 0.35);
  const earlyF  = estimateFundamental(attackWindow.slice(0, split), sampleRate);
  const lateF   = estimateFundamental(attackWindow.slice(Math.floor(attackWindow.length * 0.55)), sampleRate);
  const pitchGlideSemitones = earlyF > 0 && lateF > 0
    ? Math.abs(12 * Math.log2(lateF / earlyF))
    : 0;

  // 7. Wood resonance composite (ported from Python)
  //    35% fundamental score + 25% pitch glide + 20% tonal character + 20% decay
  const fundScore   = gaussScore(fundamental, 110, 30);
  const glideScore  = clamp(pitchGlideSemitones / 3);      // 3 st = perfect
  const toneScore   = harmonicRatio;
  const decayScore  = gaussScore(decayDbPerSec, 50, 20);   // 30–80 dB/s ideal

  const woodResonance = clamp(0.35 * fundScore + 0.25 * glideScore + 0.20 * toneScore + 0.20 * decayScore);

  // 8. Confidence
  const fundInRange = fundamental >= 60 && fundamental <= 200;
  const confidence  = clamp(
    0.50 * (fundInRange ? fundScore : 0) +
    0.25 * glideScore +
    0.25 * (attackMs < 40 ? 1 : 0),
  );

  const isLogDrum = fundInRange && pitchGlideSemitones >= 0.5 && woodResonance >= 0.35 && confidence >= 0.55;

  let grade: LogDrumFingerprint["grade"];
  if (confidence >= 0.85)      grade = "elite";
  else if (confidence >= 0.65) grade = "strong";
  else                         grade = "developing";

  return {
    fundamentalHz: fundamental,
    pitchGlideSemitones,
    harmonicRatio,
    noiseRatio,
    woodResonance,
    attackMs,
    decayDbPerSec,
    confidence,
    isLogDrum,
    grade,
  };
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}
