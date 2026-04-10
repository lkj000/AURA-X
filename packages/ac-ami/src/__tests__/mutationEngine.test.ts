import {
  applyMutation,
  applyMutations,
  recommendMutations,
  repairCTL,
} from "../mutation/mutationEngine";
import { privateSchoolPreset, bacardiPreset } from "@aura-x/ctl";
import { CTLv1 } from "@aura-x/ctl";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function withPianoCurve(preset: CTLv1, peak: number): CTLv1 {
  return {
    ...preset,
    curves: {
      ...preset.curves,
      piano_activity: [{ bar: 0, value: peak }],
    },
    style_constraints: {
      ...preset.style_constraints,
      max_piano_busyness: 0.40,
    },
  };
}

function withPadWarmth(preset: CTLv1, floor: number): CTLv1 {
  return {
    ...preset,
    curves: {
      ...preset.curves,
      pad_warmth: [
        { bar: 0, value: 0.80 },
        { bar: 40, value: floor },
      ],
    },
  };
}

function withDarkPad(preset: CTLv1): CTLv1 {
  return {
    ...preset,
    instrumentation: preset.instrumentation.map(i =>
      i.family === "pads"
        ? { ...i, patch_class: "dark_haze_pad" }
        : i
    ),
  };
}

describe("Mutation Engine", () => {

  // ─── reduce_piano_busyness ─────────────────────────────────────────────────

  it("1. reduce_piano_busyness lowers piano_activity curve peak", () => {
    const ctl = withPianoCurve(privateSchoolPreset, 0.80);
    const result = applyMutation(ctl, "reduce_piano_busyness");
    const peak = Math.max(...result.ctl.curves.piano_activity.map(p => p.value));
    expect(peak).toBeLessThan(0.80);
  });

  it("2. reduce_piano_busyness scales all curve values by 0.75", () => {
    const ctl = withPianoCurve(privateSchoolPreset, 0.80);
    const result = applyMutation(ctl, "reduce_piano_busyness");
    const expected = parseFloat((0.80 * 0.75).toFixed(3));
    expect(result.ctl.curves.piano_activity[0].value).toBeCloseTo(expected, 3);
  });

  // ─── increase_pad_warmth ──────────────────────────────────────────────────

  it("3. increase_pad_warmth raises pad_warmth curve floor", () => {
    const ctl = withPadWarmth(privateSchoolPreset, 0.10);
    const result = applyMutation(ctl, "increase_pad_warmth");
    const floor = Math.min(...result.ctl.curves.pad_warmth.map(p => p.value));
    expect(floor).toBeGreaterThanOrEqual(0.62);
  });

  it("4. increase_pad_warmth upgrades dark_haze_pad to luxury_noir_pad", () => {
    const ctl = withDarkPad(privateSchoolPreset);
    const result = applyMutation(ctl, "increase_pad_warmth");
    const pads = result.ctl.instrumentation.find(i => i.family === "pads");
    expect(pads?.patch_class).toBe("luxury_noir_pad");
  });

  // ─── reduce_harmonic_richness ─────────────────────────────────────────────

  it("5. reduce_harmonic_richness reduces max_chord_changes by 1", () => {
    const original = bacardiPreset.harmony.max_chord_changes_per_4_bars;
    const result = applyMutation(bacardiPreset, "reduce_harmonic_richness");
    expect(result.ctl.harmony.max_chord_changes_per_4_bars).toBe(Math.max(1, original - 1));
  });

  it("6. reduce_harmonic_richness downgrades full_extensions to sevenths_only", () => {
    const ctl: CTLv1 = {
      ...privateSchoolPreset,
      harmony: { ...privateSchoolPreset.harmony, extension_policy: "full_extensions" },
    };
    const result = applyMutation(ctl, "reduce_harmonic_richness");
    expect(result.ctl.harmony.extension_policy).toBe("sevenths_only");
  });

  // ─── strengthen_log_innovation ────────────────────────────────────────────

  it("7. strengthen_log_innovation increases log_drum_innovation weight", () => {
    const original = privateSchoolPreset.cultural_lineage.log_drum_innovation!.weight;
    const result = applyMutation(privateSchoolPreset, "strengthen_log_innovation");
    expect(result.ctl.cultural_lineage.log_drum_innovation!.weight).toBeGreaterThan(original);
  });

  it("8. strengthen_log_innovation increases log drum body_weight", () => {
    const logDrum = privateSchoolPreset.instrumentation.find(i => i.family === "log_drum")!;
    const result = applyMutation(privateSchoolPreset, "strengthen_log_innovation");
    const mutated = result.ctl.instrumentation.find(i => i.family === "log_drum")!;
    expect(mutated.body_weight).toBeGreaterThan(logDrum.body_weight);
  });

  // ─── reduce_deep_house_weight ─────────────────────────────────────────────

  it("9. reduce_deep_house_weight decreases deep_house weight by 0.15", () => {
    const original = privateSchoolPreset.cultural_lineage.deep_house!.weight;
    const result = applyMutation(privateSchoolPreset, "reduce_deep_house_weight");
    const expected = parseFloat(Math.max(0.15, original - 0.15).toFixed(3));
    expect(result.ctl.cultural_lineage.deep_house!.weight).toBeCloseTo(expected, 3);
  });

  // ─── increase_kwaito_spacing ──────────────────────────────────────────────

  it("10. increase_kwaito_spacing increases kwaito weight", () => {
    const original = privateSchoolPreset.cultural_lineage.kwaito!.weight;
    const result = applyMutation(privateSchoolPreset, "increase_kwaito_spacing");
    expect(result.ctl.cultural_lineage.kwaito!.weight).toBeGreaterThan(original);
  });

  // ─── make_log_patch_rawer ─────────────────────────────────────────────────

  it("11. make_log_patch_rawer changes log drum patch_class to a raw variant", () => {
    // privateSchoolPreset has "private_school_soft_log" — mutation maps to "bacardi_raw_log"
    const original = privateSchoolPreset.instrumentation.find(i => i.family === "log_drum")!.patch_class;
    const result = applyMutation(privateSchoolPreset, "make_log_patch_rawer");
    const mutated = result.ctl.instrumentation.find(i => i.family === "log_drum")!;
    expect(mutated.patch_class).not.toBe(original);
    expect(["bacardi_raw_log", "sgija_bounce_log", "deep_stixx_log"]).toContain(mutated.patch_class);
  });

  // ─── simplify_pads ────────────────────────────────────────────────────────

  it("12. simplify_pads reduces pad body_weight", () => {
    const original = privateSchoolPreset.instrumentation.find(i => i.family === "pads")!.body_weight;
    const result = applyMutation(privateSchoolPreset, "simplify_pads");
    const mutated = result.ctl.instrumentation.find(i => i.family === "pads")!;
    expect(mutated.body_weight).toBeLessThan(original);
  });

  // ─── increase_bounce ─────────────────────────────────────────────────────

  it("13. increase_bounce increases groove_aggression curve values", () => {
    const originalPeak = Math.max(...privateSchoolPreset.curves.groove_aggression.map(p => p.value));
    const result = applyMutation(privateSchoolPreset, "increase_bounce");
    const newPeak = Math.max(...result.ctl.curves.groove_aggression.map(p => p.value));
    expect(newPeak).toBeGreaterThan(originalPeak);
  });

  // ─── Immutability ─────────────────────────────────────────────────────────

  it("14. applyMutation does not modify the original CTL object", () => {
    const original = privateSchoolPreset;
    const originalPeak = Math.max(...original.curves.piano_activity.map(p => p.value));
    applyMutation(original, "reduce_piano_busyness");
    const peakAfter = Math.max(...original.curves.piano_activity.map(p => p.value));
    expect(peakAfter).toBe(originalPeak);
  });

  // ─── recommendMutations ───────────────────────────────────────────────────

  it("15. 'style_piano_too_busy' issue recommends 'reduce_piano_busyness'", () => {
    const issues = [{ code: "style_piano_too_busy", severity: "error" as const, field: "curves.piano_activity", message: "too busy" }];
    const mutations = recommendMutations(issues);
    expect(mutations).toContain("reduce_piano_busyness");
  });

  it("16. 'lineage_kwaito_too_low' issue recommends 'increase_kwaito_spacing'", () => {
    const issues = [{ code: "lineage_kwaito_too_low", severity: "error" as const, field: "cultural_lineage.kwaito", message: "too low" }];
    const mutations = recommendMutations(issues);
    expect(mutations).toContain("increase_kwaito_spacing");
  });

  // ─── repairCTL ────────────────────────────────────────────────────────────

  it("17. repairCTL fixes CTL where piano peak 0.50 exceeds max_piano_busyness 0.40", () => {
    // Peak 0.50, max 0.40 — after one iteration: 0.50*0.75=0.375 < 0.40 → passes
    const broken = withPianoCurve(privateSchoolPreset, 0.50);
    const peakBefore = Math.max(...broken.curves.piano_activity.map(p => p.value));
    expect(peakBefore).toBeGreaterThan(broken.style_constraints.max_piano_busyness);
    const { passed } = repairCTL(broken);
    expect(passed).toBe(true);
  });

  it("18. repairCTL returns iteration count >= 1 when repairs are needed", () => {
    const broken = withPianoCurve(privateSchoolPreset, 0.50);
    const { iterations } = repairCTL(broken);
    expect(iterations).toBeGreaterThanOrEqual(1);
  });

});
