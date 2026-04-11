import { CTLv1 } from "@aura-x/ctl";

export type ObservedFeatures = {
  bpm: number;
  bpm_confidence: number;
  key: string;
  mode: string;
  key_confidence: number;
  energy_mean: number;
  energy_peak: number;
  onset_density: number;
  duration_sec: number;
  low_mid_ratio?: number;
  spectral_centroid_hz?: number;
};

export type SignalEvaluationResult = {
  bpm_accuracy:          number;
  key_accuracy:          number;
  energy_accuracy:       number;
  groove_density_score:  number;
  cultural_signal_score: number;
  signal_composite_score: number;
  bpm_gap:    number;
  key_match:  boolean;
  energy_gap: number;
  passed_signal_gate: boolean;
  signal_notes: string[];
};

// ─── SUBGENRE ONSET TARGETS ───────────────────────────────────────────────────
// (onsets/sec range per subgenre)

export const SUBGENRE_ONSET_TARGETS: Record<string, [number, number]> = {
  private_school:      [4.0, 6.0],
  bacardi:             [3.5, 5.5],
  sgija:               [5.5, 7.5],
  stixx_sgija:         [6.0, 8.5],
  mbiraiano:           [4.0, 6.5],
  three_step:          [5.0, 7.0],
  gqom_fusion:         [3.0, 5.0],
  hybrid_rnb_amapiano: [4.0, 6.0],
};

// ─── SUBGENRE LOW-MID RATIO TARGETS ──────────────────────────────────────────
// (log drum band 60-300 Hz as fraction of total energy)

export const SUBGENRE_LOW_MID_TARGETS: Record<string, [number, number]> = {
  private_school:      [0.12, 0.25],
  bacardi:             [0.22, 0.40],
  sgija:               [0.18, 0.32],
  stixx_sgija:         [0.25, 0.42],
  mbiraiano:           [0.12, 0.22],
  three_step:          [0.16, 0.30],
  gqom_fusion:         [0.20, 0.38],
  hybrid_rnb_amapiano: [0.12, 0.24],
};

// ─── BPM ACCURACY ────────────────────────────────────────────────────────────
// ±2 BPM = perfect, ±5 = good, >8 = poor

export function scoreBpmAccuracy(intended: number, observed: number): number {
  const gap = Math.abs(intended - observed);
  if (gap <= 2)  return 1.0;
  if (gap <= 5)  return 0.85;
  if (gap <= 8)  return 0.65;
  if (gap <= 12) return 0.40;
  return 0.10;
}

// ─── KEY ACCURACY ─────────────────────────────────────────────────────────────
// Exact = 1.0, same tonic = 0.7, pentatonic neighbor = 0.5, else = 0.1

export function scoreKeyAccuracy(intended: string, observed: string): number {
  if (intended === observed) return 1.0;

  const intendedTonic = intended.replace("m", "");
  const observedTonic = observed.replace("m", "");

  if (intendedTonic === observedTonic) return 0.7;

  const NEIGHBORS: Record<string, string[]> = {
    "F#": ["A", "B", "C#", "E"],
    "G":  ["Bb", "C", "D", "F"],
    "D":  ["F#", "G", "A", "C"],
    "A":  ["C#", "D", "E", "G"],
    "E":  ["G#", "A", "B", "D"],
    "C":  ["E", "F", "G", "Bb"],
    "F":  ["A", "Bb", "C", "Eb"],
    "Bb": ["D", "Eb", "F", "Ab"],
  };
  if (NEIGHBORS[intendedTonic]?.includes(observedTonic)) return 0.5;

  return 0.1;
}

// ─── ENERGY ACCURACY ─────────────────────────────────────────────────────────

export function scoreEnergyAccuracy(
  intendedTarget: number,
  observedMean: number
): number {
  const gap = Math.abs(intendedTarget - observedMean);
  if (gap <= 0.05) return 1.0;
  if (gap <= 0.10) return 0.85;
  if (gap <= 0.20) return 0.65;
  if (gap <= 0.35) return 0.40;
  return 0.15;
}

// ─── GROOVE DENSITY SCORE ────────────────────────────────────────────────────

export function scoreGrooveDensity(
  subgenre: string,
  observedOnsetDensity: number
): number {
  const range = SUBGENRE_ONSET_TARGETS[subgenre];
  if (!range) return 0.5;

  const [low, high] = range;
  if (observedOnsetDensity >= low && observedOnsetDensity <= high) return 1.0;

  const midpoint = (low + high) / 2;
  const rangeWidth = high - low;
  const gap = Math.abs(observedOnsetDensity - midpoint);
  return parseFloat(Math.max(0, 1 - gap / rangeWidth).toFixed(3));
}

// ─── CULTURAL SIGNAL SCORE ───────────────────────────────────────────────────

export function scoreCulturalSignal(
  subgenre: string,
  lowMidRatio: number
): number {
  const range = SUBGENRE_LOW_MID_TARGETS[subgenre];
  if (!range) return 0.5;

  const [low, high] = range;
  if (lowMidRatio >= low && lowMidRatio <= high) return 1.0;

  const midpoint = (low + high) / 2;
  const rangeWidth = high - low;
  const gap = Math.abs(lowMidRatio - midpoint);
  return parseFloat(Math.max(0, 1 - (gap / rangeWidth) * 1.5).toFixed(3));
}

// ─── MASTER EVALUATOR ────────────────────────────────────────────────────────

export function evaluateSignal(
  ctl: CTLv1,
  observed: ObservedFeatures,
): SignalEvaluationResult {
  const subgenre = ctl.global.subgenre;
  const notes: string[] = [];

  const bpmAccuracy     = scoreBpmAccuracy(ctl.global.bpm, observed.bpm);
  const keyAccuracy     = scoreKeyAccuracy(ctl.global.key, observed.key);
  const energyAccuracy  = scoreEnergyAccuracy(
    ctl.evaluation_targets.authenticity_target,
    observed.energy_mean,
  );
  const grooveDensity   = scoreGrooveDensity(subgenre, observed.onset_density);
  const culturalSignal  = observed.low_mid_ratio !== undefined
    ? scoreCulturalSignal(subgenre, observed.low_mid_ratio)
    : 0.5;

  // Weighted composite — cultural signal + groove most important
  const signalComposite = (
    bpmAccuracy    * 0.20 +
    keyAccuracy    * 0.20 +
    energyAccuracy * 0.15 +
    grooveDensity  * 0.25 +
    culturalSignal * 0.20
  );

  const bpmGap   = Math.abs(ctl.global.bpm - observed.bpm);
  const keyMatch = ctl.global.key === observed.key;

  if (bpmGap > 5)           notes.push(`BPM gap: intended ${ctl.global.bpm}, observed ${observed.bpm}`);
  if (!keyMatch)             notes.push(`Key mismatch: intended ${ctl.global.key}, observed ${observed.key}`);
  if (grooveDensity < 0.6)  notes.push(`Groove density out of range for ${subgenre}`);
  if (culturalSignal < 0.5) notes.push(`Low-mid energy too low — log drum may be absent`);

  return {
    bpm_accuracy:           parseFloat(bpmAccuracy.toFixed(3)),
    key_accuracy:           parseFloat(keyAccuracy.toFixed(3)),
    energy_accuracy:        parseFloat(energyAccuracy.toFixed(3)),
    groove_density_score:   parseFloat(grooveDensity.toFixed(3)),
    cultural_signal_score:  parseFloat(culturalSignal.toFixed(3)),
    signal_composite_score: parseFloat(signalComposite.toFixed(3)),
    bpm_gap:    parseFloat(bpmGap.toFixed(2)),
    key_match:  keyMatch,
    energy_gap: parseFloat(
      Math.abs(ctl.evaluation_targets.authenticity_target - observed.energy_mean).toFixed(3)
    ),
    passed_signal_gate: signalComposite >= 0.65,
    signal_notes: notes,
  };
}
