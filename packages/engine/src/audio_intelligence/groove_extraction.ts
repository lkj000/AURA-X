// Groove extraction — swing ratio and syncopation index from onset envelope.
// Mirrors aura-x-engine/audio_intelligence/groove_extraction.py

import { clamp } from "../_utils";
import { onsetEnvelope } from "../_dsp";
import type { GrooveProfile } from "../types";

const FRAME_SIZE = 512;

function detectOnsets(envelope: number[], threshold: number): number[] {
  const onsets: number[] = [];
  for (let i = 1; i < envelope.length - 1; i++) {
    if (
      envelope[i] > threshold &&
      envelope[i] > envelope[i - 1] &&
      envelope[i] >= envelope[i + 1]
    ) {
      onsets.push(i);
    }
  }
  return onsets;
}

// Estimate swing ratio from inter-onset intervals.
// Returns [0.45, 0.58]; 0.50 = straight 8th notes.
function swingRatio(onsets: number[]): number {
  if (onsets.length < 4) return 0.50;

  const gaps: number[] = [];
  for (let i = 1; i < onsets.length; i++) gaps.push(onsets[i] - onsets[i - 1]);

  const evenGaps = gaps.filter((_, i) => i % 2 === 0);
  const oddGaps  = gaps.filter((_, i) => i % 2 !== 0);
  if (!evenGaps.length || !oddGaps.length) return 0.50;

  const meanEven = evenGaps.reduce((a, b) => a + b, 0) / evenGaps.length;
  const meanOdd  = oddGaps.reduce((a, b) => a + b, 0)  / oddGaps.length;
  const total    = meanEven + meanOdd;
  if (total === 0) return 0.50;

  return clamp(meanEven / total, 0.45, 0.58);
}

// Fraction of onsets landing on weak 16th-note grid positions (off-beats).
function syncopationIndex(onsets: number[], framesPerStep: number): number {
  if (onsets.length === 0) return 0.25;

  let weakCount = 0;
  for (const onset of onsets) {
    const step = Math.round(onset / framesPerStep) % 4;
    if (step === 1 || step === 3) weakCount++;
  }
  return clamp(weakCount / onsets.length, 0, 1);
}

export function extractGroove(
  samples: number[],
  sampleRate: number,
  bpm: number,
): GrooveProfile {
  const fps = sampleRate / FRAME_SIZE;
  const envelope = onsetEnvelope(samples, FRAME_SIZE);

  const maxE = Math.max(...envelope);
  const threshold = maxE * 0.35;
  const onsets = detectOnsets(envelope, threshold);

  const framesPerStep = fps * 60 / (bpm * 4);

  return {
    swingRatio:       swingRatio(onsets),
    syncopationIndex: syncopationIndex(onsets, framesPerStep),
  };
}
