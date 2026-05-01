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
  AmapianEvaluation, Enhancement,
  MidiNote, BlendStrategy, ArrangementStrategy, RefinementAction,
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

// ── ML engine ─────────────────────────────────────────────────────────────────
export {
  emptyPolicy, updatePolicy, computeActionScore, laneLeaderboard,
}                                                     from "./ml_engine/adaptive_action_learning";

// ── DAW export ────────────────────────────────────────────────────────────────
export { exportGrooveToMidi, groovePlanToMidi }       from "./daw_export/midi_export";
export type { MidiExportResult }                      from "./daw_export/midi_export";

// ── High-level convenience API ────────────────────────────────────────────────

import { parseWavMono }                from "./_audio_io";
import { extractAudioFeatures }        from "./audio_intelligence/feature_extraction";
import { scoreAuthenticityLanes }      from "./audio_intelligence/authenticity_scoring";
import { scoreLaneQuality }            from "./audio_intelligence/lane_quality";
import { extractGroovePattern }        from "./intelligence/groove_pattern";
import { AMAPIANO_THRESHOLD, LANE_GRAMMARS, LANE_TARGETS } from "./types";
import type { AmapianEvaluation, Enhancement, GroovePlan } from "./types";
import { applyPerceptionModel } from "./perception/perception_model";
import { decomposeStems }        from "./perception/stem_decomposer";
import { computeCulturalAlignment } from "./cultural/cultural_encoder";

export function evaluateBuffer(buffer: Buffer): AmapianEvaluation {
  const wav        = parseWavMono(buffer);
  const features   = extractAudioFeatures(wav.samples, wav.sampleRate);
  const laneScores = scoreAuthenticityLanes(features);
  const quality    = scoreLaneQuality(features, laneScores.bestFitLane);
  const groove     = extractGroovePattern(wav.samples, wav.sampleRate, features.bpm, features.groove.swingRatio);

  const perception = applyPerceptionModel(features);
  const stems      = decomposeStems(wav.samples, wav.sampleRate, features);
  const cultural   = computeCulturalAlignment(features, laneScores.bestFitLane);

  const issues: string[] = [];
  if (!features.logDrum?.isLogDrum)
    issues.push("Log drum not detected — add a prominent log drum (60–200 Hz, pitch glide ≥ 0.5 st)");
  if (features.bpm < 107 || features.bpm > 122)
    issues.push(`BPM ${features.bpm.toFixed(1)} outside Amapiano range (107–122)`);
  if (features.groove.swingRatio < 0.48)
    issues.push("Swing ratio too straight — target 0.50–0.54");
  if (laneScores.overallAuthenticity < AMAPIANO_THRESHOLD)
    issues.push(`Low lane authenticity (${laneScores.overallAuthenticity.toFixed(3)} < ${AMAPIANO_THRESHOLD})`);
  for (const v of perception.violations)
    issues.push(`[O.211] ${v}`);
  for (const b of stems.balanceIssues)
    issues.push(`[stem] ${b}`);

  return {
    features,
    laneScores,
    quality,
    groove,
    logDrum:         features.logDrum,
    harmonic:        features.harmonic,
    perception,
    stems,
    cultural,
    passesThreshold: laneScores.overallAuthenticity >= AMAPIANO_THRESHOLD,
    threshold:       AMAPIANO_THRESHOLD,
    issues,
  };
}

export function buildEnhancement(evaluation: AmapianEvaluation): Enhancement {
  const lane    = evaluation.laneScores.bestFitLane;
  const grammar = LANE_GRAMMARS[lane];

  const groovePlan: GroovePlan = {
    grooveType:         `${lane}_grammar`,
    lane,
    steps:              16,
    kickPattern:        Array.from({ length: 16 }, (_, i) => grammar.kick.includes(i) ? 1 : 0) as unknown as readonly number[],
    hatPattern:         Array.from({ length: 16 }, (_, i) => grammar.hat.includes(i) ? 1 : 0) as unknown as readonly number[],
    shakerPattern:      Array.from({ length: 16 }, (_, i) => grammar.shaker.includes(i) ? 1 : 0) as unknown as readonly number[],
    logDrumPattern:     Array.from({ length: 16 }, (_, i) => grammar.log.includes(i) ? 1 : 0) as unknown as readonly number[],
    swing:              grammar.swing,
    densityProfile:     "medium",
    microtimingProfile: grammar.microtiming,
    styleBiasApplied:   false,
  };

  const suggestions: string[] = [];
  for (const issue of evaluation.issues) {
    if (issue.includes("Log drum"))
      suggestions.push("Layer a log drum sample on beats 2 and 4 (steps 7, 15)");
    else if (issue.includes("BPM"))
      suggestions.push(`Adjust tempo to ${LANE_TARGETS[lane].bpm} BPM`);
    else if (issue.includes("Swing"))
      suggestions.push("Apply triplet quantisation or set DAW swing to 53–55%");
    else if (issue.includes("authenticity"))
      suggestions.push(`Re-align arrangement to ${lane} grammar patterns`);
  }

  return {
    recommendedCtl: {
      lane,
      bpm:     evaluation.features.bpm,
      swing:   grammar.swing,
      logDrum: evaluation.logDrum?.isLogDrum ? "keep" : "add",
      quality: evaluation.quality.tier,
    },
    groovePlan,
    suggestions,
    canAutoEnhance: evaluation.quality.producerScore >= 0.40,
  };
}
