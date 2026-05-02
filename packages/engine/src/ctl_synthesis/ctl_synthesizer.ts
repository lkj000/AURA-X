// CTL Spec Synthesizer — E-05
// Translates AmapianEvaluation → CTLv1 by selecting the canonical preset for the
// detected lane and overriding with evaluation-specific intelligence:
//   BPM / key / mode from audio analysis, mix profile from cultural encoding,
//   energy + log_drum_density curves from stem decomposition, evaluation_targets
//   scaled by quality tier and cultural alignment score.

import { createCTL, PRESET_MAP } from "@aura-x/ctl";
import type { CTLv1 } from "@aura-x/ctl";
import { clamp } from "../_utils";
import { CULTURAL_PROFILES } from "../cultural/cultural_profiles";
import { LANE_TARGETS } from "../types";
import type { AmapianEvaluation, Lane } from "../types";

export type { CTLv1 };

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapMode(engineMode: "minor" | "major" | "dorian"): string {
  if (engineMode === "major")  return "ionian";
  if (engineMode === "dorian") return "dorian";
  return "aeolian";
}

function tonalCenter(key: string): string {
  return key.replace(/m$/, "");
}

// Quality tier → multiplier on evaluation targets
const QUALITY_SCALE: Record<string, number> = {
  elite:      1.00,
  strong:     0.97,
  developing: 0.93,
};

// ── Public API ────────────────────────────────────────────────────────────────

// Goal-based synthesis — no audio analysis required.
// Uses cultural profiles and lane targets to produce a fully-informed CTL
// from a producer's creative intent (subgenre, BPM, key, title).
export interface CtlGoal {
  title:             string;
  subgenre:          Lane;
  bpm?:              number;
  key?:              string;
  emotionalProfile?: string;
  createdBy:         string;
}

export function synthesizeCtlFromGoal(goal: CtlGoal): CTLv1 {
  const lane    = goal.subgenre;
  const preset  = PRESET_MAP[lane] ?? PRESET_MAP["private_school"];
  const profile = CULTURAL_PROFILES[lane];
  const targets = LANE_TARGETS[lane];

  const bpm   = Math.min(130, Math.max(95, goal.bpm ?? targets.bpm));
  const key   = goal.key ?? profile.keyBias[0] ?? preset.global.key;
  const mode  = preset.global.mode;
  const tonal = tonalCenter(key);

  const emotionalProfile = goal.emotionalProfile ?? profile.emotionalProfile.join(", ");

  // strong quality, perfect alignment (building to spec, not analysing existing audio)
  const tScale = QUALITY_SCALE["strong"] * 1.0;

  const bt = preset.evaluation_targets;
  const evaluationTargets = {
    authenticity_target:             clamp(bt.authenticity_target             * tScale),
    subgenre_recognizability_target: clamp(bt.subgenre_recognizability_target * tScale),
    groove_clarity_target:           clamp(bt.groove_clarity_target           * tScale),
    harmonic_density_target:         clamp(bt.harmonic_density_target         * tScale),
    dj_mix_friendliness_target:      clamp(bt.dj_mix_friendliness_target      * tScale),
    cultural_lineage_coherence:      clamp(bt.cultural_lineage_coherence),
  };

  const culturalHints = profile.productionMarkers
    .slice(0, 2)
    .map((m) => `cultural_marker: ${m}`);

  const productionDirectives = {
    ...preset.production_directives,
    automation_hints: [
      ...preset.production_directives.automation_hints,
      ...culturalHints,
    ],
  };

  return createCTL({
    global: {
      title:                goal.title,
      bpm,
      key,
      mode,
      subgenre:             lane,
      mix_profile:          profile.mixProfile,
      vocal_profile:        preset.global.vocal_profile,
      emotional_profile:    emotionalProfile,
      reference_style_tags: preset.global.reference_style_tags,
      created_by:           goal.createdBy,
    },
    sections:          preset.sections,
    curves:            preset.curves,
    groove_patterns:   preset.groove_patterns,
    harmony: {
      ...preset.harmony,
      tonal_center: tonal,
      mode,
    },
    instrumentation:   preset.instrumentation,
    cultural_lineage:  preset.cultural_lineage,
    style_constraints: {
      ...preset.style_constraints,
      preferred_keys: [...profile.keyBias],
    },
    production_directives: productionDirectives,
    evaluation_targets:    evaluationTargets,
  });
}

export function synthesizeCtl(
  evaluation: AmapianEvaluation,
  title:      string,
  createdBy:  string,
): CTLv1 {
  const lane    = evaluation.laneScores.bestFitLane;
  const preset  = PRESET_MAP[lane];
  const f       = evaluation.features;
  const cultural = evaluation.cultural;
  const profile  = CULTURAL_PROFILES[lane];

  // ── Global overrides ─────────────────────────────────────────────────────
  const bpm = Math.min(130, Math.max(95, Math.round(f.bpm)));

  const key = f.harmonic?.key
    ?? cultural.ctlConditioning.keyBias[0]
    ?? preset.global.key;

  const engineMode = f.harmonic?.mode ?? "minor";
  const mode       = mapMode(engineMode);
  const tonal      = tonalCenter(key);

  const emotionalProfile = profile.emotionalProfile.join(", ");

  // ── Evaluation targets ───────────────────────────────────────────────────
  const qScale = QUALITY_SCALE[evaluation.quality.tier] ?? 0.93;
  const aScale = 0.92 + 0.08 * cultural.alignmentScore; // [0.92, 1.0]
  const tScale = qScale * aScale;

  const bt = preset.evaluation_targets;
  const evaluationTargets = {
    authenticity_target:             clamp(bt.authenticity_target             * tScale),
    subgenre_recognizability_target: clamp(bt.subgenre_recognizability_target * tScale),
    groove_clarity_target:           clamp(bt.groove_clarity_target           * tScale),
    harmonic_density_target:         f.harmonic
      ? clamp(f.harmonic.harmonicRichness * 0.55 + bt.harmonic_density_target * 0.45)
      : clamp(bt.harmonic_density_target  * tScale),
    dj_mix_friendliness_target:      clamp(bt.dj_mix_friendliness_target      * tScale),
    cultural_lineage_coherence:      clamp(cultural.alignmentScore * 0.50 + bt.cultural_lineage_coherence * 0.50),
  };

  // ── Curves — energy + log_drum_density scaled from stem analysis ─────────
  const energyLevel    = clamp(f.energyRms * 1.2);
  const logDrumPresence = evaluation.stems.stemMap.log_drum.presenceScore;

  const curves = {
    ...preset.curves,
    energy: preset.curves.energy.map((pt) => ({
      bar:   pt.bar,
      value: clamp(pt.value * (0.55 + 0.45 * energyLevel)),
    })),
    log_drum_density: preset.curves.log_drum_density.map((pt) => ({
      bar:   pt.bar,
      value: clamp(pt.value * (0.45 + 0.55 * logDrumPresence)),
    })),
  };

  // ── Production directives — append cultural production markers ───────────
  const culturalHints = profile.productionMarkers
    .slice(0, 2)
    .map((m) => `cultural_marker: ${m}`);

  const productionDirectives = {
    ...preset.production_directives,
    automation_hints: [
      ...preset.production_directives.automation_hints,
      ...culturalHints,
    ],
  };

  // ── Style constraints — preferred keys from cultural encoding ────────────
  const preferredKeys = cultural.ctlConditioning.keyBias.length > 0
    ? [...cultural.ctlConditioning.keyBias]
    : preset.style_constraints.preferred_keys;

  // ── Assemble and validate via createCTL ──────────────────────────────────
  return createCTL({
    global: {
      title,
      bpm,
      key,
      mode,
      subgenre:             lane,
      mix_profile:          cultural.ctlConditioning.mixProfile,
      vocal_profile:        preset.global.vocal_profile,
      emotional_profile:    emotionalProfile,
      reference_style_tags: preset.global.reference_style_tags,
      created_by:           createdBy,
    },
    sections:             preset.sections,
    curves,
    groove_patterns:      preset.groove_patterns,
    harmony: {
      ...preset.harmony,
      tonal_center: tonal,
      mode,
    },
    instrumentation:      preset.instrumentation,
    cultural_lineage:     preset.cultural_lineage,
    style_constraints: {
      ...preset.style_constraints,
      preferred_keys: preferredKeys,
    },
    production_directives: productionDirectives,
    evaluation_targets:    evaluationTargets,
  });
}
