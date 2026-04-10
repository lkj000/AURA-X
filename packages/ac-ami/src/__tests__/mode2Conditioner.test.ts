import {
  privateSchoolPreset,
  bacardiPreset,
  mbiraianoPreset,
  threeStepPreset,
} from "@aura-x/ctl";
import { CTLv1 } from "@aura-x/ctl";
import { conditionForMode2 } from "../generation/mode2Conditioner";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function withBpm(preset: CTLv1, bpm: number): CTLv1 {
  return { ...preset, global: { ...preset.global, bpm } };
}

function withLogDrumInnovation(preset: CTLv1, weight: number): CTLv1 {
  return {
    ...preset,
    cultural_lineage: {
      ...preset.cultural_lineage,
      log_drum_innovation: {
        ...preset.cultural_lineage.log_drum_innovation,
        weight,
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("Mode 2 Conditioner", () => {

  // ─── Prompt compilation ───────────────────────────────────────────────────

  it("1. Private School prompt contains 'Amapiano' and 'private school'", () => {
    const result = conditionForMode2(privateSchoolPreset);
    expect(result.prompt.toLowerCase()).toContain("amapiano");
    expect(result.prompt.toLowerCase()).toContain("private school");
  });

  it("2. Bacardi prompt contains 'Bacardi' or 'raw'", () => {
    const result = conditionForMode2(bacardiPreset);
    const prompt = result.prompt.toLowerCase();
    expect(prompt.match(/bacardi|raw/)).toBeTruthy();
  });

  it("3. Mbiraiano prompt contains 'mbira'", () => {
    const result = conditionForMode2(mbiraianoPreset);
    expect(result.prompt.toLowerCase()).toContain("mbira");
  });

  it("4. All preset prompts are under 300 characters", () => {
    const presets: CTLv1[] = [
      privateSchoolPreset,
      bacardiPreset,
      mbiraianoPreset,
      threeStepPreset,
    ];
    for (const preset of presets) {
      const result = conditionForMode2(preset);
      expect(result.prompt.length).toBeLessThan(300);
    }
  });

  it("5. No prompt contains raw numeric weights (0.XX pattern)", () => {
    const weightPattern = /\b0\.\d{2}\b/;
    const presets: CTLv1[] = [
      privateSchoolPreset,
      bacardiPreset,
      mbiraianoPreset,
      threeStepPreset,
    ];
    for (const preset of presets) {
      const result = conditionForMode2(preset);
      expect(result.prompt).not.toMatch(weightPattern);
    }
  });

  it("6. All prompts contain BPM as a number", () => {
    const presets: { preset: CTLv1; bpm: number }[] = [
      { preset: privateSchoolPreset, bpm: 112 },
      { preset: bacardiPreset,       bpm: 118 },
      { preset: mbiraianoPreset,     bpm: 109 },
      { preset: threeStepPreset,     bpm: 113 },
    ];
    for (const { preset, bpm } of presets) {
      const result = conditionForMode2(preset);
      expect(result.prompt).toContain(String(bpm));
    }
  });

  // ─── Duration ─────────────────────────────────────────────────────────────

  it("7. 16 bars at 110 BPM → duration is approximately 35 seconds", () => {
    // (60/110) * 4 * 16 = 34.909… → rounds to 35
    const ctl = withBpm(privateSchoolPreset, 110);
    const result = conditionForMode2(ctl, { targetBars: 16 });
    expect(result.duration).toBe(35);
  });

  it("8. 8 bars at 110 BPM → duration is approximately 17-18 seconds", () => {
    // (60/110) * 4 * 8 = 17.45… → rounds to 17
    const ctl = withBpm(privateSchoolPreset, 110);
    const result = conditionForMode2(ctl, { targetBars: 8 });
    expect(result.duration).toBeGreaterThanOrEqual(17);
    expect(result.duration).toBeLessThanOrEqual(18);
  });

  it("9. 32 bars at 110 BPM → duration is approximately 70 seconds", () => {
    // (60/110) * 4 * 32 = 69.8… → rounds to 70
    const ctl = withBpm(privateSchoolPreset, 110);
    const result = conditionForMode2(ctl, { targetBars: 32 });
    expect(result.duration).toBe(70);
  });

  // ─── Temperature ─────────────────────────────────────────────────────────

  it("10. Private School temperature is < 1.0 (more structured)", () => {
    const result = conditionForMode2(privateSchoolPreset);
    expect(result.input.temperature!).toBeLessThan(1.0);
  });

  it("11. Three-Step temperature is >= 1.0 (more variation allowed)", () => {
    const result = conditionForMode2(threeStepPreset);
    expect(result.input.temperature!).toBeGreaterThanOrEqual(1.0);
  });

  it("12. All temperatures are between 0.8 and 1.2", () => {
    const presets: CTLv1[] = [
      privateSchoolPreset,
      bacardiPreset,
      mbiraianoPreset,
      threeStepPreset,
    ];
    for (const preset of presets) {
      const result = conditionForMode2(preset);
      expect(result.input.temperature!).toBeGreaterThanOrEqual(0.8);
      expect(result.input.temperature!).toBeLessThanOrEqual(1.2);
    }
  });

  // ─── CFG ──────────────────────────────────────────────────────────────────

  it("13. High log_drum_innovation (>= 0.75) → CFG is 3.5", () => {
    const ctl = withLogDrumInnovation(privateSchoolPreset, 0.80);
    const result = conditionForMode2(ctl);
    expect(result.input.classifier_free_guidance).toBe(3.5);
  });

  it("14. Low log_drum_innovation (< 0.55) → CFG is 2.5", () => {
    const ctl = withLogDrumInnovation(privateSchoolPreset, 0.40);
    const result = conditionForMode2(ctl);
    expect(result.input.classifier_free_guidance).toBe(2.5);
  });

});
