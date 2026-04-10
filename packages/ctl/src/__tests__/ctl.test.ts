import { CTLv1Schema, createCTL } from "../index";

const validPrivateSchool = () => createCTL({
  global: {
    title: "Late Night Session",
    bpm: 112,
    key: "F#m",
    subgenre: "private_school",
    created_by: "okovanggo_ai",
  },
});

describe("CTL_v1 Schema", () => {
  it("accepts valid Private School CTL", () => {
    expect(() => validPrivateSchool()).not.toThrow();
  });

  it("rejects BPM below 95", () => {
    expect(() =>
      createCTL({
        global: {
          title: "Too Slow",
          bpm: 80,
          key: "F#m",
          subgenre: "private_school",
          created_by: "test",
        },
      })
    ).toThrow();
  });

  it("rejects BPM above 130", () => {
    expect(() =>
      createCTL({
        global: {
          title: "Too Fast",
          bpm: 145,
          key: "F#m",
          subgenre: "private_school",
          created_by: "test",
        },
      })
    ).toThrow();
  });

  it("rejects unknown subgenre", () => {
    const ctl = validPrivateSchool();
    const bad = { ...ctl, global: { ...ctl.global, subgenre: "techno" } };
    expect(() => CTLv1Schema.parse(bad)).toThrow();
  });

  it("rejects groove pattern with != 16 steps", () => {
    const ctl = validPrivateSchool();
    const bad = {
      ...ctl,
      groove_patterns: [{
        ...ctl.groove_patterns[0],
        steps: ["K", "L", "x"],
      }],
    };
    expect(() => CTLv1Schema.parse(bad)).toThrow();
  });

  it("rejects groove microtiming with != 16 values", () => {
    const ctl = validPrivateSchool();
    const bad = {
      ...ctl,
      groove_patterns: [{
        ...ctl.groove_patterns[0],
        microtiming: [0, 0, 0],
      }],
    };
    expect(() => CTLv1Schema.parse(bad)).toThrow();
  });

  it("createCTL() returns valid CTL with minimal overrides", () => {
    const ctl = validPrivateSchool();
    expect(CTLv1Schema.safeParse(ctl).success).toBe(true);
  });

  it("createCTL() sets schema_version to ctl_v1", () => {
    const ctl = validPrivateSchool();
    expect(ctl.schema_version).toBe("ctl_v1");
  });

  it("createCTL() sets genre to amapiano", () => {
    const ctl = validPrivateSchool();
    expect(ctl.global.genre).toBe("amapiano");
  });

  it("createCTL() defaults generation_mode to mode_1_suno", () => {
    const ctl = validPrivateSchool();
    expect(ctl.global.generation_mode).toBe("mode_1_suno");
  });

  it("createCTL() preserves provided subgenre (bacardi)", () => {
    const ctl = createCTL({
      global: {
        title: "Bacardi Bounce",
        bpm: 118,
        key: "Gm",
        subgenre: "bacardi",
        created_by: "test",
      },
    });
    expect(ctl.global.subgenre).toBe("bacardi");
  });

  it("cultural lineage deep_house.weight must be between 0 and 1", () => {
    const ctl = validPrivateSchool();
    const bad = {
      ...ctl,
      cultural_lineage: {
        ...ctl.cultural_lineage,
        deep_house: { ...ctl.cultural_lineage.deep_house, weight: 1.5 },
      },
    };
    expect(() => CTLv1Schema.parse(bad)).toThrow();
  });
});
