import { CTLv1 } from "@aura-x/ctl";
import { ValidationResult, ValidationIssue } from "./types";

export function validateInstrumentation(ctl: CTLv1): ValidationResult {
  const issues: ValidationIssue[] = [];
  const { instrumentation, cultural_lineage, global } = ctl;

  // ─── LOG DRUM MUST EXIST ─────────────────────────────────────────────────
  const logDrum = instrumentation.find(i => i.family === "log_drum");
  if (!logDrum) {
    issues.push({
      code:     "inst_no_log_drum",
      severity: "error",
      field:    "instrumentation",
      message:  "Log drum is absent — Amapiano requires a log drum",
    });
  } else {
    // ─── LOG DRUM MUST BE MONO_CENTERED ──────────────────────────────────
    if (logDrum.stereo_profile !== "mono_centered") {
      issues.push({
        code:          "inst_log_drum_not_mono",
        severity:      "error",
        field:         "instrumentation[log_drum].stereo_profile",
        message:       `Log drum stereo_profile is "${logDrum.stereo_profile}" — must be mono_centered`,
        current_value: logDrum.stereo_profile,
        expected:      "mono_centered",
      });
    }

    // ─── LOG DRUM BODY WEIGHT FLOOR ───────────────────────────────────────
    if (logDrum.body_weight < 0.55) {
      issues.push({
        code:          "inst_log_drum_body_too_low",
        severity:      "warning",
        field:         "instrumentation[log_drum].body_weight",
        message:       `Log drum body_weight (${logDrum.body_weight}) is low — may get buried in mix`,
        current_value: logDrum.body_weight,
        expected:      ">= 0.55",
      });
    }

    // ─── PATCH CLASS / SUBGENRE COMPATIBILITY ────────────────────────────
    const rawPatchOnLuxury =
      logDrum.patch_class === "bacardi_raw_log" &&
      (global.subgenre === "private_school" || global.subgenre === "hybrid_rnb_amapiano");
    const bacardiWeight = (cultural_lineage.bacardi?.weight) ?? 0;

    if (rawPatchOnLuxury && bacardiWeight < 0.5) {
      issues.push({
        code:          "inst_log_patch_mismatch",
        severity:      "warning",
        field:         "instrumentation[log_drum].patch_class",
        message:       `Raw log patch "${logDrum.patch_class}" on luxury lane with low bacardi lineage`,
        current_value: logDrum.patch_class,
        expected:      "private_school_soft_log",
      });
    }
  }

  // ─── MBIRA PATCH AUTHENTICITY ────────────────────────────────────────────
  const mbiraInst = instrumentation.find(i => i.family === "mbira");
  if (mbiraInst && mbiraInst.patch_class !== "mbira_organic_pluck") {
    issues.push({
      code:          "inst_mbira_wrong_patch",
      severity:      "error",
      field:         "instrumentation[mbira].patch_class",
      message:       `Mbira patch_class "${mbiraInst.patch_class}" is not authentic — must be mbira_organic_pluck`,
      current_value: mbiraInst.patch_class,
      expected:      "mbira_organic_pluck",
    });
  }

  const errors = issues.filter(i => i.severity === "error");
  return { passed: errors.length === 0, issues };
}
