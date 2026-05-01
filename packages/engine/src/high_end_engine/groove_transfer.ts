// Groove transfer — 2-stage grammar blending + style model bias.
// Mirrors aura-x-engine/high_end_engine/groove_transfer.py

import { clamp, hammingDistance } from "../_utils";
import {
  LANE_GRAMMARS,
  type Lane, type GroovePlan, type BlendStrategy, type QualityScore,
} from "../types";

// ── Secondary weight calculation ──────────────────────────────────────────────
// Higher producer score → preserve more identity (less secondary blending)

function secondaryWeight(producerScore: number, blendStrategy: BlendStrategy): number {
  const preservation = clamp(producerScore);
  switch (blendStrategy) {
    case "transform_to_target_preserve_identity":
      return clamp(0.22 + (1 - preservation) * 0.38, 0.20, 0.60);
    case "preserve_primary_blend_secondary":
      return clamp(0.18 + (1 - preservation) * 0.30, 0.15, 0.48);
    case "multi_lane_blend":
      return clamp(0.25 + (1 - preservation) * 0.30, 0.20, 0.55);
    case "single_lane":
    default:
      return clamp(0.10 + (1 - preservation) * 0.20, 0.10, 0.35);
  }
}

// ── Stage 1: Grammar blending ─────────────────────────────────────────────────

function grammarToPattern(lane: Lane, key: "kick" | "hat" | "shaker" | "log"): number[] {
  const pattern = new Array(16).fill(0);
  for (const i of LANE_GRAMMARS[lane][key]) {
    if (i >= 0 && i < 16) pattern[i] = 1;
  }
  return pattern;
}

function blendBinary(primary: number[], secondary: number[], weight: number): number[] {
  return primary.map((p, i) => {
    if (p === 1) return 1;
    if (secondary[i] === 1 && weight >= 0.25) return 1;
    return 0;
  });
}

// ── Stage 2: Style model bias (applied when learned templates available) ──────

export interface StyleTemplate {
  lane:         Lane;
  kickPattern:  number[];
  hatPattern:   number[];
  shakerPattern: number[];
  logDrumPattern: number[];
  swing:        number;
  densityMode:  "sparse" | "medium" | "dense";
}

function applyTemplateBias(
  current: number[],
  template: number[],
  sourceFraction = 0.30,
): number[] {
  return current.map((c, i) => (0.7 * template[i] + sourceFraction * c) >= 0.5 ? 1 : 0);
}

function nearestTemplate(
  pattern: number[],
  templates: StyleTemplate[],
  targetLane: Lane,
): StyleTemplate | null {
  const candidates = templates.filter((t) => t.lane === targetLane);
  if (candidates.length === 0) return null;

  let best: StyleTemplate = candidates[0], bestDist = Infinity;
  for (const t of candidates) {
    const combined = t.kickPattern.map((k, i) => k | t.hatPattern[i] | t.logDrumPattern[i] | t.shakerPattern[i]);
    const dist = hammingDistance(pattern, combined);
    if (dist < bestDist) { bestDist = dist; best = t; }
  }
  return best;
}

// ── Main groove transfer ──────────────────────────────────────────────────────

export function transferGroove(
  targetLane: Lane,
  sourceLane: Lane,
  quality: QualityScore,
  blendStrategy: BlendStrategy,
  styleTemplates: StyleTemplate[] = [],
): GroovePlan {
  const weight = secondaryWeight(quality.producerScore, blendStrategy);

  // Stage 1: Grammar blending
  const kick    = blendBinary(grammarToPattern(targetLane, "kick"),   grammarToPattern(sourceLane, "kick"),   weight);
  const hat     = blendBinary(grammarToPattern(targetLane, "hat"),    grammarToPattern(sourceLane, "hat"),    weight);
  const shaker  = blendBinary(grammarToPattern(targetLane, "shaker"), grammarToPattern(sourceLane, "shaker"), weight);
  const logDrum = blendBinary(grammarToPattern(targetLane, "log"),    grammarToPattern(sourceLane, "log"),    weight);

  const grammar      = LANE_GRAMMARS[targetLane];
  let swing          = grammar.swing;
  let densityProfile: GroovePlan["densityProfile"] = "medium";
  let styleBiasApplied = false;

  // Stage 2: Style model bias
  if (styleTemplates.length > 0) {
    const combined = kick.map((k, i) => k | hat[i] | logDrum[i] | shaker[i]);
    const template = nearestTemplate(combined, styleTemplates, targetLane);
    if (template) {
      // Re-blend kick + logDrum toward template; hats are usually lane-consistent
      for (let i = 0; i < 16; i++) kick[i]    = applyTemplateBias(kick,    template.kickPattern,    0.30)[i];
      for (let i = 0; i < 16; i++) logDrum[i] = applyTemplateBias(logDrum, template.logDrumPattern, 0.30)[i];
      // Pull swing toward corpus mean (30%)
      swing = 0.70 * template.swing + 0.30 * grammar.swing;
      densityProfile = template.densityMode;
      styleBiasApplied = true;
    }
  }

  const density = (kick.filter(Boolean).length + hat.filter(Boolean).length +
    shaker.filter(Boolean).length + logDrum.filter(Boolean).length) / (4 * 16);
  if (density < 0.20)       densityProfile = "sparse";
  else if (density < 0.45)  densityProfile = "medium";
  else                      densityProfile = "dense";

  return {
    grooveType:         `${sourceLane}→${targetLane}`,
    lane:               targetLane,
    steps:              16,
    kickPattern:        kick as readonly number[],
    hatPattern:         hat as readonly number[],
    shakerPattern:      shaker as readonly number[],
    logDrumPattern:     logDrum as readonly number[],
    swing,
    densityProfile,
    microtimingProfile: grammar.microtiming,
    styleBiasApplied,
  };
}
