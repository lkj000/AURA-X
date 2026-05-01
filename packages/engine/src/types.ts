// ─── Amapiano sub-genre lanes ─────────────────────────────────────────────────

export type Lane = "private_school" | "sgija" | "bacardi" | "commercial";

export const LANES: Lane[] = ["private_school", "sgija", "bacardi", "commercial"];

// ─── DSP primitives ───────────────────────────────────────────────────────────

export interface BandEnergies {
  subBass: number;   // < 150 Hz fraction of total
  lowMid:  number;   // 150–800 Hz fraction
  high:    number;   // > 800 Hz fraction
}

// ─── Log drum ─────────────────────────────────────────────────────────────────

export interface LogDrumFingerprint {
  fundamentalHz:      number;   // dominant pitch 60–200 Hz
  pitchGlideSemitones: number;  // "wobble" — 0–6 st range, authentic ≥ 0.5
  harmonicRatio:      number;   // harmonic / total energy [0, 1]
  noiseRatio:         number;   // 1 - harmonicRatio
  woodResonance:      number;   // composite timbral score [0, 1]
  attackMs:           number;   // onset to peak amplitude
  decayDbPerSec:      number;   // dB decay rate from peak to tail
  confidence:         number;   // [0, 1] — is_log_drum threshold ≥ 0.55
  isLogDrum:          boolean;  // fund ∈ [60,200] ∧ glide ≥ 0.5 ∧ wood ≥ 0.35 ∧ conf ≥ 0.55
  grade:              "elite" | "strong" | "developing";
}

// ─── Harmonic profile ─────────────────────────────────────────────────────────

export interface AmapianChord {
  root:     string;         // "A", "D", "F", "G"
  quality:  string;         // "min7", "maj9", "dom7", "min11", "maj7"
  bassNote: string;
  voicing:  readonly number[];  // MIDI note numbers for DAW export
}

export interface HarmonicProfile {
  key:                  string;         // e.g. "Am", "Dm"
  mode:                 "minor" | "major" | "dorian";
  chromaVector:         readonly number[];  // 12-bin pitch class energy
  chordProgression:     AmapianChord[];
  harmonicRichness:     number;         // active pitch classes / 12
  bassIntervals:        readonly number[];  // semitone intervals in bass line
  amapianoCompatibility: number;        // [0, 1]
}

// ─── Groove ───────────────────────────────────────────────────────────────────

export interface GrooveProfile {
  swingRatio:       number;   // [0.45, 0.58], 0.50 = straight
  syncopationIndex: number;   // [0, 1], fraction of onsets on weak positions
}

export interface GroovePattern {
  bpm:              number;
  steps:            16;
  kickHits:         readonly number[];
  hatHits:          readonly number[];
  logDrumHits:      readonly number[];
  shakerHits:       readonly number[];
  swingRatio:       number;
  syncopationIndex: number;
  density:          number;         // total_hits / steps [0, 1]
  microTiming:      Record<number, number>;  // step → ms offset from grid
  laneMatch:        Lane;
  laneDistance:     number;         // Hamming distance to nearest grammar
  pocketScore:      number;         // groove feel quality [0, 1]
}

// ─── Audio features ───────────────────────────────────────────────────────────

export interface AudioFeatures {
  bpm:              number;
  energyRms:        number;           // RMS normalised [0, 1]
  spectralCentroid: number;           // FFT-based Hz
  subBassEnergy:    number;           // <150 Hz fraction
  lowMidEnergy:     number;           // 150–800 Hz fraction
  highEnergy:       number;           // >800 Hz fraction
  groove:           GrooveProfile;
  logDrum:          LogDrumFingerprint | null;
  harmonic:         HarmonicProfile | null;
  durationSec:      number;
  sampleRate:       number;
}

// ─── Lane scoring ─────────────────────────────────────────────────────────────

export interface LaneScore {
  lane:             Lane;
  score:            number;       // [0, 1] raw weighted score
  probability:      number;       // softmax normalised
}

export interface LaneScores {
  privateSchoolScore: number;
  sgijaScore:         number;
  bacardiScore:       number;
  commercialScore:    number;
  overallAuthenticity: number;    // max of four
  bestFitLane:        Lane;
  laneConfidence:     number;     // softmax prob of best lane
  laneScores:         LaneScore[];
  secondaryLane:      Lane;
  hybridFlag:         boolean;    // top-2 gap < 0.10
}

// ─── Quality ──────────────────────────────────────────────────────────────────

export type QualityTier = "elite" | "strong" | "developing";

export interface LaneQualityMetrics {
  // private_school
  spaceUsage?:       number;
  harmonicRichness?: number;
  grooveStability?:  number;
  // sgija
  grooveTightness?:        number;
  logDrumComplexity?:      number;
  syncopationPrecision?:   number;
  // bacardi
  transientStrength?: number;
  percussiveDensity?: number;
  energyDrive?:       number;
  // commercial
  spectralClarity?:    number;
  structureCoherence?: number;
  mixBalance?:         number;
}

export interface QualityScore {
  producerScore:    number;
  tier:             QualityTier;
  isElite:          boolean;
  laneMetrics:      LaneQualityMetrics;
}

// ─── Groove plan (planning artifact) ──────────────────────────────────────────

export interface GroovePlan {
  grooveType:         string;
  lane:               Lane;
  steps:              16;
  kickPattern:        readonly number[];   // 0/1 × 16
  hatPattern:         readonly number[];
  shakerPattern:      readonly number[];
  logDrumPattern:     readonly number[];
  swing:              number;
  densityProfile:     "sparse" | "medium" | "dense";
  microtimingProfile: string;
  styleBiasApplied:   boolean;
}

// ─── Source profile (pipeline artifact) ──────────────────────────────────────

export interface SourceProfile {
  audioPath:      string;
  features:       AudioFeatures;
  laneScores:     LaneScores;
  quality:        QualityScore;
}

// ─── Transformation plan ──────────────────────────────────────────────────────

export type BlendStrategy =
  | "single_lane"
  | "transform_to_target_preserve_identity"
  | "preserve_primary_blend_secondary"
  | "multi_lane_blend";

export type ArrangementStrategy =
  | "minimal_intervention"
  | "targeted_enhancement"
  | "structural_rebuild";

export interface TransformationPlan {
  targetLane:            Lane;
  blendStrategy:         BlendStrategy;
  grooveStrategy:        string;        // e.g. "private_school→private_school"
  logDrumStrategy:       string;
  sampleSelectionStrategy: string;
  arrangementStrategy:   ArrangementStrategy;
}

// ─── Sample plan ─────────────────────────────────────────────────────────────

export interface SampleEntry {
  lane:     Lane | null;
  tier:     QualityTier | null;
  density:  "sparse" | "medium" | "dense" | null;
  role:     string | null;
  path:     string | null;
}

export interface SamplePlan {
  targetLane:    Lane;
  sampleTier:    QualityTier;
  kick:          SampleEntry;
  hat:           SampleEntry;
  shaker:        SampleEntry;
  logDrum:       SampleEntry;
}

// ─── Render evaluation ────────────────────────────────────────────────────────

export interface RenderEvaluation {
  laneFeel:           number;   // weight 0.22
  grooveAdherence:    number;   // weight 0.20
  logDrumFit:         number;   // weight 0.18
  sampleFit:          number;   // weight 0.15
  sectionCoherence:   number;   // weight 0.13
  producerAlignment:  number;   // weight 0.12
  styleSimilarity:    number;   // weight 0.00 (default 0.50, 0 if no model)
  overallRenderScore: number;
  passesGate:         boolean;  // >= 0.65
}

// ─── Action policy ────────────────────────────────────────────────────────────

export interface ActionUtility {
  emaUtility:   number;
  varianceEma:  number;
  support:      number;
}

export interface ActionPolicy {
  metadata: {
    version:         number;
    alpha:           number;
    policyInfluence: number;
    tieBreakWindow:  number;
  };
  lanes: Partial<Record<Lane, Record<string, ActionUtility>>>;
}

// ─── Convergence ──────────────────────────────────────────────────────────────

export interface ConvergenceState {
  scores:           number[];
  stopped:          boolean;
  stopReason:       "quality_threshold" | "regression" | "no_improvement" | "iteration_limit" | null;
  bestScore:        number;
  iterationsRun:    number;
}

// ─── MIDI ─────────────────────────────────────────────────────────────────────

export interface MidiNote {
  tick:     number;
  note:     number;    // GM note number
  channel:  number;
  velocity: number;
  duration: number;    // in ticks
}

// ─── Full evaluation ──────────────────────────────────────────────────────────

export interface AmapianEvaluation {
  features:          AudioFeatures;
  laneScores:        LaneScores;
  quality:           QualityScore;
  groove:            GroovePattern | null;
  logDrum:           LogDrumFingerprint | null;
  harmonic:          HarmonicProfile | null;
  passesThreshold:   boolean;
  threshold:         number;
  issues:            string[];
}

export interface Enhancement {
  recommendedCtl:    Record<string, unknown>;
  groovePlan:        GroovePlan;
  suggestions:       string[];
  canAutoEnhance:    boolean;
}

// ─── Lane grammar constants ───────────────────────────────────────────────────

export const LANE_GRAMMARS: Record<Lane, {
  kick: number[];
  hat: number[];
  shaker: number[];
  log: number[];
  swing: number;
  microtiming: string;
}> = {
  private_school: {
    kick: [0, 6, 10],
    hat:  [2, 6, 10, 14],
    shaker: [4, 12],
    log:  [7, 15],
    swing: 0.52,
    microtiming: "laidback_hat_pull",
  },
  sgija: {
    kick: [0, 4, 8, 11, 14],
    hat:  [2, 6, 10, 14],
    shaker: [1, 5, 9, 13],
    log:  [3, 7, 12, 15],
    swing: 0.53,
    microtiming: "late_hat_push",
  },
  bacardi: {
    kick: [0, 3, 6, 8, 11, 14],
    hat:  [2, 4, 6, 10, 12, 14],
    shaker: [1, 3, 5, 7, 9, 11, 13, 15],
    log:  [4, 7, 10, 13, 15],
    swing: 0.54,
    microtiming: "forward_shuffle",
  },
  commercial: {
    kick: [0, 4, 8, 12],
    hat:  [2, 6, 10, 14],
    shaker: [1, 5, 9, 13],
    log:  [7, 11, 15],
    swing: 0.50,
    microtiming: "grid_tight",
  },
};

// ─── Authenticity threshold ───────────────────────────────────────────────────

export const AMAPIANO_THRESHOLD = 0.60;

// ─── Elite quality thresholds per lane ───────────────────────────────────────

export const ELITE_THRESHOLDS: Record<Lane, number> = {
  private_school: 0.85,
  sgija:          0.80,
  bacardi:        0.78,
  commercial:     0.82,
};

// ─── Lane acoustic targets (ported from authenticity_scoring.py) ──────────────

export const LANE_TARGETS: Record<Lane, {
  bpm: number; energy: number; centroid: number; swing: number; syncopation: number;
  bpmSigma: number; energySigma: number; centroidSigma: number; syncopSigma: number;
}> = {
  private_school: { bpm: 112, energy: 0.45, centroid: 1375, swing: 0.50, syncopation: 0.25, bpmSigma: 3, energySigma: 0.10, centroidSigma: 200, syncopSigma: 0.12 },
  sgija:          { bpm: 114, energy: 0.80, centroid: 1525, swing: 0.50, syncopation: 0.50, bpmSigma: 3, energySigma: 0.10, centroidSigma: 200, syncopSigma: 0.12 },
  bacardi:        { bpm: 118, energy: 0.90, centroid: 1700, swing: 0.50, syncopation: 0.65, bpmSigma: 3, energySigma: 0.10, centroidSigma: 250, syncopSigma: 0.12 },
  commercial:     { bpm: 116, energy: 0.82, centroid: 1950, swing: 0.50, syncopation: 0.15, bpmSigma: 4, energySigma: 0.12, centroidSigma: 300, syncopSigma: 0.12 },
};

// ─── Lane dimension weights (tuned against corpus) ────────────────────────────

export const LANE_WEIGHTS: Record<Lane, {
  bpm: number; energy: number; centroid: number; syncopation: number;
}> = {
  private_school: { bpm: 0.30, energy: 0.25, centroid: 0.20, syncopation: 0.25 },
  sgija:          { bpm: 0.25, energy: 0.30, centroid: 0.20, syncopation: 0.25 },
  bacardi:        { bpm: 0.25, energy: 0.30, centroid: 0.20, syncopation: 0.25 },
  commercial:     { bpm: 0.25, energy: 0.25, centroid: 0.30, syncopation: 0.20 },
};

// ─── Refinement action names ──────────────────────────────────────────────────

export const REFINEMENT_ACTIONS = [
  "increase_pattern_density",
  "reduce_microtiming_variation",
  "align_groove_to_target_lane",
  "upgrade_sample_tier_quality",
  "increase_lane_consistency_in_samples",
  "increase_log_drum_prominence",
  "increase_log_drum_density",
  "simplify_arrangement_structure",
  "ensure_producer_tier_alignment",
  "nudge_swing_toward_lane_mean",
  "nudge_density_toward_lane_median",
  "realign_patterns_toward_elite_template",
  "prefer_lane_consistent_kit",
] as const;

export type RefinementAction = typeof REFINEMENT_ACTIONS[number];
