import { planInstrumentation } from "../instrumentation/instrumentationPlanner";
import {
  privateSchoolPreset,
  bacardiPreset,
  sgijaPreset,
  stixxSgijaPreset,
  gqomFusionPreset,
  mbiraianoPreset,
} from "@aura-x/ctl";

describe("Instrumentation Planner", () => {

  // ─── Log drum — always first, always mono ─────────────────────────────────

  it("1. First instrument is always log_drum family", () => {
    const presets = [privateSchoolPreset, bacardiPreset, sgijaPreset, stixxSgijaPreset, gqomFusionPreset];
    for (const preset of presets) {
      const instruments = planInstrumentation(preset);
      expect(instruments[0].family).toBe("log_drum");
    }
  });

  it("2. Log drum stereo_profile is always 'mono_centered'", () => {
    const presets = [privateSchoolPreset, bacardiPreset, sgijaPreset, stixxSgijaPreset, gqomFusionPreset];
    for (const preset of presets) {
      const instruments = planInstrumentation(preset);
      const logDrum = instruments.find(i => i.family === "log_drum")!;
      expect(logDrum.stereo_profile).toBe("mono_centered");
    }
  });

  it("3. Private School log patch is 'private_school_soft_log'", () => {
    const instruments = planInstrumentation(privateSchoolPreset);
    expect(instruments[0].patch_class).toBe("private_school_soft_log");
  });

  it("4. Bacardi log patch is 'bacardi_raw_log'", () => {
    const instruments = planInstrumentation(bacardiPreset);
    expect(instruments[0].patch_class).toBe("bacardi_raw_log");
  });

  it("5. Stixx Sgija log patch is 'deep_stixx_log'", () => {
    const instruments = planInstrumentation(stixxSgijaPreset);
    expect(instruments[0].patch_class).toBe("deep_stixx_log");
  });

  it("6. Gqom Fusion log patch is 'gqom_fusion_log'", () => {
    const instruments = planInstrumentation(gqomFusionPreset);
    expect(instruments[0].patch_class).toBe("gqom_fusion_log");
  });

  it("7. High rawness (0.8) increases log body_weight vs default (0.5)", () => {
    const defaultWeight = planInstrumentation(privateSchoolPreset, { rawness: 0.5 })[0].body_weight;
    const highRawness   = planInstrumentation(privateSchoolPreset, { rawness: 0.8 })[0].body_weight;
    expect(highRawness).toBeGreaterThan(defaultWeight);
  });

  it("8. Bacardi lineage >= 0.6 forces 'bacardi_raw_log' on Private School preset", () => {
    const heavyBacardiPS = {
      ...privateSchoolPreset,
      cultural_lineage: {
        ...privateSchoolPreset.cultural_lineage,
        bacardi: { weight: 0.65, influences: ["raw_energy"], must_not: [] },
      },
    };
    const instruments = planInstrumentation(heavyBacardiPS);
    expect(instruments[0].patch_class).toBe("bacardi_raw_log");
  });

  // ─── Keyboard ─────────────────────────────────────────────────────────────

  it("9. Private School keyboard is Rhodes family", () => {
    const instruments = planInstrumentation(privateSchoolPreset);
    const kb = instruments.find(i => i.family === "rhodes" || i.family === "piano")!;
    expect(kb.family).toBe("rhodes");
  });

  it("10. Bacardi keyboard is piano family", () => {
    const instruments = planInstrumentation(bacardiPreset);
    const kb = instruments.find(i => i.family === "rhodes" || i.family === "piano")!;
    expect(kb.family).toBe("piano");
  });

  it("11. High jazz weight (0.6) + high warmth (0.7) upgrades Sgija piano to Rhodes", () => {
    const highJazzSgija = {
      ...sgijaPreset,
      cultural_lineage: {
        ...sgijaPreset.cultural_lineage,
        jazz: { weight: 0.62, influences: ["chord_richness"], must_not: [] },
      },
    };
    const instruments = planInstrumentation(highJazzSgija, { warmth: 0.72 });
    const kb = instruments.find(i => i.family === "rhodes" || i.family === "piano")!;
    expect(kb.family).toBe("rhodes");
    expect(kb.patch_class).toBe("warm_rhodes_luxury");
  });

  it("12. Lounge weight >= 0.4 replaces raw_street_piano with soft_detuned_ep", () => {
    const loungeGqom = {
      ...gqomFusionPreset,
      cultural_lineage: {
        ...gqomFusionPreset.cultural_lineage,
        lounge: { weight: 0.45, influences: ["sophistication"], must_not: [] },
      },
    };
    const instruments = planInstrumentation(loungeGqom);
    const kb = instruments.find(i => i.family === "rhodes" || i.family === "piano")!;
    expect(kb.patch_class).toBe("soft_detuned_ep");
  });

  // ─── Pads ─────────────────────────────────────────────────────────────────

  it("13. Private School pad is 'luxury_noir_pad'", () => {
    const instruments = planInstrumentation(privateSchoolPreset);
    const pad = instruments.find(i => i.family === "pads")!;
    expect(pad.patch_class).toBe("luxury_noir_pad");
  });

  it("14. Bacardi pad is 'dark_haze_pad'", () => {
    const instruments = planInstrumentation(bacardiPreset);
    const pad = instruments.find(i => i.family === "pads")!;
    expect(pad.patch_class).toBe("dark_haze_pad");
  });

  it("15. High warmth (0.8) forces 'luxury_noir_pad' on Bacardi", () => {
    const instruments = planInstrumentation(bacardiPreset, { warmth: 0.80 });
    const pad = instruments.find(i => i.family === "pads")!;
    expect(pad.patch_class).toBe("luxury_noir_pad");
  });

  // ─── Mbira + special instruments ──────────────────────────────────────────

  it("16. Mbiraiano includes mbira family instrument", () => {
    const instruments = planInstrumentation(mbiraianoPreset);
    const mbira = instruments.find(i => i.family === "mbira");
    expect(mbira).toBeDefined();
  });

  it("17. includeMbira: true adds mbira even on Private School", () => {
    const instruments = planInstrumentation(privateSchoolPreset, { includeMbira: true });
    const mbira = instruments.find(i => i.family === "mbira");
    expect(mbira).toBeDefined();
  });

  it("18. vocalMode: 'none' excludes vocals instrument", () => {
    const instruments = planInstrumentation(privateSchoolPreset, { vocalMode: "none" });
    const vocals = instruments.find(i => i.family === "vocals");
    expect(vocals).toBeUndefined();
  });

});
