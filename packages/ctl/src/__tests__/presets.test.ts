import { CTLv1Schema } from "../index";
import {
  privateSchoolPreset,
  bacardiPreset,
  sgijaPreset,
  stixxSgijaPreset,
  mbiraianoPreset,
  threeStepPreset,
  gqomFusionPreset,
  hybridRnbPreset,
  ALL_PRESETS,
  PRESET_MAP,
} from "../presets";

// ─── 1. Schema validation: every preset must pass CTLv1Schema.parse ───────────

describe("Preset schema validation", () => {
  it("Private School — passes CTLv1Schema",      () => expect(() => CTLv1Schema.parse(privateSchoolPreset)).not.toThrow());
  it("Bacardi — passes CTLv1Schema",             () => expect(() => CTLv1Schema.parse(bacardiPreset)).not.toThrow());
  it("Sgija — passes CTLv1Schema",               () => expect(() => CTLv1Schema.parse(sgijaPreset)).not.toThrow());
  it("Stixx Sgija — passes CTLv1Schema",         () => expect(() => CTLv1Schema.parse(stixxSgijaPreset)).not.toThrow());
  it("Mbiraiano — passes CTLv1Schema",           () => expect(() => CTLv1Schema.parse(mbiraianoPreset)).not.toThrow());
  it("3-Step — passes CTLv1Schema",              () => expect(() => CTLv1Schema.parse(threeStepPreset)).not.toThrow());
  it("Gqom Fusion — passes CTLv1Schema",         () => expect(() => CTLv1Schema.parse(gqomFusionPreset)).not.toThrow());
  it("Hybrid R&B — passes CTLv1Schema",          () => expect(() => CTLv1Schema.parse(hybridRnbPreset)).not.toThrow());
});

// ─── 2. Cultural lineage invariants (AC-AMI rules encoded in presets) ─────────

describe("Cultural lineage invariants", () => {
  it("Private School: deep_house.weight >= 0.50", () =>
    expect(privateSchoolPreset.cultural_lineage.deep_house.weight).toBeGreaterThanOrEqual(0.50));

  it("Bacardi: bacardi.weight >= 0.60", () =>
    expect(bacardiPreset.cultural_lineage.bacardi.weight).toBeGreaterThanOrEqual(0.60));

  it("Sgija: kwaito.weight >= 0.40", () =>
    expect(sgijaPreset.cultural_lineage.kwaito.weight).toBeGreaterThanOrEqual(0.40));

  it("Sgija: bacardi.weight >= 0.30", () =>
    expect(sgijaPreset.cultural_lineage.bacardi.weight).toBeGreaterThanOrEqual(0.30));

  it("Stixx Sgija: bacardi.weight >= 0.40", () =>
    expect(stixxSgijaPreset.cultural_lineage.bacardi.weight).toBeGreaterThanOrEqual(0.40));

  it("Stixx Sgija: kwaito.weight >= 0.35", () =>
    expect(stixxSgijaPreset.cultural_lineage.kwaito.weight).toBeGreaterThanOrEqual(0.35));

  it("Mbiraiano: mbira lineage present and weight >= 0.70", () =>
    expect(mbiraianoPreset.cultural_lineage.mbira?.weight ?? 0).toBeGreaterThanOrEqual(0.70));

  it("3-Step: log_drum_innovation.weight >= 0.65", () =>
    expect(threeStepPreset.cultural_lineage.log_drum_innovation.weight).toBeGreaterThanOrEqual(0.65));

  it("Gqom Fusion: gqom lineage present and weight >= 0.65", () =>
    expect(gqomFusionPreset.cultural_lineage.gqom?.weight ?? 0).toBeGreaterThanOrEqual(0.65));

  it("Hybrid R&B: jazz.weight >= 0.45", () =>
    expect(hybridRnbPreset.cultural_lineage.jazz.weight).toBeGreaterThanOrEqual(0.45));

  it("Hybrid R&B: deep_house.weight >= 0.40", () =>
    expect(hybridRnbPreset.cultural_lineage.deep_house.weight).toBeGreaterThanOrEqual(0.40));

  it("All presets: log_drum_innovation.weight >= 0.45 (universal AC-AMI floor)", () => {
    for (const preset of ALL_PRESETS) {
      expect(preset.cultural_lineage.log_drum_innovation.weight).toBeGreaterThanOrEqual(0.45);
    }
  });
});

// ─── 3. Groove pattern integrity ─────────────────────────────────────────────

describe("Groove pattern integrity", () => {
  it("All presets have at least one groove pattern", () => {
    for (const preset of ALL_PRESETS) {
      expect(preset.groove_patterns.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("All groove patterns have exactly 16 steps", () => {
    for (const preset of ALL_PRESETS) {
      for (const gp of preset.groove_patterns) {
        expect(gp.steps).toHaveLength(16);
      }
    }
  });

  it("All groove patterns have exactly 16 microtiming values", () => {
    for (const preset of ALL_PRESETS) {
      for (const gp of preset.groove_patterns) {
        expect(gp.microtiming).toHaveLength(16);
      }
    }
  });

  it("All groove patterns have exactly 16 velocity values", () => {
    for (const preset of ALL_PRESETS) {
      for (const gp of preset.groove_patterns) {
        expect(gp.velocity).toHaveLength(16);
      }
    }
  });
});

// ─── 4. Cultural vocabulary — private school preset ──────────────────────────

describe("Cultural vocabulary — Private School preset", () => {
  it("privateSchoolPreset has cultural_vocabulary", () =>
    expect(privateSchoolPreset.cultural_vocabulary).toBeDefined());

  it("arrangement_style is chant_first", () =>
    expect(privateSchoolPreset.cultural_vocabulary?.arrangement_style).toBe("chant_first"));

  it("language_tags includes isiZulu and Setswana", () => {
    const tags = privateSchoolPreset.cultural_vocabulary?.language_tags ?? [];
    expect(tags).toContain("isiZulu");
    expect(tags).toContain("Setswana");
  });

  it("adlib_bank is non-empty", () =>
    expect((privateSchoolPreset.cultural_vocabulary?.adlib_bank ?? []).length).toBeGreaterThan(0));

  it("question_bank is non-empty", () =>
    expect((privateSchoolPreset.cultural_vocabulary?.question_bank ?? []).length).toBeGreaterThan(0));

  it("hook_fragments is non-empty", () =>
    expect((privateSchoolPreset.cultural_vocabulary?.hook_fragments ?? []).length).toBeGreaterThan(0));

  it("call_response includes 'o kae molao?' call", () => {
    const crs = privateSchoolPreset.cultural_vocabulary?.call_response ?? [];
    expect(crs.some((cr) => cr.call === "o kae molao?")).toBe(true);
  });

  it("call_response 'o kae molao?' has response 'jinda dai ding…'", () => {
    const cr = (privateSchoolPreset.cultural_vocabulary?.call_response ?? []).find(
      (c) => c.call === "o kae molao?"
    );
    expect(cr?.response).toBe("jinda dai ding…");
  });

  it("privateSchoolPreset still passes CTLv1Schema after vocabulary addition", () =>
    expect(() => CTLv1Schema.parse(privateSchoolPreset)).not.toThrow());
});

// ─── 5. Preset registry ───────────────────────────────────────────────────────

describe("Preset registry", () => {
  it("ALL_PRESETS contains 8 presets", () => {
    expect(ALL_PRESETS).toHaveLength(8);
  });

  it("PRESET_MAP contains all 8 subgenre keys", () => {
    const expected = [
      "private_school", "bacardi", "sgija", "stixx_sgija",
      "mbiraiano", "three_step", "gqom_fusion", "hybrid_rnb_amapiano",
    ];
    for (const key of expected) {
      expect(PRESET_MAP).toHaveProperty(key);
    }
  });

  it("PRESET_MAP subgenre keys match preset global.subgenre", () => {
    for (const [key, preset] of Object.entries(PRESET_MAP)) {
      expect(preset.global.subgenre).toBe(key);
    }
  });
});
