// CTL Perception Bridge — forward perception prediction without audio rendering.
//
// The Python aura-x-engine discovered (O-series, 200+ experiments) that Suno's
// classifier operates via three hard constraints:
//
//   C1  Bass–piano exclusivity:  B_eff = alpha_B × gain_ld
//       B_eff < 0.40  →  piano visible  →  harmonic frame
//       B_eff > 0.44  →  piano masked   →  percussion frame  (phase transition)
//
//   C2  Density ceiling:  ≤ 4 strong transients/bar (K + L tokens)
//       > 4  →  rhythm-dominant, harmonic recognition suppressed
//
//   C3  Anchor continuity:  log drum must be present in ALL sections
//       dropout in any section  →  harmonic frame collapses
//
// This module maps CTL parameters → Python perception params → predicted state,
// so the optimizer can adjust CTL before generation rather than after.

import type { CTLv1 } from "@aura-x/ctl";
import { clamp } from "../_utils";

// ── Constants (O.211 boundaries) ─────────────────────────────────────────────

export const C1_B_EFF_HARMONIC_MAX = 0.40;   // above this → piano masked
export const C1_B_EFF_PERCUSSION_MIN = 0.44; // above this → percussion lock
export const C1_OPTIMAL_ALPHA_B = 0.32;      // O.211 sweet spot
export const C2_MAX_TRANSIENTS  = 4;         // K + L tokens per 16-step bar
export const C3_MIN_LD_DENSITY  = 0.10;      // log drum density floor

// ── Types ─────────────────────────────────────────────────────────────────────

export type PerceptionState = "harmonic" | "ambiguous" | "percussion";

export interface CTLPerceptionParams {
  alpha_B:           number;   // C1: bass dominance ratio [0,1]
  gain_ld:           number;   // C1: log drum body weight [0,1]
  b_eff:             number;   // C1: alpha_B × gain_ld (the critical product)
  transient_density: number;   // C2: K+L tokens per 16-step bar
  anchor_continuous: boolean;  // C3: all log_drum_density curve points ≥ 0.10
}

export interface CTLPerceptionReport {
  params:     CTLPerceptionParams;
  state:      PerceptionState;
  c1_pass:    boolean;
  c2_pass:    boolean;
  c3_pass:    boolean;
  violations: string[];
}

// ── Parameter extraction ──────────────────────────────────────────────────────

const BASS_FAMILIES = new Set(["log_drum", "bass", "kick"]);
const HARMONIC_FAMILIES = new Set(["piano", "rhodes", "pads", "mbira", "stabs"]);
const TRANSIENT_TOKENS = new Set(["K", "L"]);

export function extractCTLPerceptionParams(ctl: CTLv1): CTLPerceptionParams {
  // C1: compute alpha_B and gain_ld from instrumentation weights
  let bassWeight     = 0;
  let harmonicWeight = 0;
  let ldWeight       = 0;

  for (const inst of ctl.instrumentation) {
    const bw = inst.body_weight;
    if (BASS_FAMILIES.has(inst.family)) {
      bassWeight += bw;
      if (inst.family === "log_drum") ldWeight = bw;
    } else if (HARMONIC_FAMILIES.has(inst.family)) {
      harmonicWeight += bw;
    }
  }

  const totalWeight = bassWeight + harmonicWeight;
  const alpha_B = totalWeight > 0 ? clamp(bassWeight / totalWeight) : 0.5;
  const gain_ld = clamp(ldWeight);
  const b_eff   = clamp(alpha_B * gain_ld);

  // C2: average K+L transients per bar across all groove patterns
  const patterns = ctl.groove_patterns;
  let totalTransients = 0;
  for (const p of patterns) {
    totalTransients += (p.steps as readonly string[]).filter(s => TRANSIENT_TOKENS.has(s)).length;
  }
  const transient_density = patterns.length > 0
    ? totalTransients / patterns.length
    : 0;

  // C3: log drum density must not drop below floor in any bar
  const ldCurve = ctl.curves.log_drum_density;
  const anchor_continuous = ldCurve.length > 0
    && ldCurve.every(pt => pt.value >= C3_MIN_LD_DENSITY);

  return { alpha_B, gain_ld, b_eff, transient_density, anchor_continuous };
}

// ── State prediction ──────────────────────────────────────────────────────────

export function predictCTLPerceptionState(ctl: CTLv1): CTLPerceptionReport {
  const params = extractCTLPerceptionParams(ctl);

  const c1_pass = params.b_eff < C1_B_EFF_PERCUSSION_MIN;
  const c2_pass = params.transient_density <= C2_MAX_TRANSIENTS;
  const c3_pass = params.anchor_continuous;

  const violations: string[] = [];

  if (!c1_pass) {
    violations.push(
      `C1: B_eff ${params.b_eff.toFixed(3)} ≥ ${C1_B_EFF_PERCUSSION_MIN} ` +
      `(alpha_B=${params.alpha_B.toFixed(3)} × gain_ld=${params.gain_ld.toFixed(3)}) — ` +
      `bass dominates, piano will be masked by classifier`
    );
  } else if (params.b_eff >= C1_B_EFF_HARMONIC_MAX) {
    violations.push(
      `C1 marginal: B_eff ${params.b_eff.toFixed(3)} in transition zone [0.40, 0.44] — ` +
      `reduce bass weight to reach harmonic stability`
    );
  }

  if (!c2_pass) {
    violations.push(
      `C2: ${params.transient_density.toFixed(1)} K+L transients/bar > ${C2_MAX_TRANSIENTS} — ` +
      `rhythm-dominant frame, harmonic recognition suppressed`
    );
  }

  if (!c3_pass) {
    violations.push(
      `C3: log drum density drops below ${C3_MIN_LD_DENSITY} in at least one section — ` +
      `anchor discontinuity collapses harmonic frame`
    );
  }

  // State classification:
  // harmonic  = C1 clear (b_eff < 0.40) AND C2 AND C3
  // ambiguous = C1 passes threshold but not zero violations
  // percussion = C1 hard fail (b_eff ≥ 0.44)
  let state: PerceptionState;
  if (c1_pass && c2_pass && c3_pass && params.b_eff < C1_B_EFF_HARMONIC_MAX) {
    state = "harmonic";
  } else if (!c1_pass && params.b_eff >= C1_B_EFF_PERCUSSION_MIN) {
    state = "percussion";
  } else {
    state = "ambiguous";
  }

  return { params, state, c1_pass, c2_pass, c3_pass, violations };
}
