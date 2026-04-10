import { CTLv1 } from "@aura-x/ctl";
import { ValidationResult, ValidationIssue } from "./types";

const MAX_CHORD_CHANGES: Record<string, number> = {
  private_school:       4,
  bacardi:              2,
  sgija:                3,
  stixx_sgija:          3,
  mbiraiano:            3,
  three_step:           3,
  gqom_fusion:          2,
  hybrid_rnb_amapiano:  6,
};

const RAW_LANES     = new Set(["bacardi", "gqom_fusion"]);
const SPARSE_LANES  = new Set(["bacardi", "sgija", "stixx_sgija", "gqom_fusion"]);
const STATIC_LANES  = new Set(["bacardi", "gqom_fusion"]);

export function validateHarmony(ctl: CTLv1): ValidationResult {
  const issues: ValidationIssue[] = [];
  const { harmony, global } = ctl;
  const subgenre = global.subgenre;

  // ─── CHORD CHANGE DENSITY ────────────────────────────────────────────────
  const maxAllowed = MAX_CHORD_CHANGES[subgenre] ?? 4;
  if (harmony.max_chord_changes_per_4_bars > maxAllowed) {
    issues.push({
      code:          "harmony_too_many_chord_changes",
      severity:      "error",
      field:         "harmony.max_chord_changes_per_4_bars",
      message:       `${harmony.max_chord_changes_per_4_bars} chord changes exceeds max for ${subgenre} (${maxAllowed})`,
      current_value: harmony.max_chord_changes_per_4_bars,
      expected:      `<= ${maxAllowed}`,
    });
  }

  // ─── EXTENSION POLICY ON RAW LANES ───────────────────────────────────────
  if (RAW_LANES.has(subgenre) && harmony.extension_policy === "full_extensions") {
    issues.push({
      code:          "harmony_extensions_too_rich_for_raw_lane",
      severity:      "warning",
      field:         "harmony.extension_policy",
      message:       `full_extensions on ${subgenre} — raw lanes should use "none" or "sevenths_only"`,
      current_value: harmony.extension_policy,
      expected:      "none or sevenths_only",
    });
  }

  // ─── DENSE VOICING ON GROOVE-FIRST LANES ─────────────────────────────────
  if (SPARSE_LANES.has(subgenre) && harmony.voicing_style === "dense") {
    issues.push({
      code:          "harmony_voicing_too_dense",
      severity:      "warning",
      field:         "harmony.voicing_style",
      message:       `Dense voicing on ${subgenre} — groove-first lanes should stay sparse`,
      current_value: harmony.voicing_style,
      expected:      "sparse",
    });
  }

  // ─── MEDIUM RHYTHM ON STATIC LANES ───────────────────────────────────────
  if (STATIC_LANES.has(subgenre) && harmony.harmonic_rhythm === "medium") {
    issues.push({
      code:          "harmony_rhythm_too_fast_for_static_lane",
      severity:      "warning",
      field:         "harmony.harmonic_rhythm",
      message:       `Medium harmonic rhythm on ${subgenre} — static lanes should use "static" or "slow"`,
      current_value: harmony.harmonic_rhythm,
      expected:      "static or slow",
    });
  }

  const errors = issues.filter(i => i.severity === "error");
  return { passed: errors.length === 0, issues };
}
