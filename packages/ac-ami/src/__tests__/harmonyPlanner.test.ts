import { planHarmony, applyHarmonyPlan, planHarmonyWithVoicings } from "../harmony/harmonyPlanner";
import {
  privateSchoolPreset,
  bacardiPreset,
  sgijaPreset,
  gqomFusionPreset,
  hybridRnbPreset,
  mbiraianoPreset,
  ALL_PRESETS,
} from "@aura-x/ctl";

describe("Harmony Planner", () => {

  // ─── Key selection ────────────────────────────────────────────────────────

  it("1. Private School: tonal_center is one of F#/C#/E/B/Ab", () => {
    const plan = planHarmony(privateSchoolPreset);
    expect(["F#", "C#", "E", "B", "Ab"]).toContain(plan.tonal_center);
  });

  it("2. Bacardi: tonal_center is one of G/A/D/C", () => {
    const plan = planHarmony(bacardiPreset);
    expect(["G", "A", "D", "C"]).toContain(plan.tonal_center);
  });

  it("3. forceKey option overrides preset key selection", () => {
    const plan = planHarmony(privateSchoolPreset, { forceKey: "Dm" });
    expect(plan.tonal_center).toBe("D");
  });

  it("4. tonal_center never contains trailing 'm'", () => {
    for (const preset of ALL_PRESETS) {
      const plan = planHarmony(preset);
      expect(plan.tonal_center).not.toMatch(/m$/);
    }
  });

  // ─── Chord density ────────────────────────────────────────────────────────

  it("5. Private School: max_chord_changes_per_4_bars <= 4", () => {
    const plan = planHarmony(privateSchoolPreset);
    expect(plan.max_chord_changes_per_4_bars).toBeLessThanOrEqual(4);
  });

  it("6. Bacardi: max_chord_changes_per_4_bars <= 2", () => {
    const plan = planHarmony(bacardiPreset);
    expect(plan.max_chord_changes_per_4_bars).toBeLessThanOrEqual(2);
  });

  it("7. Gqom Fusion: max_chord_changes_per_4_bars <= 2", () => {
    const plan = planHarmony(gqomFusionPreset);
    expect(plan.max_chord_changes_per_4_bars).toBeLessThanOrEqual(2);
  });

  it("8. Hybrid R&B: max_chord_changes_per_4_bars >= 4", () => {
    const plan = planHarmony(hybridRnbPreset);
    expect(plan.max_chord_changes_per_4_bars).toBeGreaterThanOrEqual(4);
  });

  // ─── Extension policy ─────────────────────────────────────────────────────

  it("9. Bacardi: extension_policy is 'none' (raw lane — no harmonic richness)", () => {
    const plan = planHarmony(bacardiPreset);
    expect(plan.extension_policy).toBe("none");
  });

  it("10. Private School: extension_policy is 'full_extensions'", () => {
    const plan = planHarmony(privateSchoolPreset);
    expect(plan.extension_policy).toBe("full_extensions");
  });

  it("11. High jazz weight + high richness forces full_extensions on sgija base", () => {
    // Manually craft a CTL with high jazz but sgija base (normally sevenths_only)
    const highJazzSgija = {
      ...sgijaPreset,
      cultural_lineage: {
        ...sgijaPreset.cultural_lineage,
        jazz: { weight: 0.72, influences: ["chord_richness"], must_not: [] },
      },
    };
    const plan = planHarmony(highJazzSgija, { harmonicRichness: 0.8 });
    expect(plan.extension_policy).toBe("full_extensions");
  });

  it("12. High bacardi weight strips extensions to 'none' even with moderate jazz", () => {
    const heavyBacardiSgija = {
      ...sgijaPreset,
      cultural_lineage: {
        ...sgijaPreset.cultural_lineage,
        bacardi: { weight: 0.72, influences: ["raw_bounce"], must_not: [] },
        jazz:    { weight: 0.35, influences: ["chord_color"], must_not: [] },
      },
    };
    const plan = planHarmony(heavyBacardiSgija);
    expect(plan.extension_policy).toBe("none");
  });

  // ─── Harmonic rhythm ──────────────────────────────────────────────────────

  it("13. Bacardi: harmonic_rhythm is 'static'", () => {
    const plan = planHarmony(bacardiPreset);
    expect(plan.harmonic_rhythm).toBe("static");
  });

  it("14. Gqom Fusion: harmonic_rhythm is 'static'", () => {
    const plan = planHarmony(gqomFusionPreset);
    expect(plan.harmonic_rhythm).toBe("static");
  });

  it("15. Private School: harmonic_rhythm is 'slow'", () => {
    const plan = planHarmony(privateSchoolPreset);
    expect(plan.harmonic_rhythm).toBe("slow");
  });

  it("16. High deep_house weight on medium-rhythm subgenre pulls rhythm to 'slow'", () => {
    // Hybrid R&B is base "medium" — push deep_house high to trigger the modifier
    const deepHouseHeavyRnb = {
      ...hybridRnbPreset,
      cultural_lineage: {
        ...hybridRnbPreset.cultural_lineage,
        deep_house: { weight: 0.78, influences: ["harmonic_pacing"], must_not: [] },
      },
    };
    const plan = planHarmony(deepHouseHeavyRnb);
    expect(plan.harmonic_rhythm).toBe("slow");
  });

  // ─── Mode ─────────────────────────────────────────────────────────────────

  it("17. Mbiraiano: mode is 'dorian'", () => {
    const plan = planHarmony(mbiraianoPreset);
    expect(plan.mode).toBe("dorian");
  });

  it("18. All non-Mbiraiano presets produce mode 'aeolian'", () => {
    const nonMbira = ALL_PRESETS.filter(p => p.global.subgenre !== "mbiraiano");
    for (const preset of nonMbira) {
      const plan = planHarmony(preset);
      expect(plan.mode).toBe("aeolian");
    }
  });

});

describe("planHarmonyWithVoicings", () => {

  it("19. Returns all HarmonyPlan fields alongside voicings + inversions", () => {
    const result = planHarmonyWithVoicings(privateSchoolPreset);
    expect(result).toHaveProperty("tonal_center");
    expect(result).toHaveProperty("mode");
    expect(result).toHaveProperty("preferred_progressions");
    expect(result).toHaveProperty("voicings");
    expect(result).toHaveProperty("inversions");
  });

  it("20. voicings.lane matches the CTL subgenre", () => {
    const result = planHarmonyWithVoicings(privateSchoolPreset);
    expect(result.voicings.lane).toBe("private_school");
  });

  it("21. voicings contains 4 chord voicings", () => {
    const result = planHarmonyWithVoicings(privateSchoolPreset);
    expect(result.voicings.voicings).toHaveLength(4);
  });

  it("22. Each voicing has rootMidi, notes, chordSymbol, function, tension", () => {
    const result = planHarmonyWithVoicings(privateSchoolPreset);
    for (const v of result.voicings.voicings) {
      expect(typeof v.rootMidi).toBe("number");
      expect(Array.isArray(v.notes)).toBe(true);
      expect(v.notes.length).toBeGreaterThanOrEqual(2);
      expect(typeof v.chordSymbol).toBe("string");
      expect(typeof v.function).toBe("string");
      expect(typeof v.tension).toBe("number");
    }
  });

  it("23. inversions array length equals number of voicings (one InversionSet per chord)", () => {
    const result = planHarmonyWithVoicings(privateSchoolPreset);
    expect(result.inversions).toHaveLength(result.voicings.voicings.length);
  });

  it("24. Each InversionSet has original notes and at least root inversion", () => {
    const result = planHarmonyWithVoicings(privateSchoolPreset);
    for (const invSet of result.inversions) {
      expect(Array.isArray(invSet.original)).toBe(true);
      expect(invSet.inversions.length).toBeGreaterThanOrEqual(1);
      expect(invSet.inversions[0].type).toBe("root");
    }
  });

  it("25. All MIDI notes in voicings clamped to [0, 127]", () => {
    for (const preset of ALL_PRESETS) {
      const result = planHarmonyWithVoicings(preset);
      for (const v of result.voicings.voicings) {
        for (const note of v.notes) {
          expect(note).toBeGreaterThanOrEqual(0);
          expect(note).toBeLessThanOrEqual(127);
        }
      }
    }
  });

  it("26. Works for all 8 presets without throwing", () => {
    for (const preset of ALL_PRESETS) {
      expect(() => planHarmonyWithVoicings(preset)).not.toThrow();
    }
  });

  it("27. voicings.amapianoStyle is true", () => {
    const result = planHarmonyWithVoicings(bacardiPreset);
    expect(result.voicings.amapianoStyle).toBe(true);
  });

  it("28. forceKey option is honoured — tonal_center still overridden", () => {
    const result = planHarmonyWithVoicings(privateSchoolPreset, { forceKey: "Gm" });
    expect(result.tonal_center).toBe("G");
    expect(result.voicings.lane).toBe("private_school");
  });

});
