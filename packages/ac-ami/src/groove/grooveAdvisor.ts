import type { Lane } from "@aura-x/engine";
import { ALL_PATTERNS, GroovePattern } from "./grooveLibrary";

export type GrooveSuggestion = {
  patternId:    string;
  label:        string;
  lane:         Lane;
  confidence:   number;   // 0–1
  reason:       string;
  ghostDensity: number;   // fraction of 'g' steps / 16
  hitDensity:   number;   // fraction of active (non-rest, non-ghost) steps / 16
  swing:        number;
};

export type GrooveAdvisorOptions = {
  /** evaluation.groove_clarity_score — drives complexity preference */
  grooveClarityScore?: number;
  /** evaluation.composite_score — influences cross-lane exploration */
  compositeScore?: number;
  /** Desired energy 0–1 — aligns velocity range */
  intensity?: number;
  /** 0–1: willingness to cross-lane (0 = stay in lane, 1 = explore freely) */
  variationLevel?: number;
  /** Max suggestions to return (default 5) */
  maxSuggestions?: number;
};

// ─── Lane prefix table ────────────────────────────────────────────────────────

const LANE_PREFIX: Record<Lane, string> = {
  private_school:      "ps_",
  bacardi:             "bac_",
  sgija:               "sgija_",
  stixx_sgija:         "stixx_",
  mbiraiano:           "mbira_",
  three_step:          "3step_",
  gqom_fusion:         "gqom_",
  hybrid_rnb_amapiano: "rnb_",
};

function patternLane(id: string): Lane {
  for (const [lane, prefix] of Object.entries(LANE_PREFIX) as [Lane, string][]) {
    if (id.startsWith(prefix)) return lane;
  }
  return "private_school";
}

// ─── Per-pattern signal metrics ───────────────────────────────────────────────

function ghostDensity(p: GroovePattern): number {
  return p.steps.filter(s => s === "g").length / 16;
}

function hitDensity(p: GroovePattern): number {
  return p.steps.filter(s => s !== "-" && s !== "g").length / 16;
}

function avgNonZeroVelocity(p: GroovePattern): number {
  const nz = p.velocity.filter(v => v > 0);
  return nz.length > 0 ? nz.reduce((a, b) => a + b, 0) / nz.length : 0;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scorePattern(
  p: GroovePattern,
  targetLane: Lane,
  grooveClarityScore: number,
  compositeScore: number,
  intensity: number,
  variationLevel: number,
): { score: number; reason: string } {
  const pLane   = patternLane(p.id);
  const gd      = ghostDensity(p);
  const hd      = hitDensity(p);
  const vel     = avgNonZeroVelocity(p);
  let score     = 0;
  const factors: string[] = [];

  // ── Lane match (0–0.40) ──────────────────────────────────────────────────
  if (pLane === targetLane) {
    score += 0.40;
    factors.push("primary lane match");
  } else if (variationLevel >= 0.5) {
    score += 0.10 * variationLevel;
    factors.push("cross-lane exploration");
  }

  // ── Groove clarity fit (0–0.30) ──────────────────────────────────────────
  if (grooveClarityScore < 0.4) {
    // Struggling groove → prefer clean, readable patterns
    const simplicity = (1 - gd) * 0.5 + Math.min(1, hd / 0.5) * 0.5;
    score += simplicity * 0.30;
    if (gd < 0.15) factors.push("clean pattern for low groove clarity");
  } else if (grooveClarityScore > 0.7) {
    // Strong groove → room for ghost-note richness
    const richness = gd * 0.5 + Math.min(1, hd / 0.5) * 0.5;
    score += richness * 0.20;
    if (gd > 0.20) factors.push("ghost richness suits solid groove");
  } else {
    score += 0.10;
    factors.push("mid-range groove");
  }

  // ── Velocity / intensity fit (0–0.20) ────────────────────────────────────
  const targetVel = 80 + intensity * 40;  // maps 0-1 → 80–120 MIDI
  const velDiff   = Math.abs(vel - targetVel) / 40;
  const velBonus  = (1 - Math.min(1, velDiff)) * 0.20;
  score += velBonus;
  if (velDiff < 0.25) factors.push("velocity match");

  // ── High composite + high variation: reward cross-lane variety ───────────
  if (compositeScore > 0.7 && variationLevel > 0.5 && pLane !== targetLane) {
    score += 0.05;
    factors.push("variation bonus");
  }

  return {
    score:  parseFloat(Math.min(1, score).toFixed(3)),
    reason: factors.join(", ") || "general match",
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function suggestGroove(
  lane: Lane,
  opts: GrooveAdvisorOptions = {}
): GrooveSuggestion[] {
  const grooveClarityScore = opts.grooveClarityScore ?? 0.5;
  const compositeScore     = opts.compositeScore     ?? 0.5;
  const intensity          = opts.intensity          ?? 0.6;
  const variationLevel     = opts.variationLevel     ?? 0.3;
  const maxSuggestions     = opts.maxSuggestions     ?? 5;

  return ALL_PATTERNS
    .map((p): GrooveSuggestion => {
      const { score, reason } = scorePattern(
        p, lane, grooveClarityScore, compositeScore, intensity, variationLevel,
      );
      return {
        patternId:    p.id,
        label:        p.label,
        lane:         patternLane(p.id),
        confidence:   score,
        reason,
        ghostDensity: parseFloat(ghostDensity(p).toFixed(3)),
        hitDensity:   parseFloat(hitDensity(p).toFixed(3)),
        swing:        p.swing,
      };
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxSuggestions);
}
