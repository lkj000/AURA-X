// Groove Variation Engine — E-07
// Generates five authentic GroovePlan variants for a given lane:
//   main       — canonical grammar (A-section)
//   variation  — syncopated B-section: kick offset + extra log ghost
//   fill       — dense 1-bar transition fill (steps 8-15 log-heavy)
//   breakdown  — stripped: kick beat-1 only, no log drum (intro/outro)
//   build      — sparse first 8 steps, full second 8 (pre-drop tension)

import { clamp } from "../_utils";
import { LANE_GRAMMARS, LANE_TARGETS } from "../types";
import type { Lane, GroovePlan, GrooveVariationSet } from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function zeros(): number[] { return new Array(16).fill(0); }

function fromHits(hits: number[]): readonly number[] {
  const p = zeros();
  for (const h of hits) if (h >= 0 && h < 16) p[h] = 1;
  return p as unknown as readonly number[];
}

function plan(
  lane:       Lane,
  variant:    string,
  kick:       number[],
  hat:        number[],
  shaker:     number[],
  log:        number[],
  swing:      number,
  density:    "sparse" | "medium" | "dense",
  microtiming: string,
): GroovePlan {
  return {
    grooveType:         `${lane}_${variant}`,
    lane,
    steps:              16,
    kickPattern:        fromHits(kick),
    hatPattern:         fromHits(hat),
    shakerPattern:      fromHits(shaker),
    logDrumPattern:     fromHits(log),
    swing,
    densityProfile:     density,
    microtimingProfile: microtiming,
    styleBiasApplied:   true,
  };
}

// Shift a hit index by offset, wrapping within [0, 15]
function shift(hits: number[], offset: number): number[] {
  return hits.map((h) => (h + offset + 16) % 16);
}

// Add a hit at `step` if not already present
function addHit(hits: number[], step: number): number[] {
  return hits.includes(step) ? hits : [...hits, step];
}

// ── Variation builders ────────────────────────────────────────────────────────

function buildMain(lane: Lane, swing: number): GroovePlan {
  const g = LANE_GRAMMARS[lane];
  return plan(lane, "main", g.kick, g.hat, g.shaker, g.log, swing, "medium", g.microtiming);
}

function buildVariation(lane: Lane, swing: number): GroovePlan {
  const g = LANE_GRAMMARS[lane];
  // Shift secondary kick hits (+1) — keep beat-1 hit anchored at step 0
  const varKick = g.kick.map((h) => (h === 0 ? 0 : (h + 1) % 16));
  // Add a log drum ghost note one step before the last log hit
  const lastLog  = g.log[g.log.length - 1] ?? 15;
  const varLog   = addHit(g.log, (lastLog - 1 + 16) % 16);
  return plan(lane, "variation", varKick, g.hat, g.shaker, varLog, swing, "medium", g.microtiming);
}

function buildFill(lane: Lane, swing: number): GroovePlan {
  const g = LANE_GRAMMARS[lane];
  // Kick on beat 1 + 3 (steps 0, 8)
  const fillKick = [0, 8];
  // Dense hat: all even steps
  const fillHat  = [0, 2, 4, 6, 8, 10, 12, 14];
  // Dense log drum: all of steps 8-15 (second half fill)
  const fillLog  = [8, 9, 10, 11, 12, 13, 14, 15];
  // Shaker: same as main
  return plan(lane, "fill", fillKick, fillHat, g.shaker, fillLog, swing, "dense", "forward_shuffle");
}

function buildBreakdown(lane: Lane, swing: number): GroovePlan {
  const g = LANE_GRAMMARS[lane];
  // Kick: beat 1 only
  const bdKick = [0];
  // Hat: downbeats only (quarter notes)
  const bdHat  = [0, 4, 8, 12];
  // Shaker: same as main (pulse glue)
  // Log drum: silent
  return plan(lane, "breakdown", bdKick, bdHat, g.shaker, [], swing, "sparse", "laidback_hat_pull");
}

function buildBuild(lane: Lane, swing: number): GroovePlan {
  const g = LANE_GRAMMARS[lane];
  // First 8 steps: kick only on step 0, hat on 2 and 6 — sparse tension
  // Last 8 steps: full grammar in second half (offset by 8)
  const buildKick   = [0, ...g.kick.filter((h) => h >= 8)];
  const buildHat    = [2, 6, ...g.hat.filter((h) => h >= 8)];
  const buildShaker = g.shaker.filter((h) => h >= 8);
  const buildLog    = g.log.filter((h) => h >= 8);
  return plan(lane, "build", buildKick, buildHat, buildShaker, buildLog, swing, "sparse", g.microtiming);
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface VariationOptions {
  bpm?:          number;
  swingOverride?: number;
}

export function generateGrooveVariations(
  lane:    Lane,
  options: VariationOptions = {},
): GrooveVariationSet {
  const targets  = LANE_TARGETS[lane];
  const bpm      = options.bpm ?? targets.bpm;
  const swing    = clamp(options.swingOverride ?? LANE_GRAMMARS[lane].swing, 0.45, 0.60);

  return {
    lane,
    bpm,
    swing,
    main:      buildMain(lane, swing),
    variation: buildVariation(lane, swing),
    fill:      buildFill(lane, swing),
    breakdown: buildBreakdown(lane, swing),
    build:     buildBuild(lane, swing),
  };
}
