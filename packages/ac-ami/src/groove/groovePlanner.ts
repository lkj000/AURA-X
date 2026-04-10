import { CTLv1 } from "@aura-x/ctl";
import { z } from "zod";
import { GroovePatternSchema, SubgenreEnum } from "@aura-x/ctl";
import {
  GroovePattern,
  PRIVATE_SCHOOL_GROOVE_1, PRIVATE_SCHOOL_GROOVE_2,
  BACARDI_GROOVE_1, BACARDI_GROOVE_2,
  SGIJA_GROOVE_1, SGIJA_GROOVE_2,
  STIXX_GROOVE_1, STIXX_GROOVE_2, STIXX_GROOVE_3,
  MBIRAIANO_GROOVE_1,
  THREE_STEP_GROOVE_1,
  GQOM_GROOVE_1,
  HYBRID_RNB_GROOVE_1,
} from "./grooveLibrary";

type Subgenre = z.infer<typeof SubgenreEnum>;

export type GroovePlannerOptions = {
  /** 0–1: how energetic the groove should be (scales velocities) */
  intensity?: number;
  /** 0–1: how bouncy/Sgija-leaning (adjusts swing) */
  bounce?: number;
  /** 0–1: how many variation patterns to include */
  variationLevel?: number;
};

// ─── PRIMARY PATTERN PER SUBGENRE ────────────────────────────────────────────
const PRIMARY_PATTERNS: Record<Subgenre, GroovePattern> = {
  private_school:       PRIVATE_SCHOOL_GROOVE_1,
  bacardi:              BACARDI_GROOVE_1,
  sgija:                SGIJA_GROOVE_1,
  stixx_sgija:          STIXX_GROOVE_1,
  mbiraiano:            MBIRAIANO_GROOVE_1,
  three_step:           THREE_STEP_GROOVE_1,
  gqom_fusion:          GQOM_GROOVE_1,
  hybrid_rnb_amapiano:  HYBRID_RNB_GROOVE_1,
};

// ─── VARIATION FAMILIES ───────────────────────────────────────────────────────
const VARIATION_PATTERNS: Partial<Record<Subgenre, GroovePattern[]>> = {
  private_school:  [PRIVATE_SCHOOL_GROOVE_2],
  bacardi:         [BACARDI_GROOVE_2],
  sgija:           [SGIJA_GROOVE_2],
  stixx_sgija:     [STIXX_GROOVE_2, STIXX_GROOVE_3],
};

// ─── SWING CEILING PER SUBGENRE ──────────────────────────────────────────────
// Bacardi, Gqom, and 3-Step are hard/quantized lanes — swing ceiling 0.52
const SWING_CEILING: Partial<Record<Subgenre, number>> = {
  bacardi:     0.52,
  gqom_fusion: 0.52,
  three_step:  0.52,
};

export function planGroove(
  ctl: CTLv1,
  opts: GroovePlannerOptions = {}
): GroovePattern[] {
  const { global, cultural_lineage } = ctl;
  const subgenre = global.subgenre;

  const intensity      = opts.intensity      ?? 0.6;
  const bounce         = opts.bounce         ?? 0.5;
  const variationLevel = opts.variationLevel ?? 0.5;

  // ─── 1. PRIMARY PATTERN SELECTION ────────────────────────────────────────
  let primary = PRIMARY_PATTERNS[subgenre];

  // Kwaito lineage: high weight on Sgija lane → most repetitive pattern
  const kwaitoWeight = cultural_lineage.kwaito?.weight ?? 0;
  if (kwaitoWeight >= 0.5 && subgenre === "sgija") {
    primary = SGIJA_GROOVE_1;
  }

  // ─── 2. ADAPT PRIMARY ────────────────────────────────────────────────────
  const adapted = adaptSwing(adaptVelocity(primary, intensity), bounce, subgenre);

  // ─── 3. VARIATION SELECTION ──────────────────────────────────────────────
  const patterns: GroovePattern[] = [adapted];

  if (variationLevel >= 0.3) {
    const variations = VARIATION_PATTERNS[subgenre] ?? [];
    const limit = maxVariations(variationLevel);
    for (const v of variations) {
      if (patterns.length >= limit) break;
      patterns.push(adaptVelocity(v, intensity));
    }
  }

  return patterns;
}

// ─── ADAPTATION HELPERS ──────────────────────────────────────────────────────

function adaptVelocity(pattern: GroovePattern, intensity: number): GroovePattern {
  // intensity 0.5 = identity. 1.0 = +15%. 0.0 = -15%.
  const factor = 1 + (intensity - 0.5) * 0.3;
  return {
    ...pattern,
    velocity: pattern.velocity.map(v =>
      v === 0 ? 0 : Math.min(127, Math.round(v * factor))
    ) as GroovePattern["velocity"],
  };
}

function adaptSwing(
  pattern: GroovePattern,
  bounce: number,
  subgenre: Subgenre
): GroovePattern {
  const ceiling   = SWING_CEILING[subgenre] ?? 0.62;
  const delta     = (bounce - 0.5) * 0.12;
  const newSwing  = Math.max(0.48, Math.min(ceiling, pattern.swing + delta));
  return { ...pattern, swing: parseFloat(newSwing.toFixed(3)) };
}

function maxVariations(variationLevel: number): number {
  if (variationLevel >= 0.8) return 4;
  if (variationLevel >= 0.5) return 3;
  return 2;
}

/** Returns a new CTL with groove_patterns replaced by the planner output. Immutable. */
export function applyGroovePlan(ctl: CTLv1, opts: GroovePlannerOptions = {}): CTLv1 {
  return { ...ctl, groove_patterns: planGroove(ctl, opts) };
}

// Re-export schema type for consumers
export type { GroovePattern };
export { GroovePatternSchema };
