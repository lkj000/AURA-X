import {
  getCamelotCode,
  getCompatibleKeys,
  harmonicCompatibilityScore,
  bpmCompatibilityScore,
  mixCompatibilityScore,
  KEY_TO_CAMELOT,
} from "../dj/camelotWheel";

describe("Camelot Wheel", () => {

  // ─── Key mapping ────────────────────────────────────────────────────────────

  it("1. Am maps to '8A'", () => {
    expect(getCamelotCode("Am")).toBe("8A");
  });

  it("2. F#m maps to '11A'", () => {
    expect(getCamelotCode("F#m")).toBe("11A");
  });

  it("3. C maps to '8B'", () => {
    expect(getCamelotCode("C")).toBe("8B");
  });

  it("4. Gm maps to '6A'", () => {
    expect(getCamelotCode("Gm")).toBe("6A");
  });

  it("5. Unknown key returns null", () => {
    expect(getCamelotCode("Xm")).toBeNull();
    expect(getCamelotCode("")).toBeNull();
  });

  // ─── Compatible keys ────────────────────────────────────────────────────────

  it("6. '8A' compatible keys include '8A', '9A', '7A', '8B'", () => {
    const compatible = getCompatibleKeys("8A");
    expect(compatible).toContain("8A");
    expect(compatible).toContain("9A");
    expect(compatible).toContain("7A");
    expect(compatible).toContain("8B");
  });

  it("7. Compatible keys always includes the input code itself", () => {
    const codes = ["1A", "6A", "11B", "3B", "12A"];
    for (const code of codes) {
      expect(getCompatibleKeys(code)).toContain(code);
    }
  });

  it("8. getCompatibleKeys returns 4 codes", () => {
    expect(getCompatibleKeys("8A")).toHaveLength(4);
    expect(getCompatibleKeys("5B")).toHaveLength(4);
    expect(getCompatibleKeys("12A")).toHaveLength(4);
  });

  // ─── Compatibility scores ───────────────────────────────────────────────────

  it("9. Same key → 1.0", () => {
    expect(harmonicCompatibilityScore("8A", "8A")).toBe(1.0);
    expect(harmonicCompatibilityScore("11B", "11B")).toBe(1.0);
  });

  it("10. Parallel major/minor (8A/8B) → 0.9", () => {
    expect(harmonicCompatibilityScore("8A", "8B")).toBe(0.9);
    expect(harmonicCompatibilityScore("11A", "11B")).toBe(0.9);
  });

  it("11. Adjacent key (8A/9A) → 0.85", () => {
    expect(harmonicCompatibilityScore("8A", "9A")).toBe(0.85);
    expect(harmonicCompatibilityScore("8A", "7A")).toBe(0.85);
  });

  it("12. BPM within 2% → high score (> 0.8)", () => {
    const score = bpmCompatibilityScore(112, 113);
    expect(score).toBeGreaterThan(0.8);
  });

  it("13. BPM 50% off → halftime/doubletime detected (score > 0.7)", () => {
    // 112 bpm vs 56 bpm (halftime) — should be recognized as compatible
    const score = bpmCompatibilityScore(112, 56);
    expect(score).toBeGreaterThan(0.7);
  });

  // ─── Overall mix compatibility ──────────────────────────────────────────────

  it("14. mixCompatibilityScore: same key + same BPM → > 0.95", () => {
    const score = mixCompatibilityScore(
      { key: "F#m", bpm: 112 },
      { key: "F#m", bpm: 112 },
    );
    expect(score).toBeGreaterThan(0.95);
  });

});
