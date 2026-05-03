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

// Return a pattern array corrected toward the target grammar.
// Uses the actually detected hits as a base and adds only the specific
// grammar positions that are missing, scaled by how far off the groove is.
function correctTowardGrammar(
  detectedHits: readonly number[],
  grammarPositions: number[],
  laneDistance: number,
): number[] {
  const pattern = Array.from({ length: 16 }, (_, i) => (detectedHits.includes(i) ? 1 : 0));
  // Per-voice distance estimate (combined distance shared across 4 voices)
  const voiceDist = laneDistance / 4;
  if (voiceDist < 1.0) return pattern; // already very close — keep as detected

  // Grammar steps that are missing from the detected pattern
  const missing = grammarPositions.filter((s) => !detectedHits.includes(s));
  // Add all missing when far off, half when moderately off
  const toAdd = voiceDist >= 3 ? missing : missing.slice(0, Math.ceil(missing.length * 0.5));
  for (const s of toAdd) pattern[s] = 1;
  return pattern;
}

export function buildEnhancement(evaluation: AmapianEvaluation): Enhancement {
  const lane    = evaluation.laneScores.bestFitLane;
  const grammar = LANE_GRAMMARS[lane];
  const target  = LANE_TARGETS[lane];
  const detected = evaluation.groove;

  // ── Swing: measured gap → correct 70% of the way to target ─────────────────
  const actualSwing   = evaluation.features.groove.swingRatio;
  const targetSwing   = target.swing;
  const enhancedSwing = +(actualSwing + (targetSwing - actualSwing) * 0.70).toFixed(3);

  // ── Groove patterns: start from detected hits, correct only what's off ──────
  let kickPattern:    number[];
  let hatPattern:     number[];
  let logDrumPattern: number[];
  let shakerPattern:  number[];
  let grooveType:     string;
  let densityProfile: "sparse" | "medium" | "dense";

  if (detected) {
    const d = detected.laneDistance;
    kickPattern    = correctTowardGrammar(detected.kickHits,    grammar.kick,   d);
    hatPattern     = correctTowardGrammar(detected.hatHits,     grammar.hat,    d);
    shakerPattern  = correctTowardGrammar(detected.shakerHits,  grammar.shaker, d);

    // Log drum: if absent or underdeveloped, always fill in grammar positions
    const logWeak = !evaluation.logDrum?.isLogDrum || evaluation.logDrum.grade === "developing";
    if (logWeak) {
      const base = Array.from({ length: 16 }, (_, i) => (detected.logDrumHits.includes(i) ? 1 : 0));
      for (const s of grammar.log) base[s] = 1;
      logDrumPattern = base;
    } else {
      logDrumPattern = correctTowardGrammar(detected.logDrumHits, grammar.log, d * 0.5);
    }

    grooveType    = d <= 2 ? `${lane}_verified` : d <= 6 ? `${lane}_tuned` : `${lane}_corrected`;
    densityProfile = detected.density > 0.50 ? "dense" : detected.density > 0.28 ? "medium" : "sparse";
  } else {
    // No groove detected — grammar is the only reference
    kickPattern    = Array.from({ length: 16 }, (_, i) => grammar.kick.includes(i)   ? 1 : 0);
    hatPattern     = Array.from({ length: 16 }, (_, i) => grammar.hat.includes(i)    ? 1 : 0);
    shakerPattern  = Array.from({ length: 16 }, (_, i) => grammar.shaker.includes(i) ? 1 : 0);
    logDrumPattern = Array.from({ length: 16 }, (_, i) => grammar.log.includes(i)    ? 1 : 0);
    grooveType     = `${lane}_grammar_fallback`;
    densityProfile = "medium";
  }

  // ── Suggestions derived from measured values, not parsed issue strings ───────
  const suggestions: string[] = [];
  const actualBpm = evaluation.features.bpm;
  const bpmGap    = target.bpm - actualBpm;

  if (Math.abs(bpmGap) > 1.5) {
    const dir = bpmGap > 0 ? "Speed up" : "Slow down";
    suggestions.push(
      `${dir} by ${Math.abs(bpmGap).toFixed(1)} BPM — detected ${actualBpm.toFixed(1)} BPM, ` +
      `${lane} target is ${target.bpm} BPM`,
    );
  }

  if (Math.abs(targetSwing - actualSwing) > 0.015) {
    const dir = targetSwing > actualSwing ? "Increase" : "Reduce";
    suggestions.push(
      `${dir} swing from ${(actualSwing * 100).toFixed(1)}% → ${(targetSwing * 100).toFixed(0)}% ` +
      `(${lane} requires ${targetSwing > actualSwing ? "more lilt" : "tighter feel"})`,
    );
  }

  if (!evaluation.logDrum?.isLogDrum) {
    const keyRoot = evaluation.harmonic?.key?.replace(/m$/, "") ?? "G";
    suggestions.push(
      `No log drum detected — add a sample pitched to ${keyRoot} (60–200 Hz), ` +
      `pitch glide ≥ 1.0 semitones`,
    );
  } else if (evaluation.logDrum.grade === "developing") {
    const glide = evaluation.logDrum.pitchGlideSemitones.toFixed(2);
    const wood  = (evaluation.logDrum.woodResonance * 100).toFixed(0);
    suggestions.push(
      `Strengthen log drum — glide is ${glide}st (need ≥ 1.0st), ` +
      `wood resonance ${wood}% — layer a deeper sample or increase pitch envelope depth`,
    );
  }

  if (detected && detected.laneDistance > 4) {
    const severity = detected.laneDistance > 9 ? "major" : "moderate";
    suggestions.push(
      `${severity} groove misalignment — ${detected.laneDistance} steps from ideal ${lane} pattern ` +
      `(pocket score: ${(detected.pocketScore * 100).toFixed(0)}%)`,
    );
  }

  if (evaluation.harmonic && evaluation.harmonic.amapianoCompatibility < 0.55) {
    const compat = (evaluation.harmonic.amapianoCompatibility * 100).toFixed(0);
    const key    = evaluation.harmonic.key;
    suggestions.push(
      `Harmonic compatibility ${compat}% in ${key} — shift chord voicings toward min7, maj9, or min11 extensions`,
    );
  }

  if (evaluation.cultural.alignmentScore < 0.50) {
    for (const d of evaluation.cultural.deviations.slice(0, 2)) suggestions.push(d);
  }

  const logDrumAction =
    !evaluation.logDrum?.isLogDrum ? "add"
    : evaluation.logDrum.grade === "developing" ? "strengthen"
    : "keep";

  const groovePlan: GroovePlan = {
    grooveType,
    lane,
    steps:              16,
    kickPattern:        kickPattern    as unknown as readonly number[],
    hatPattern:         hatPattern     as unknown as readonly number[],
    shakerPattern:      shakerPattern  as unknown as readonly number[],
    logDrumPattern:     logDrumPattern as unknown as readonly number[],
    swing:              enhancedSwing,
    densityProfile,
    microtimingProfile: grammar.microtiming,
    styleBiasApplied:   false,
  };

  return {
    recommendedCtl: {
      lane,
      bpm:           actualBpm,
      bpmTarget:     target.bpm,
      bpmDelta:      +bpmGap.toFixed(2),
      swing:         enhancedSwing,
      swingDetected: +actualSwing.toFixed(3),
      logDrum:       logDrumAction,
      quality:       evaluation.quality.tier,
      laneDistance:  detected?.laneDistance ?? null,
      correctionMode:
        !detected              ? "grammar_fallback"
        : detected.laneDistance <= 2 ? "analysis_verified"
        : "analysis_corrected",
    },
    groovePlan,
    suggestions,
    canAutoEnhance: evaluation.quality.producerScore >= 0.40,
  };
}
