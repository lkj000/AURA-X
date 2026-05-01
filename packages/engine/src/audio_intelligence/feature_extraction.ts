// Full audio feature extraction pipeline.
// Mirrors aura-x-engine/audio_intelligence/feature_extraction.py

import { estimateBpm, computeRmsEnergy, spectralCentroidFft, bandEnergies } from "../_dsp";
import { extractGroove } from "./groove_extraction";
import { extractLogDrumFingerprint } from "../intelligence/log_drum";
import { analyzeHarmony } from "../intelligence/harmonic";
import type { AudioFeatures } from "../types";

export function extractAudioFeatures(
  samples: number[],
  sampleRate: number,
): AudioFeatures {
  const bpm              = estimateBpm(samples, sampleRate);
  const energyRms        = computeRmsEnergy(samples);
  const spectralCentroid = spectralCentroidFft(samples, sampleRate);
  const bands            = bandEnergies(samples, sampleRate);
  const groove           = extractGroove(samples, sampleRate, bpm);
  const logDrum          = extractLogDrumFingerprint(samples, sampleRate);
  const harmonic         = analyzeHarmony(samples, sampleRate);

  return {
    bpm,
    energyRms,
    spectralCentroid,
    subBassEnergy: bands.subBass,
    lowMidEnergy:  bands.lowMid,
    highEnergy:    bands.high,
    groove,
    logDrum,
    harmonic,
    durationSec:   samples.length / sampleRate,
    sampleRate,
  };
}
