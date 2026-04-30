export const AMAPIANO_BPM_MIN = 104;
export const AMAPIANO_BPM_MAX = 116;
export const CONTRAST_SCORE_THRESHOLD = 0.6;

const BPM_SNAP_FACTORS = [1, 0.5, 2, 0.25, 4] as const;

// Returns the snapped BPM if the input has an Amapiano path, null otherwise
export function snapToAmapianoBpm(bpm: number): number | null {
  for (const factor of BPM_SNAP_FACTORS) {
    const snapped = bpm * factor;
    if (snapped >= AMAPIANO_BPM_MIN && snapped <= AMAPIANO_BPM_MAX) {
      return snapped;
    }
  }
  return null;
}

// Gate 1 — pre-generation BPM check
export function validateMode2Bpm(bpm: number): { valid: boolean } {
  return { valid: snapToAmapianoBpm(bpm) !== null };
}

// Gate 2 — post-generation quality scoring from audio analysis signals
// Mirrors the composite formula in audioWorker; BPM proximity to 110 weighted 50%
export function contrastScoreFromAnalysis(analysis: {
  bpm: number;
  energy_mean: number;
  onset_density?: number;
}): number {
  const bpmScore    = Math.max(0, 1.0 - Math.abs(analysis.bpm - 110) / 30);
  const energyScore = Math.min(1.0, Math.max(0, analysis.energy_mean));
  const onsetScore  = Math.min(1.0, (analysis.onset_density ?? 0) / 4.0);
  return parseFloat((0.50 * bpmScore + 0.30 * energyScore + 0.20 * onsetScore).toFixed(3));
}

// Gate 3 — subgenre consistency: does detected BPM land in the Amapiano range?
export function subgenreMatchesAmapiano(detectedBpm: number): { match: boolean } {
  return { match: snapToAmapianoBpm(detectedBpm) !== null };
}
