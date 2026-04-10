import {
  privateSchoolPreset,
  bacardiPreset,
  sgijaPreset,
  stixxSgijaPreset,
  mbiraianoPreset,
  threeStepPreset,
  gqomFusionPreset,
  hybridRnbPreset,
} from "@aura-x/ctl";
import { CTLv1 } from "@aura-x/ctl";

import { applyHarmonyPlan }        from "../harmony/harmonyPlanner";
import { applyGroovePlan }          from "../groove/groovePlanner";
import { applyInstrumentationPlan } from "../instrumentation/instrumentationPlanner";
import { validateAll }              from "../validators";
import { repairCTL }                from "../mutation/mutationEngine";
import { exportForSuno }            from "@aura-x/suno-exporter";

// ─── Helper: run full Phase 02 pipeline on a preset ──────────────────────────

function runFullPipeline(preset: CTLv1) {
  let ctl = applyHarmonyPlan(preset);
  ctl = applyGroovePlan(ctl);
  ctl = applyInstrumentationPlan(ctl);

  const validationBefore = validateAll(ctl);
  const { ctl: repaired, passed, log } = repairCTL(ctl, 3);
  const validationAfter = validateAll(repaired);
  const bundle = exportForSuno(repaired);

  return { ctl: repaired, validationBefore, validationAfter, repairLog: log, passed, bundle };
}

// ─── Preset registry ─────────────────────────────────────────────────────────

const presets: { name: string; preset: CTLv1 }[] = [
  { name: "Private School", preset: privateSchoolPreset },
  { name: "Bacardi",        preset: bacardiPreset        },
  { name: "Sgija",          preset: sgijaPreset          },
  { name: "Stixx Sgija",    preset: stixxSgijaPreset     },
  { name: "Mbiraiano",      preset: mbiraianoPreset      },
  { name: "Three-Step",     preset: threeStepPreset      },
  { name: "Gqom Fusion",    preset: gqomFusionPreset     },
  { name: "Hybrid R&B",     preset: hybridRnbPreset      },
];

// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 02 — AC-AMI Full Pipeline Integration", () => {

  // ─── 1. ALL PRESETS PASS VALIDATION AFTER FULL PIPELINE ──────────────────

  for (const { name, preset } of presets) {
    it(`${name}: full pipeline produces a passing CTL`, () => {
      const result = runFullPipeline(preset);
      const errors = result.validationAfter.issues.filter(i => i.severity === "error");
      expect(errors).toHaveLength(0);
    });
  }

  // ─── 2. LOG DRUM INVARIANTS SURVIVE THE PIPELINE ─────────────────────────

  it("log drum is always first instrument after instrumentation planner", () => {
    for (const { preset } of presets) {
      let ctl = applyHarmonyPlan(preset);
      ctl = applyGroovePlan(ctl);
      ctl = applyInstrumentationPlan(ctl);
      expect(ctl.instrumentation[0].family).toBe("log_drum");
    }
  });

  it("log drum is always mono_centered after instrumentation planner", () => {
    for (const { preset } of presets) {
      let ctl = applyHarmonyPlan(preset);
      ctl = applyGroovePlan(ctl);
      ctl = applyInstrumentationPlan(ctl);
      const log = ctl.instrumentation.find(i => i.family === "log_drum");
      expect(log?.stereo_profile).toBe("mono_centered");
    }
  });

  // ─── 3. MODE 1 SUNO EXPORT WORKS ON ALL PRESETS ──────────────────────────

  it("all presets produce non-empty style_prompt after full pipeline", () => {
    for (const { preset } of presets) {
      const result = runFullPipeline(preset);
      expect(result.bundle.style_prompt.length).toBeGreaterThan(50);
    }
  });

  it("no style_prompt contains raw numeric weights (0.XX pattern)", () => {
    const weightPattern = /\b0\.\d{2}\b/;
    for (const { preset } of presets) {
      const result = runFullPipeline(preset);
      expect(result.bundle.style_prompt).not.toMatch(weightPattern);
    }
  });

  // ─── 4. GROOVE PATTERNS SURVIVE THE PIPELINE ─────────────────────────────

  it("all presets have at least 1 groove pattern after groove planner", () => {
    for (const { preset } of presets) {
      let ctl = applyHarmonyPlan(preset);
      ctl = applyGroovePlan(ctl);
      expect(ctl.groove_patterns.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("all groove patterns have exactly 16 steps after groove planner", () => {
    for (const { preset } of presets) {
      let ctl = applyHarmonyPlan(preset);
      ctl = applyGroovePlan(ctl);
      for (const p of ctl.groove_patterns) {
        expect(p.steps.length).toBe(16);
      }
    }
  });

  // ─── 5. CULTURAL LINEAGE COHERENCE ───────────────────────────────────────

  it("kwaito lineage >= 0.15 on all presets after pipeline", () => {
    for (const { preset } of presets) {
      const result = runFullPipeline(preset);
      const kw = result.ctl.cultural_lineage.kwaito?.weight ?? 0;
      expect(kw).toBeGreaterThanOrEqual(0.15);
    }
  });

  it("log_drum_innovation lineage >= 0.40 on all presets after pipeline", () => {
    for (const { preset } of presets) {
      const result = runFullPipeline(preset);
      const ldi = result.ctl.cultural_lineage.log_drum_innovation?.weight ?? 0;
      expect(ldi).toBeGreaterThanOrEqual(0.40);
    }
  });

});
