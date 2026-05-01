// 16-step groove pattern reconstruction.
// Mirrors aura-x-engine/intelligence/groove_pattern.py

import { clamp, hammingDistance } from "../_utils";
import { onsetEnvelope } from "../_dsp";
import { LANE_GRAMMARS, type Lane, type GroovePattern } from "../types";

const LANES: Lane[] = ["private_school", "sgija", "bacardi", "commercial"];

function binaryPattern16(onsets: number[], framesPerStep: number): number[] {
  const pattern = new Array(16).fill(0);
  for (const onset of onsets) {
    const step = Math.round(onset / framesPerStep) % 16;
    if (step >= 0 && step < 16) pattern[step] = 1;
  }
  return pattern;
}

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

function computePocketScore(pattern: number[], lane: Lane, swingRatio: number): number {
  const grammar = LANE_GRAMMARS[lane];

  // Groove feel combines:
  // 40% groove adherence (Hamming similarity to grammar's combined pattern)
  // 30% swing consistency (closeness to grammar swing)
  // 30% density appropriateness

  const grammarAll = new Array(16).fill(0);
  for (const i of [...grammar.kick, ...grammar.hat, ...grammar.log, ...grammar.shaker]) {
    if (i < 16) grammarAll[i] = 1;
  }

  const hamming     = hammingDistance(pattern, grammarAll);
  const adherence   = 1 - hamming / 16;
  const swingDiff   = Math.abs(swingRatio - grammar.swing);
  const swingMatch  = 1 - clamp(swingDiff / 0.08);
  const density     = pattern.filter(Boolean).length / 16;

  // Each lane has a preferred density range
  const densityTargets: Record<Lane, number> = {
    private_school: 0.25,
    sgija:          0.50,
    bacardi:        0.65,
    commercial:     0.40,
  };
  const densityScore = 1 - Math.abs(density - densityTargets[lane]);

  return clamp(0.40 * adherence + 0.30 * swingMatch + 0.30 * densityScore);
}

export function extractGroovePattern(
  samples: number[],
  sampleRate: number,
  bpm: number,
  swingRatio: number,
): GroovePattern | null {
  if (samples.length < sampleRate * 0.5) return null;

  const FRAME_SIZE  = 256;
  const fps         = sampleRate / FRAME_SIZE;
  const framesPerStep = fps * 60 / (bpm * 4);

  const envelope  = onsetEnvelope(samples, FRAME_SIZE);
  const maxE      = Math.max(0, ...envelope);
  if (maxE === 0) return null;

  const threshold = maxE * 0.38;
  const onsets    = detectOnsets(envelope, threshold);
  const pattern   = binaryPattern16(onsets, framesPerStep);

  // Separate by frequency band for instrument categorisation
  // (simplified: use pattern for all instruments — full stem separation needed for true separation)
  const kickHits    = pattern.map((v, i) => (v && [0, 4, 8, 12].includes(i)) ? 1 : 0);
  const hatHits     = pattern.map((v, i) => (v && [2, 6, 10, 14].includes(i % 16)) ? 1 : 0);
  const logDrumHits = pattern.map((v, i) => (v && i >= 6 && i <= 15) ? 1 : 0);
  const shakerHits  = pattern.map((v, i) => (v && i % 2 === 1) ? 1 : 0);

  const density = pattern.filter(Boolean).length / 16;

  // Micro-timing: simplified (assign slight pull to hats)
  const microTiming: Record<number, number> = {};
  for (let i = 0; i < 16; i++) {
    if (hatHits[i]) microTiming[i] = -8; // 8ms early (laidback feel)
  }

  // Find nearest lane grammar
  let bestLane: Lane = "private_school", bestDist = Infinity;
  for (const lane of LANES) {
    const g = LANE_GRAMMARS[lane];
    const grammarPattern = new Array(16).fill(0);
    for (const i of [...g.kick, ...g.hat, ...g.log, ...g.shaker]) {
      if (i < 16) grammarPattern[i] = 1;
    }
    const dist = hammingDistance(pattern, grammarPattern);
    if (dist < bestDist) { bestDist = dist; bestLane = lane; }
  }

  const pocketScore = computePocketScore(pattern, bestLane, swingRatio);

  return {
    bpm,
    steps: 16,
    kickHits:    kickHits as readonly number[],
    hatHits:     hatHits as readonly number[],
    logDrumHits: logDrumHits as readonly number[],
    shakerHits:  shakerHits as readonly number[],
    swingRatio,
    syncopationIndex: onsets.filter((o) => {
      const step = Math.round(o / framesPerStep) % 4;
      return step === 1 || step === 3;
    }).length / Math.max(1, onsets.length),
    density,
    microTiming,
    laneMatch:    bestLane,
    laneDistance: bestDist,
    pocketScore,
  };
}
