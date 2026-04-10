import {
  validateLineage,
  validateStyle,
  validateInstrumentation,
  validateHarmony,
  validateAll,
} from "../validators";
import {
  privateSchoolPreset,
  bacardiPreset,
  stixxSgijaPreset,
  CTLv1Schema,
} from "@aura-x/ctl";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function withLineage(preset: typeof privateSchoolPreset, overrides: Record<string, number>) {
  const lineage = { ...preset.cultural_lineage };
  for (const [key, weight] of Object.entries(overrides)) {
    (lineage as Record<string, { weight: number; influences: string[]; must_not: string[] }>)[key] = {
      weight,
      influences: [],
      must_not:   [],
    };
  }
  return { ...preset, cultural_lineage: lineage };
}

function withCurves(preset: typeof privateSchoolPreset, overrides: Partial<typeof privateSchoolPreset["curves"]>) {
  return { ...preset, curves: { ...preset.curves, ...overrides } };
}

function withHarmony(preset: typeof privateSchoolPreset, overrides: Partial<typeof privateSchoolPreset["harmony"]>) {
  return { ...preset, harmony: { ...preset.harmony, ...overrides } };
}

describe("Validators", () => {

  // ─── Lineage validator — passing ──────────────────────────────────────────

  it("1. privateSchoolPreset passes validateLineage", () => {
    const result = validateLineage(privateSchoolPreset);
    expect(result.passed).toBe(true);
    expect(result.issues.filter(i => i.severity === "error")).toHaveLength(0);
  });

  it("2. bacardiPreset passes validateLineage", () => {
    const result = validateLineage(bacardiPreset);
    expect(result.passed).toBe(true);
  });

  it("3. stixxSgijaPreset passes validateLineage", () => {
    const result = validateLineage(stixxSgijaPreset);
    expect(result.passed).toBe(true);
  });

  // ─── Lineage validator — failures ─────────────────────────────────────────

  it("4. kwaito.weight = 0.05 fails with code 'lineage_kwaito_too_low'", () => {
    const ctl = withLineage(privateSchoolPreset, { kwaito: 0.05 });
    const result = validateLineage(ctl);
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === "lineage_kwaito_too_low")).toBe(true);
  });

  it("5. log_drum_innovation.weight = 0.20 fails with code 'lineage_log_drum_innovation_too_low'", () => {
    const ctl = withLineage(privateSchoolPreset, { log_drum_innovation: 0.20 });
    const result = validateLineage(ctl);
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === "lineage_log_drum_innovation_too_low")).toBe(true);
  });

  it("6. Private School with deep_house.weight = 0.30 fails (below 0.50 minimum)", () => {
    const ctl = withLineage(privateSchoolPreset, { deep_house: 0.30 });
    const result = validateLineage(ctl);
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === "lineage_deep_house_too_low")).toBe(true);
  });

  it("7. Private School with bacardi.weight = 0.55 produces warning 'lineage_bacardi_too_high_for_luxury'", () => {
    const ctl = withLineage(privateSchoolPreset, { bacardi: 0.55 });
    const result = validateLineage(ctl);
    expect(result.issues.some(i => i.code === "lineage_bacardi_too_high_for_luxury" && i.severity === "warning")).toBe(true);
  });

  // ─── Style validator ──────────────────────────────────────────────────────

  it("8. Default preset with valid curves passes validateStyle", () => {
    const result = validateStyle(privateSchoolPreset);
    expect(result.passed).toBe(true);
  });

  it("9. Piano activity peak 0.9 on max_piano_busyness 0.4 fails with 'style_piano_too_busy'", () => {
    const ctl = withCurves(privateSchoolPreset, {
      piano_activity: [{ bar: 0, value: 0.9 }],
    });
    const result = validateStyle(ctl);
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === "style_piano_too_busy")).toBe(true);
  });

  it("10. Pad warmth floor 0.1 on min_pad_warmth 0.6 produces warning 'style_pad_too_cold'", () => {
    const ctl = withCurves(privateSchoolPreset, {
      pad_warmth: [{ bar: 0, value: 0.8 }, { bar: 40, value: 0.1 }],
    });
    const result = validateStyle(ctl);
    expect(result.issues.some(i => i.code === "style_pad_too_cold" && i.severity === "warning")).toBe(true);
  });

  it("11. Key 'Hm' not in preferred_keys produces warning 'style_key_outside_preferred_zone'", () => {
    const ctl = { ...privateSchoolPreset, global: { ...privateSchoolPreset.global, key: "Hm" } };
    const result = validateStyle(ctl);
    expect(result.issues.some(i => i.code === "style_key_outside_preferred_zone" && i.severity === "warning")).toBe(true);
  });

  // ─── Instrumentation validator ────────────────────────────────────────────

  it("12. Default preset passes validateInstrumentation", () => {
    const result = validateInstrumentation(privateSchoolPreset);
    expect(result.passed).toBe(true);
  });

  it("13. CTL with no log_drum fails with 'inst_no_log_drum'", () => {
    const ctl = { ...privateSchoolPreset, instrumentation: privateSchoolPreset.instrumentation.filter(i => i.family !== "log_drum") };
    const result = validateInstrumentation(ctl);
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === "inst_no_log_drum")).toBe(true);
  });

  it("14. Log drum with stereo_profile 'wide' fails with 'inst_log_drum_not_mono'", () => {
    const ctl = {
      ...privateSchoolPreset,
      instrumentation: privateSchoolPreset.instrumentation.map(i =>
        i.family === "log_drum" ? { ...i, stereo_profile: "wide" as const } : i
      ),
    };
    const result = validateInstrumentation(ctl);
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === "inst_log_drum_not_mono")).toBe(true);
  });

  it("15. Mbira with patch_class 'generic_pluck' fails with 'inst_mbira_wrong_patch'", () => {
    const mbiraInst = {
      family:          "mbira" as const,
      patch_class:     "generic_pluck",
      timbre_class:    "pluck",
      cultural_role:   "identity",
      register:        "mid",
      stereo_profile:  "mid_wide" as const,
      body_weight:     0.6,
      attack:          "fast" as const,
      decay:           "medium" as const,
      forbidden_traits: [],
    };
    const ctl = { ...privateSchoolPreset, instrumentation: [...privateSchoolPreset.instrumentation, mbiraInst] };
    const result = validateInstrumentation(ctl);
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === "inst_mbira_wrong_patch")).toBe(true);
  });

  // ─── Harmony validator ────────────────────────────────────────────────────

  it("16. privateSchoolPreset passes validateHarmony", () => {
    const result = validateHarmony(privateSchoolPreset);
    expect(result.passed).toBe(true);
  });

  it("17. bacardiPreset passes validateHarmony", () => {
    const result = validateHarmony(bacardiPreset);
    expect(result.passed).toBe(true);
  });

  it("18. Bacardi with max_chord_changes = 5 fails with 'harmony_too_many_chord_changes'", () => {
    const ctl = withHarmony(bacardiPreset, { max_chord_changes_per_4_bars: 5 });
    const result = validateHarmony(ctl);
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === "harmony_too_many_chord_changes")).toBe(true);
  });

  it("19. Bacardi with extension_policy 'full_extensions' produces warning 'harmony_extensions_too_rich_for_raw_lane'", () => {
    const ctl = withHarmony(bacardiPreset, { extension_policy: "full_extensions" });
    const result = validateHarmony(ctl);
    expect(result.issues.some(i => i.code === "harmony_extensions_too_rich_for_raw_lane" && i.severity === "warning")).toBe(true);
  });

  it("20. Bacardi with voicing_style 'dense' produces warning 'harmony_voicing_too_dense'", () => {
    const ctl = withHarmony(bacardiPreset, { voicing_style: "dense" });
    const result = validateHarmony(ctl);
    expect(result.issues.some(i => i.code === "harmony_voicing_too_dense" && i.severity === "warning")).toBe(true);
  });

  // ─── Master validator ──────────────────────────────────────────────────────

  it("21. validateAll on privateSchoolPreset returns passed: true", () => {
    const result = validateAll(privateSchoolPreset);
    expect(result.passed).toBe(true);
  });

  it("22. validateAll on broken CTL (kwaito 0.05, no log drum) returns passed: false with multiple issues", () => {
    const brokenLineage = withLineage(privateSchoolPreset, { kwaito: 0.05, log_drum_innovation: 0.10 });
    const ctl = {
      ...brokenLineage,
      instrumentation: brokenLineage.instrumentation.filter(i => i.family !== "log_drum"),
    };
    const result = validateAll(ctl);
    expect(result.passed).toBe(false);
    expect(result.issues.filter(i => i.severity === "error").length).toBeGreaterThanOrEqual(3);
  });

});
