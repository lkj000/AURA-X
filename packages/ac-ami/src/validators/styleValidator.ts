import { CTLv1 } from "@aura-x/ctl";
import { ValidationResult, ValidationIssue } from "./types";

export function validateStyle(ctl: CTLv1): ValidationResult {
  const issues: ValidationIssue[] = [];
  const { style_constraints, global, curves, production_directives } = ctl;

  // ─── PIANO BUSYNESS CEILING ───────────────────────────────────────────────
  const maxPianoValue = Math.max(...curves.piano_activity.map(p => p.value));
  if (maxPianoValue > style_constraints.max_piano_busyness) {
    issues.push({
      code:          "style_piano_too_busy",
      severity:      "error",
      field:         "curves.piano_activity",
      message:       `Piano activity peak (${maxPianoValue.toFixed(2)}) exceeds max_piano_busyness (${style_constraints.max_piano_busyness})`,
      current_value: maxPianoValue,
      expected:      `<= ${style_constraints.max_piano_busyness}`,
    });
  }

  // ─── PAD WARMTH FLOOR ────────────────────────────────────────────────────
  const minPadValue = Math.min(...curves.pad_warmth.map(p => p.value));
  if (minPadValue < style_constraints.min_pad_warmth) {
    issues.push({
      code:          "style_pad_too_cold",
      severity:      "warning",
      field:         "curves.pad_warmth",
      message:       `Pad warmth floor (${minPadValue.toFixed(2)}) is below min_pad_warmth (${style_constraints.min_pad_warmth})`,
      current_value: minPadValue,
      expected:      `>= ${style_constraints.min_pad_warmth}`,
    });
  }

  // ─── GROOVE AGGRESSION CEILING ───────────────────────────────────────────
  const maxGrooveAgg = Math.max(...curves.groove_aggression.map(p => p.value));
  if (maxGrooveAgg > style_constraints.max_perc_aggression) {
    issues.push({
      code:          "style_groove_too_aggressive",
      severity:      "warning",
      field:         "curves.groove_aggression",
      message:       `Groove aggression peak (${maxGrooveAgg.toFixed(2)}) exceeds max_perc_aggression (${style_constraints.max_perc_aggression})`,
      current_value: maxGrooveAgg,
      expected:      `<= ${style_constraints.max_perc_aggression}`,
    });
  }

  // ─── KEY ZONE COMPLIANCE ─────────────────────────────────────────────────
  if (
    style_constraints.preferred_keys.length > 0 &&
    !style_constraints.preferred_keys.includes(global.key)
  ) {
    issues.push({
      code:          "style_key_outside_preferred_zone",
      severity:      "warning",
      field:         "global.key",
      message:       `Key "${global.key}" is outside preferred zone [${style_constraints.preferred_keys.join(", ")}]`,
      current_value: global.key,
      expected:      `one of: ${style_constraints.preferred_keys.join(", ")}`,
    });
  }

  // ─── FORBIDDEN TRAITS IN PRODUCTION DIRECTIVES ───────────────────────────
  for (const trait of style_constraints.forbidden_traits) {
    if (production_directives.mix_priorities.some(p => p.includes(trait))) {
      issues.push({
        code:          "style_forbidden_trait_in_directives",
        severity:      "error",
        field:         "production_directives.mix_priorities",
        message:       `Forbidden trait "${trait}" found in mix_priorities`,
        current_value: trait,
      });
    }
  }

  const errors = issues.filter(i => i.severity === "error");
  return { passed: errors.length === 0, issues };
}
