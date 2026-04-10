import { planGroove } from "../groove/groovePlanner";
import { GroovePatternSchema } from "@aura-x/ctl";
import { ALL_PATTERNS, GROOVE_LIBRARY } from "../groove/grooveLibrary";
import {
  privateSchoolPreset,
  bacardiPreset,
  sgijaPreset,
  stixxSgijaPreset,
  gqomFusionPreset,
} from "@aura-x/ctl";

const VALID_STEPS = new Set(["K", "L", "g", "x", "C", "R", "-"]);

describe("Groove Planner", () => {

  // ─── Pattern selection ────────────────────────────────────────────────────

  it("1. Private School primary pattern id starts with 'ps_'", () => {
    const patterns = planGroove(privateSchoolPreset);
    expect(patterns[0].id).toMatch(/^ps_/);
  });

  it("2. Bacardi primary pattern id starts with 'bac_'", () => {
    const patterns = planGroove(bacardiPreset);
    expect(patterns[0].id).toMatch(/^bac_/);
  });

  it("3. Sgija primary pattern id starts with 'sgija_'", () => {
    const patterns = planGroove(sgijaPreset);
    expect(patterns[0].id).toMatch(/^sgija_/);
  });

  it("4. Stixx Sgija primary pattern id starts with 'stixx_'", () => {
    const patterns = planGroove(stixxSgijaPreset);
    expect(patterns[0].id).toMatch(/^stixx_/);
  });

  it("5. planGroove always returns at least 1 pattern", () => {
    const presets = [privateSchoolPreset, bacardiPreset, sgijaPreset, stixxSgijaPreset, gqomFusionPreset];
    for (const preset of presets) {
      expect(planGroove(preset).length).toBeGreaterThanOrEqual(1);
    }
  });

  // ─── Step integrity (all library patterns) ────────────────────────────────

  it("6. Every library pattern has exactly 16 steps", () => {
    for (const p of ALL_PATTERNS) {
      expect(p.steps).toHaveLength(16);
    }
  });

  it("7. Every library pattern has exactly 16 microtiming values", () => {
    for (const p of ALL_PATTERNS) {
      expect(p.microtiming).toHaveLength(16);
    }
  });

  it("8. Every library pattern has exactly 16 velocity values", () => {
    for (const p of ALL_PATTERNS) {
      expect(p.velocity).toHaveLength(16);
    }
  });

  it("9. Every step token is one of K L g x C R -", () => {
    for (const p of ALL_PATTERNS) {
      for (const step of p.steps) {
        expect(VALID_STEPS.has(step)).toBe(true);
      }
    }
  });

  it("10. All velocity values are between 0 and 127", () => {
    for (const p of ALL_PATTERNS) {
      for (const v of p.velocity) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(127);
      }
    }
  });

  // ─── Swing bounds ─────────────────────────────────────────────────────────

  it("11. Bacardi swing never exceeds 0.52 regardless of bounce option", () => {
    const patterns = planGroove(bacardiPreset, { bounce: 1.0 });
    for (const p of patterns) {
      expect(p.swing).toBeLessThanOrEqual(0.52);
    }
  });

  it("12. Gqom Fusion swing never exceeds 0.52", () => {
    const patterns = planGroove(gqomFusionPreset, { bounce: 1.0 });
    for (const p of patterns) {
      expect(p.swing).toBeLessThanOrEqual(0.52);
    }
  });

  it("13. Sgija primary pattern swing >= 0.55 (bounce-oriented lane)", () => {
    const patterns = planGroove(sgijaPreset);
    expect(patterns[0].swing).toBeGreaterThanOrEqual(0.55);
  });

  it("14. High bounce option increases swing vs default on Sgija", () => {
    const defaultSwing = planGroove(sgijaPreset, { bounce: 0.5 })[0].swing;
    const highBounce   = planGroove(sgijaPreset, { bounce: 0.9 })[0].swing;
    expect(highBounce).toBeGreaterThan(defaultSwing);
  });

  // ─── Intensity adaptation ─────────────────────────────────────────────────

  it("15. High intensity (0.9) increases average non-zero velocity vs default (0.5)", () => {
    const avgNonZero = (patterns: ReturnType<typeof planGroove>) => {
      const vals = patterns[0].velocity.filter(v => v > 0);
      return vals.reduce((s, v) => s + v, 0) / vals.length;
    };
    const base = avgNonZero(planGroove(privateSchoolPreset, { intensity: 0.5 }));
    const high = avgNonZero(planGroove(privateSchoolPreset, { intensity: 0.9 }));
    expect(high).toBeGreaterThan(base);
  });

  it("16. Low intensity (0.1) decreases average non-zero velocity vs default (0.5)", () => {
    const avgNonZero = (patterns: ReturnType<typeof planGroove>) => {
      const vals = patterns[0].velocity.filter(v => v > 0);
      return vals.reduce((s, v) => s + v, 0) / vals.length;
    };
    const base = avgNonZero(planGroove(privateSchoolPreset, { intensity: 0.5 }));
    const low  = avgNonZero(planGroove(privateSchoolPreset, { intensity: 0.1 }));
    expect(low).toBeLessThan(base);
  });

  // ─── Variation selection ──────────────────────────────────────────────────

  it("17. variationLevel >= 0.3 returns > 1 pattern for Stixx Sgija", () => {
    const patterns = planGroove(stixxSgijaPreset, { variationLevel: 0.5 });
    expect(patterns.length).toBeGreaterThan(1);
  });

  it("18. variationLevel = 0.0 returns exactly 1 pattern", () => {
    const patterns = planGroove(stixxSgijaPreset, { variationLevel: 0.0 });
    expect(patterns).toHaveLength(1);
  });

  it("19. All returned patterns pass GroovePatternSchema validation", () => {
    const presets = [privateSchoolPreset, bacardiPreset, sgijaPreset, stixxSgijaPreset, gqomFusionPreset];
    for (const preset of presets) {
      const patterns = planGroove(preset, { variationLevel: 0.8 });
      for (const p of patterns) {
        expect(() => GroovePatternSchema.parse(p)).not.toThrow();
      }
    }
  });

  // ─── Kwaito influence ─────────────────────────────────────────────────────

  it("20. High kwaito weight (0.7) on Sgija returns sgija_groove_01 as primary", () => {
    const highKwaitoSgija = {
      ...sgijaPreset,
      cultural_lineage: {
        ...sgijaPreset.cultural_lineage,
        kwaito: { weight: 0.72, influences: ["repetition_logic"], must_not: [] },
      },
    };
    const patterns = planGroove(highKwaitoSgija);
    expect(patterns[0].id).toBe("sgija_groove_01");
  });

});
