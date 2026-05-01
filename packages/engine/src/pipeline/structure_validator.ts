// Song Structure Validator — E-34
// Validates an ArrangementArc against 12 Amapiano structural rules.
//
// Rules evaluated:
//  1  correct_section_count    — exactly 8 sections
//  2  correct_section_order    — intro→build1→drop1→breakdown→build2→drop2→outro→outro_fade
//  3  drop1_high_intensity     — drop1.intensity ≥ 0.90
//  4  drop2_high_intensity     — drop2.intensity ≥ 0.90
//  5  breakdown_low_intensity  — breakdown.intensity < 0.50
//  6  build1_less_than_drop1   — build1.intensity < drop1.intensity
//  7  build2_less_than_drop2   — build2.intensity < drop2.intensity
//  8  intro_less_than_drop1    — intro.intensity < drop1.intensity
//  9  outro_fade_is_last       — last section.name === "outro_fade"
// 10  amapiano_bpm_range       — 100 ≤ bpm ≤ 130
// 11  total_bars_valid         — 16 ≤ totalBars ≤ 512
// 12  drop_bar_in_drop1        — dropBar ∈ [drop1.startBar, drop1.endBar)

import type {
  ArrangementArc, ArrangementSection,
  SectionName, StructureRule, StructureValidation,
} from "../types";

const CANONICAL_ORDER: SectionName[] = [
  "intro", "build1", "drop1", "breakdown", "build2", "drop2", "outro", "outro_fade",
];

// ── Public API ────────────────────────────────────────────────────────────────

export function validateStructure(arc: ArrangementArc): StructureValidation {
  const rules: StructureRule[] = [];

  const rule = (name: string, passes: boolean, message: string): boolean => {
    rules.push({ name, passes, message });
    return passes;
  };

  const { sections, bpm, totalBars, dropBar } = arc;
  const byName = new Map<SectionName, ArrangementSection>(
    sections.map((s) => [s.name as SectionName, s]),
  );
  const get = (n: SectionName) => byName.get(n);

  rule("correct_section_count",
    sections.length === 8,
    `Expected 8 sections, got ${sections.length}`);

  rule("correct_section_order",
    sections.length === CANONICAL_ORDER.length &&
    sections.every((s, i) => s.name === CANONICAL_ORDER[i]),
    `Sections must follow canonical order: ${CANONICAL_ORDER.join("→")}`);

  const drop1 = get("drop1");
  rule("drop1_high_intensity",
    drop1 !== undefined && drop1.intensity >= 0.90,
    `drop1 intensity must be ≥ 0.90 (got ${drop1?.intensity.toFixed(2) ?? "N/A"})`);

  const drop2 = get("drop2");
  rule("drop2_high_intensity",
    drop2 !== undefined && drop2.intensity >= 0.90,
    `drop2 intensity must be ≥ 0.90 (got ${drop2?.intensity.toFixed(2) ?? "N/A"})`);

  const breakdown = get("breakdown");
  rule("breakdown_low_intensity",
    breakdown !== undefined && breakdown.intensity < 0.50,
    `breakdown intensity must be < 0.50 (got ${breakdown?.intensity.toFixed(2) ?? "N/A"})`);

  const build1 = get("build1");
  rule("build1_less_than_drop1",
    build1 !== undefined && drop1 !== undefined && build1.intensity < drop1.intensity,
    `build1 intensity (${build1?.intensity.toFixed(2)}) must be < drop1 (${drop1?.intensity.toFixed(2)})`);

  const build2 = get("build2");
  rule("build2_less_than_drop2",
    build2 !== undefined && drop2 !== undefined && build2.intensity < drop2.intensity,
    `build2 intensity (${build2?.intensity.toFixed(2)}) must be < drop2 (${drop2?.intensity.toFixed(2)})`);

  const intro = get("intro");
  rule("intro_less_than_drop1",
    intro !== undefined && drop1 !== undefined && intro.intensity < drop1.intensity,
    `intro intensity (${intro?.intensity.toFixed(2)}) must be < drop1 (${drop1?.intensity.toFixed(2)})`);

  rule("outro_fade_is_last",
    sections.length > 0 && sections[sections.length - 1].name === "outro_fade",
    "Last section must be 'outro_fade'");

  rule("amapiano_bpm_range",
    bpm >= 100 && bpm <= 130,
    `BPM must be in Amapiano range [100, 130] (got ${bpm})`);

  rule("total_bars_valid",
    totalBars >= 16 && totalBars <= 512,
    `totalBars must be in [16, 512] (got ${totalBars})`);

  rule("drop_bar_in_drop1",
    drop1 !== undefined && dropBar >= drop1.startBar && dropBar < drop1.endBar,
    `dropBar (${dropBar}) must be within drop1 [${drop1?.startBar}, ${drop1?.endBar})`);

  const passCount  = rules.filter((r) => r.passes).length;
  const score      = rules.length > 0 ? passCount / rules.length : 0;
  const passes     = passCount === rules.length;
  const violations = rules.filter((r) => !r.passes).map((r) => r.message);

  return { passes, score, rules, violations };
}
