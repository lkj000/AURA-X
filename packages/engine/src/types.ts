// ─── Amapiano sub-genre lanes ─────────────────────────────────────────────────

export type Lane =
  | "private_school"
  | "sgija"
  | "bacardi"
  | "stixx_sgija"
  | "mbiraiano"
  | "three_step"
  | "gqom_fusion"
  | "hybrid_rnb_amapiano";

export const LANES: Lane[] = [
  "private_school", "sgija", "bacardi",
  "stixx_sgija", "mbiraiano", "three_step",
  "gqom_fusion", "hybrid_rnb_amapiano",
];

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
  scores:              Record<Lane, number>;  // raw score per lane
  overallAuthenticity: number;               // max of all lanes
  bestFitLane:         Lane;
  laneConfidence:      number;               // softmax prob of best lane
  laneScores:          LaneScore[];
  secondaryLane:       Lane;
  hybridFlag:          boolean;              // top-2 gap < 0.10
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
  // stixx_sgija
  aggressivePunch?:  number;
  logDrumDensity?:   number;
  rhythmicDrive?:    number;
  // mbiraiano
  melodicWarmth?:         number;
  harmonicDepth?:         number;
  culturalAuthenticity?:  number;
  // three_step
  stepCohesion?:     number;
  tripletFeel?:      number;
  groovePolyrhythm?: number;
  // gqom_fusion
  industrialHardness?: number;
  darkEnergy?:         number;
  urbanEdge?:          number;
  // hybrid_rnb_amapiano
  melodicSmoothness?:  number;
  crossoverBalance?:   number;
  hookAccessibility?:  number;
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

// ─── Virtual stem decomposition ──────────────────────────────────────────────

export type StemName = "sub_bass" | "log_drum" | "chord_pad" | "percussion" | "air";

export interface VirtualStem {
  name:          StemName;
  bandHz:        readonly [number, number];  // Hz range
  energy:        number;    // [0, 1] fraction of total FFT energy in this band
  tonality:      number;    // [0, 1] — 1 = pure tone, 0 = broadband noise
  transience:    number;    // [0, 1] — block-energy coefficient of variation
  presenceScore: number;    // [0, 1] — weighted presence in mix
  isActive:      boolean;   // presenceScore >= per-stem activity threshold
}

export interface StemDecomposition {
  stems:           VirtualStem[];
  stemMap:         Record<StemName, VirtualStem>;
  totalEnergy:     number;               // sum of all stem energy fractions
  dominantStem:    StemName;
  amapianoBalance: number;               // [0, 1] — stems within target range / 5
  balanceIssues:   string[];
}

// ─── Cultural encoding ────────────────────────────────────────────────────────

export type MixProfile =
  | "luxury_noir"
  | "raw_street"
  | "bounce_club"
  | "spiritual_organic"
  | "dark_tribal"
  | "crossover_rb";

export interface CulturalProfile {
  lane:              Lane;
  lineage:           readonly string[];       // production ancestry chain
  geoOrigin:         string;                  // geographic birthplace
  emotionalProfile:  readonly string[];       // dominant emotional tones
  productionMarkers: readonly string[];       // characteristic production techniques
  mixProfile:        MixProfile;
  bpmRange:          readonly [number, number];
  keyBias:           readonly string[];       // preferred tonal centres
  tempoFeel:         "slow" | "mid" | "fast";
}

export interface CtlConditioning {
  mixProfile:         MixProfile;
  bpmTarget:          number;
  keyBias:            string[];
  culturalDirectives: string[];
}

export interface CulturalAlignment {
  lane:            Lane;
  alignmentScore:  number;                  // [0, 1] weighted Gaussian fit
  markerScores:    Record<string, number>;  // per-dimension scores
  deviations:      string[];               // human-readable mismatches
  ctlConditioning: CtlConditioning;
}

// ─── O.211 Perception Model ───────────────────────────────────────────────────

export type PerceptualAnchorType = "log_drum" | "harmonic" | "groove";

export interface PerceptualAnchor {
  type:      PerceptualAnchorType;
  strength:  number;    // [0, 1] — perceptual dominance
  clarity:   number;    // [0, 1] — distinctness/cleanness
  isPresent: boolean;   // strength >= 0.40
}

export type DensityLabel = "sparse" | "balanced" | "dense" | "overcrowded";

export interface PerceptionReport {
  bEff:            number;                              // effective perceptual bandwidth [0, 1]
  density:         number;                              // perceptual density [0, 1]
  densityLabel:    DensityLabel;
  anchors:         PerceptualAnchor[];                  // [log_drum, harmonic, groove]
  anchorStrengths: Record<PerceptualAnchorType, number>;
  dominantAnchor:  PerceptualAnchorType;
  passesGate:      boolean;                             // all O.211 constraints satisfied
  violations:      string[];
}

// ─── Comparative evaluation ───────────────────────────────────────────────────

export interface DimensionDelta {
  dimension:  string;
  source:     number;   // score in [0, 1]
  generated:  number;   // score in [0, 1]
  delta:      number;   // generated - source ∈ [-1, 1]
  weight:     number;   // contribution to overallDelta
  improved:   boolean;  // delta > IMPROVEMENT_THRESHOLD
  regressed:  boolean;  // delta < -REGRESSION_THRESHOLD
}

export interface ComparisonReport {
  sourceLane:    Lane;
  generatedLane: Lane;
  deltas:        DimensionDelta[];
  overallDelta:  number;    // weighted average ∈ [-1, 1]
  improved:      boolean;   // overallDelta > 0
  regressions:   string[];  // human-readable regression messages
  improvements:  string[];  // human-readable improvement messages
}

// ─── Pattern fingerprinting ───────────────────────────────────────────────────

export interface PatternFingerprint {
  lane:    Lane;
  hash:    string;          // 32-char hex (two chained FNV-1a hashes)
  vectors: {
    kick:   readonly number[];  // 16-step binary
    hat:    readonly number[];
    shaker: readonly number[];
    log:    readonly number[];
  };
  density: number;          // total hits / 64 (all voices combined), ∈ [0, 1]
}

export interface PatternSimilarity {
  fingerprintA: string;     // hash of plan A
  fingerprintB: string;     // hash of plan B
  kickSim:      number;     // [0, 1] — 1 = identical kick patterns
  hatSim:       number;
  shakerSim:    number;
  logSim:       number;
  overallSim:   number;     // weighted: log 0.35, kick 0.30, hat 0.20, shaker 0.15
  isMatch:      boolean;    // overallSim >= 0.75
}

// ─── Sample recommendation ────────────────────────────────────────────────────

export type SampleRole = "log_drum" | "chord_stab" | "bassline" | "top_loop" | "atmosphere" | "fx";

export interface SampleRecommendation {
  role:        SampleRole;
  description: string;          // human-readable instrument/texture description
  tags:        string[];         // searchable keywords
  confidence:  number;           // [0, 1] — fit score for this lane
  bpmRange:    [number, number]; // usable BPM window
  keyHints:    string[];         // suggested keys/modes
}

export interface SamplePack {
  lane:            Lane;
  recommendations: SampleRecommendation[];  // exactly 6, one per SampleRole
  culturalTags:    string[];                // lineage + geo tags
  totalCount:      number;
}

// ─── Mix spec ─────────────────────────────────────────────────────────────────

export interface StemMixParams {
  stem:          StemName;
  gainDb:        number;    // ∈ [-12, +6]
  panLR:         number;    // ∈ [-1, 1] — negative = left
  eqLowShelfDb:  number;    // boost/cut at 200 Hz
  eqHighShelfDb: number;    // boost/cut at 8 kHz
  compRatio:     number;    // ∈ [1, 8]
  reverbWet:     number;    // ∈ [0, 1]
}

export interface MasterChain {
  limitThresholdDb: number;   // ∈ [-6, -0.3] — brickwall ceiling
  eqLowCutHz:       number;   // rumble removal below this freq
  stereoWidth:      number;   // ∈ [0.8, 1.4] — M/S width multiplier
  lufsTarget:       number;   // integrated loudness target ∈ [-14, -9]
}

export interface MixSpec {
  lane:   Lane;
  stems:  StemMixParams[];
  master: MasterChain;
  notes:  string[];           // human-readable mix guidance
}

// ─── Arrangement arc ──────────────────────────────────────────────────────────

export type SectionName =
  "intro" | "build1" | "drop1" | "breakdown" | "build2" | "drop2" | "outro" | "outro_fade";

export interface ArrangementSection {
  name:       SectionName;
  startBar:   number;
  endBar:     number;             // exclusive
  bars:       number;
  grooveType: GrooveVariationType;
  intensity:  number;             // [0, 1] — automation/mix guidance
  filterHz:   number;             // suggested LP filter cutoff in Hz
}

export interface ArrangementArc {
  lane:          Lane;
  bpm:           number;
  totalBars:     number;
  sections:      ArrangementSection[];
  dropBar:       number;          // first bar of drop1
  peakIntensity: number;          // max intensity across all sections
}

// ─── Groove variations ────────────────────────────────────────────────────────

export type GrooveVariationType = "main" | "variation" | "fill" | "breakdown" | "build";

export interface GrooveVariationSet {
  lane:       Lane;
  bpm:        number;
  swing:      number;
  main:       GroovePlan;   // canonical grammar — A-section
  variation:  GroovePlan;   // syncopated B-section
  fill:       GroovePlan;   // dense 1-bar transition fill
  breakdown:  GroovePlan;   // stripped — kick + shaker, no log drum
  build:      GroovePlan;   // sparse first 8, full second 8 (pre-drop)
}

// ─── Gate report ─────────────────────────────────────────────────────────────

export interface GateReport {
  authenticityGate: {
    passes:    boolean;
    score:     number;
    threshold: number;
  };
  perceptionGate: {
    passes:     boolean;
    violations: string[];
    bEff:       number;
    density:    number;
  };
  culturalGate: {
    passes:         boolean;
    alignmentScore: number;
    deviations:     string[];
  };
  allPass: boolean;
}

// ─── Full evaluation ──────────────────────────────────────────────────────────

export interface AmapianEvaluation {
  features:          AudioFeatures;
  laneScores:        LaneScores;
  quality:           QualityScore;
  groove:            GroovePattern | null;
  logDrum:           LogDrumFingerprint | null;
  harmonic:          HarmonicProfile | null;
  perception:        PerceptionReport;
  stems:             StemDecomposition;
  cultural:          CulturalAlignment;
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
  stixx_sgija: {
    kick: [0, 3, 8, 11, 14],
    hat:  [2, 6, 10, 14],
    shaker: [1, 5, 9, 13],
    log:  [3, 6, 10, 13, 15],
    swing: 0.53,
    microtiming: "staccato_lock",
  },
  mbiraiano: {
    kick: [0, 8, 12],
    hat:  [4, 12],
    shaker: [2, 6, 10, 14],
    log:  [5, 11, 15],
    swing: 0.51,
    microtiming: "mbira_float",
  },
  three_step: {
    kick: [0, 5, 10],
    hat:  [0, 5, 10, 15],
    shaker: [2, 7, 12],
    log:  [4, 9, 14],
    swing: 0.53,
    microtiming: "triplet_lilt",
  },
  gqom_fusion: {
    kick: [0, 4, 8, 10, 12],
    hat:  [2, 6, 10, 14],
    shaker: [3, 7, 11, 15],
    log:  [2, 5, 10, 13, 15],
    swing: 0.50,
    microtiming: "machine_tight",
  },
  hybrid_rnb_amapiano: {
    kick: [0, 6, 10, 14],
    hat:  [4, 8, 12],
    shaker: [2, 6, 10, 14],
    log:  [7, 11, 15],
    swing: 0.51,
    microtiming: "smooth_flow",
  },
};

// ─── Authenticity threshold ───────────────────────────────────────────────────

export const AMAPIANO_THRESHOLD = 0.60;

// ─── Elite quality thresholds per lane ───────────────────────────────────────

export const ELITE_THRESHOLDS: Record<Lane, number> = {
  private_school:      0.85,
  sgija:               0.80,
  bacardi:             0.78,
  stixx_sgija:         0.80,
  mbiraiano:           0.85,
  three_step:          0.80,
  gqom_fusion:         0.78,
  hybrid_rnb_amapiano: 0.82,
};

// ─── Lane acoustic targets (ported from authenticity_scoring.py) ──────────────

export const LANE_TARGETS: Record<Lane, {
  bpm: number; energy: number; centroid: number; swing: number; syncopation: number;
  bpmSigma: number; energySigma: number; centroidSigma: number; syncopSigma: number;
}> = {
  private_school: { bpm: 112, energy: 0.45, centroid: 1375, swing: 0.50, syncopation: 0.25, bpmSigma: 3, energySigma: 0.10, centroidSigma: 200, syncopSigma: 0.12 },
  sgija:          { bpm: 114, energy: 0.80, centroid: 1525, swing: 0.50, syncopation: 0.50, bpmSigma: 3, energySigma: 0.10, centroidSigma: 200, syncopSigma: 0.12 },
  bacardi:        { bpm: 118, energy: 0.90, centroid: 1700, swing: 0.50, syncopation: 0.65, bpmSigma: 3, energySigma: 0.10, centroidSigma: 250, syncopSigma: 0.12 },
  stixx_sgija:         { bpm: 115, energy: 0.82, centroid: 1600, swing: 0.53, syncopation: 0.55, bpmSigma: 3, energySigma: 0.10, centroidSigma: 200, syncopSigma: 0.12 },
  mbiraiano:           { bpm: 110, energy: 0.38, centroid: 1150, swing: 0.51, syncopation: 0.30, bpmSigma: 4, energySigma: 0.10, centroidSigma: 200, syncopSigma: 0.12 },
  three_step:          { bpm: 113, energy: 0.60, centroid: 1400, swing: 0.53, syncopation: 0.42, bpmSigma: 3, energySigma: 0.10, centroidSigma: 200, syncopSigma: 0.12 },
  gqom_fusion:         { bpm: 120, energy: 0.88, centroid: 1800, swing: 0.50, syncopation: 0.62, bpmSigma: 4, energySigma: 0.08, centroidSigma: 250, syncopSigma: 0.12 },
  hybrid_rnb_amapiano: { bpm: 112, energy: 0.62, centroid: 1600, swing: 0.51, syncopation: 0.28, bpmSigma: 3, energySigma: 0.12, centroidSigma: 250, syncopSigma: 0.12 },
};

// ─── Lane dimension weights (tuned against corpus) ────────────────────────────

export const LANE_WEIGHTS: Record<Lane, {
  bpm: number; energy: number; centroid: number; syncopation: number;
}> = {
  private_school: { bpm: 0.30, energy: 0.25, centroid: 0.20, syncopation: 0.25 },
  sgija:          { bpm: 0.25, energy: 0.30, centroid: 0.20, syncopation: 0.25 },
  bacardi:        { bpm: 0.25, energy: 0.30, centroid: 0.20, syncopation: 0.25 },
  stixx_sgija:         { bpm: 0.25, energy: 0.30, centroid: 0.20, syncopation: 0.25 },
  mbiraiano:           { bpm: 0.30, energy: 0.20, centroid: 0.25, syncopation: 0.25 },
  three_step:          { bpm: 0.25, energy: 0.25, centroid: 0.20, syncopation: 0.30 },
  gqom_fusion:         { bpm: 0.25, energy: 0.30, centroid: 0.20, syncopation: 0.25 },
  hybrid_rnb_amapiano: { bpm: 0.25, energy: 0.25, centroid: 0.25, syncopation: 0.25 },
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
