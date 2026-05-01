// @aura-x/engine — Public API
// Superior TypeScript Amapiano intelligence engine.

// ── Core DSP ──────────────────────────────────────────────────────────────────
export { parseWavMono }                               from "./_audio_io";
export type { WavData }                               from "./_audio_io";
export {
  fftInPlace, fftPadded, applyHann,
  spectralCentroidFft, bandEnergies,
  estimateBpm, estimateFundamental,
  computeRmsEnergy, computeChroma,
  onsetEnvelope,
}                                                     from "./_dsp";
export { clamp, gaussScore, softmax, hashString, hammingDistance, mean } from "./_utils";

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  Lane,
  AudioFeatures, BandEnergies,
  LaneScore, LaneScores,
  QualityScore, QualityTier, LaneQualityMetrics,
  GrooveProfile, GroovePattern, GroovePlan,
  LogDrumFingerprint,
  HarmonicProfile, AmapianChord,
  SourceProfile, TransformationPlan,
  SamplePlan, SampleEntry,
  RenderEvaluation,
  ActionPolicy, ActionUtility, ConvergenceState,
  PerceptualAnchor, PerceptualAnchorType, PerceptionReport, DensityLabel,
  StemName, VirtualStem, StemDecomposition,
  CulturalProfile, CtlConditioning, CulturalAlignment, MixProfile,
  GateReport,
  GrooveVariationType, GrooveVariationSet,
  AmapianEvaluation, Enhancement,
  MidiNote, BlendStrategy, ArrangementStrategy, RefinementAction,
  DimensionDelta, ComparisonReport,
  PatternFingerprint, PatternSimilarity,
  SectionName, ArrangementSection, ArrangementArc,
  StemMixParams, MasterChain, MixSpec,
  SampleRole, SampleRecommendation, SamplePack,
  VoiceName, HumanizedHit, HumanizedPattern,
  GradeLabel, GateResult, QualityGateReport,
  GrooveInterpolation,
  ProductionReportSummary, ProductionReport,
}                                                     from "./types";

export {
  LANES, LANE_GRAMMARS, LANE_TARGETS, LANE_WEIGHTS,
  ELITE_THRESHOLDS, AMAPIANO_THRESHOLD, REFINEMENT_ACTIONS,
}                                                     from "./types";

// ── Audio intelligence ────────────────────────────────────────────────────────
export { extractAudioFeatures }                       from "./audio_intelligence/feature_extraction";
export { scoreAuthenticityLanes }                     from "./audio_intelligence/authenticity_scoring";
export { scoreLaneQuality }                           from "./audio_intelligence/lane_quality";
export { extractGroove }                              from "./audio_intelligence/groove_extraction";

// ── Intelligence modules ──────────────────────────────────────────────────────
export { extractLogDrumFingerprint }                  from "./intelligence/log_drum";
export { analyzeHarmony }                             from "./intelligence/harmonic";
export { extractGroovePattern }                       from "./intelligence/groove_pattern";

// ── High-end engine ───────────────────────────────────────────────────────────
export { transferGroove }                             from "./high_end_engine/groove_transfer";
export type { StyleTemplate }                         from "./high_end_engine/groove_transfer";
export { evaluateRender }                             from "./high_end_engine/render_evaluator";
export { ConvergenceTracker }                         from "./high_end_engine/convergence";
export { buildRefinementPlan }                        from "./high_end_engine/refinement";
export type { RefinementPlan }                        from "./high_end_engine/refinement";

// ── Perception model ──────────────────────────────────────────────────────────
export {
  applyPerceptionModel, computeBEff, computePerceptualDensity, barkScale,
}                                                     from "./perception/perception_model";
export { decomposeStems }                             from "./perception/stem_decomposer";

// ── Cultural encoding ─────────────────────────────────────────────────────────
export { computeCulturalAlignment }                   from "./cultural/cultural_encoder";
export { CULTURAL_PROFILES }                          from "./cultural/cultural_profiles";

// ── CTL synthesis ─────────────────────────────────────────────────────────────
export { synthesizeCtl }                              from "./ctl_synthesis/ctl_synthesizer";
export type { CTLv1 }                                 from "./ctl_synthesis/ctl_synthesizer";

// ── ML engine ─────────────────────────────────────────────────────────────────
export {
  emptyPolicy, updatePolicy, computeActionScore, laneLeaderboard,
}                                                     from "./ml_engine/adaptive_action_learning";

// ── DAW export ────────────────────────────────────────────────────────────────
export { exportGrooveToMidi, groovePlanToMidi }       from "./daw_export/midi_export";
export type { MidiExportResult }                      from "./daw_export/midi_export";

// ── High-level convenience API ────────────────────────────────────────────────
export { evaluateBuffer, buildEnhancement }           from "./pipeline/evaluation";

// ── Full analysis pipeline ────────────────────────────────────────────────────
export { analyzeAndPlan }                             from "./pipeline/analysis_pipeline";
export type { AnalysisPlan }                          from "./pipeline/analysis_pipeline";

// ── Groove variations ─────────────────────────────────────────────────────────
export { generateGrooveVariations }                   from "./groove/variation_engine";
export type { VariationOptions }                      from "./groove/variation_engine";

// ── Comparative evaluation ────────────────────────────────────────────────────
export { compareEvaluations, compareBuffers }         from "./evaluation/comparison";

// ── Pattern fingerprinting ────────────────────────────────────────────────────
export { fingerprintGroovePlan, comparePatterns }     from "./groove/pattern_fingerprint";

// ── Arrangement arc ───────────────────────────────────────────────────────────
export { planArrangementArc }                         from "./arrangement/arc_planner";
export type { ArcOptions }                            from "./arrangement/arc_planner";

// ── Mix spec ──────────────────────────────────────────────────────────────────
export { generateMixSpec }                            from "./mix/mix_spec";

// ── Sample recommendation ─────────────────────────────────────────────────────
export { recommendSamples }                           from "./intelligence/sample_recommender";
export type { RecommenderOptions }                    from "./intelligence/sample_recommender";

// ── Tempo humanizer ───────────────────────────────────────────────────────────
export { humanizePattern }                            from "./groove/tempo_humanizer";
export type { HumanizerOptions }                      from "./groove/tempo_humanizer";

// ── Groove interpolator ───────────────────────────────────────────────────────
export { interpolateGrooves }                         from "./groove/groove_interpolator";
export type { InterpolateOptions }                    from "./groove/groove_interpolator";

// ── Quality gate pipeline ─────────────────────────────────────────────────────
export { runQualityGates }                            from "./pipeline/quality_gate";

// ── Production report ─────────────────────────────────────────────────────────
export { generateProductionReport }                   from "./pipeline/production_report";
