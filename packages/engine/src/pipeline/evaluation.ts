// Evaluation pipeline — extracted from index.ts so analysis_pipeline.ts
// can import without a circular dependency.

import { parseWavMono }                from "../_audio_io";
import { extractAudioFeatures }        from "../audio_intelligence/feature_extraction";
import { scoreAuthenticityLanes }      from "../audio_intelligence/authenticity_scoring";
import { scoreLaneQuality }            from "../audio_intelligence/lane_quality";
import { extractGroovePattern }        from "../intelligence/groove_pattern";
import { applyPerceptionModel }        from "../perception/perception_model";
import { decomposeStems }              from "../perception/stem_decomposer";
import { computeCulturalAlignment }    from "../cultural/cultural_encoder";
import { AMAPIANO_THRESHOLD, LANE_GRAMMARS, LANE_TARGETS } from "../types";
import type { AmapianEvaluation, Enhancement, GroovePlan } from "../types";

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
