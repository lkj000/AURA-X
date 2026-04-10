import { CTLv1 } from "@aura-x/ctl";
import { ValidationResult, ValidationIssue } from "./types";

type LineageRule = { source: string; min: number; reason: string };

// ─── SUBGENRE-SPECIFIC MINIMUMS ──────────────────────────────────────────────
const LINEAGE_MINIMUMS: Partial<Record<string, LineageRule[]>> = {
  private_school: [
    { source: "deep_house",          min: 0.50, reason: "Private School identity requires deep house harmonic patience" },
    { source: "jazz",                min: 0.35, reason: "Private School requires jazz harmonic influence" },
    { source: "kwaito",              min: 0.15, reason: "All Amapiano lanes require kwaito groove foundation" },
    { source: "log_drum_innovation", min: 0.45, reason: "Log drum innovation is non-negotiable" },
  ],
  bacardi: [
    { source: "bacardi",             min: 0.60, reason: "Bacardi identity requires dominant bacardi lineage" },
    { source: "kwaito",              min: 0.15, reason: "All Amapiano lanes require kwaito groove foundation" },
    { source: "log_drum_innovation", min: 0.55, reason: "Log drum is the primary Bacardi identity carrier" },
  ],
  sgija: [
    { source: "kwaito",              min: 0.30, reason: "Sgija bounce is kwaito-descended" },
    { source: "log_drum_innovation", min: 0.60, reason: "Log drum defines Sgija bounce identity" },
  ],
  stixx_sgija: [
    { source: "kwaito",              min: 0.25, reason: "Stixx Sgija requires kwaito groove foundation" },
    { source: "log_drum_innovation", min: 0.75, reason: "Stixx Sgija is log drum innovation at maximum" },
  ],
  mbiraiano: [
    { source: "kwaito",              min: 0.15, reason: "All Amapiano lanes require kwaito groove foundation" },
    { source: "log_drum_innovation", min: 0.45, reason: "Log drum innovation non-negotiable" },
  ],
  three_step: [
    { source: "kwaito",              min: 0.15, reason: "All Amapiano lanes require kwaito groove foundation" },
    { source: "log_drum_innovation", min: 0.55, reason: "3-Step identity is carried by the log drum pattern" },
  ],
  gqom_fusion: [
    { source: "kwaito",              min: 0.15, reason: "All Amapiano lanes require kwaito groove foundation" },
    { source: "log_drum_innovation", min: 0.55, reason: "Log drum anchors gqom fusion identity" },
  ],
  hybrid_rnb_amapiano: [
    { source: "deep_house",          min: 0.35, reason: "Hybrid R&B requires deep house harmonic base" },
    { source: "kwaito",              min: 0.15, reason: "All Amapiano lanes require kwaito groove foundation" },
    { source: "log_drum_innovation", min: 0.40, reason: "Log drum must remain center even in R&B crossover" },
  ],
};

// ─── UNIVERSAL MINIMUMS (all subgenres) ──────────────────────────────────────
const UNIVERSAL_MINIMUMS: LineageRule[] = [
  { source: "kwaito",              min: 0.15, reason: "kwaito is foundational to all Amapiano — removing it produces generic house" },
  { source: "log_drum_innovation", min: 0.40, reason: "log drum innovation defines Amapiano vs other genres" },
];

export function validateLineage(ctl: CTLv1): ValidationResult {
  const issues: ValidationIssue[] = [];
  const { subgenre } = ctl.global;
  const lineage = ctl.cultural_lineage as Record<string, { weight: number } | undefined>;

  const getWeight = (source: string): number => lineage[source]?.weight ?? 0;

  // Universal minimums first
  for (const rule of UNIVERSAL_MINIMUMS) {
    const w = getWeight(rule.source);
    if (w < rule.min) {
      issues.push({
        code:          `lineage_${rule.source}_too_low`,
        severity:      "error",
        field:         `cultural_lineage.${rule.source}.weight`,
        message:       rule.reason,
        current_value: w,
        expected:      `>= ${rule.min}`,
      });
    }
  }

  // Subgenre-specific minimums (skip if already reported by universal check)
  for (const rule of LINEAGE_MINIMUMS[subgenre] ?? []) {
    const w = getWeight(rule.source);
    if (w < rule.min) {
      const alreadyReported = issues.some(i => i.code === `lineage_${rule.source}_too_low`);
      if (!alreadyReported) {
        issues.push({
          code:          `lineage_${rule.source}_too_low`,
          severity:      "error",
          field:         `cultural_lineage.${rule.source}.weight`,
          message:       rule.reason,
          current_value: w,
          expected:      `>= ${rule.min}`,
        });
      }
    }
  }

  // Warning: bacardi too high on luxury lanes
  if (subgenre === "private_school" || subgenre === "hybrid_rnb_amapiano") {
    const bw = getWeight("bacardi");
    if (bw > 0.40) {
      issues.push({
        code:          "lineage_bacardi_too_high_for_luxury",
        severity:      "warning",
        field:         "cultural_lineage.bacardi.weight",
        message:       "Bacardi weight above 0.40 will pull Private School toward raw street energy",
        current_value: bw,
        expected:      "<= 0.40",
      });
    }
  }

  const errors = issues.filter(i => i.severity === "error");
  return { passed: errors.length === 0, issues };
}
