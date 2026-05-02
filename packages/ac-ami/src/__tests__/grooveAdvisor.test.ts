import { suggestGroove } from "../groove/grooveAdvisor";
import type { GrooveSuggestion } from "../groove/grooveAdvisor";

// ─────────────────────────────────────────────────────────────────────────────

describe("Groove Advisor — suggestGroove", () => {

  // ─── Return shape ──────────────────────────────────────────────────────────

  it("1. Returns an array", () => {
    expect(Array.isArray(suggestGroove("private_school"))).toBe(true);
  });

  it("2. Default: returns exactly 5 suggestions", () => {
    expect(suggestGroove("private_school")).toHaveLength(5);
  });

  it("3. Respects maxSuggestions option", () => {
    expect(suggestGroove("sgija", { maxSuggestions: 3 })).toHaveLength(3);
  });

  it("4. maxSuggestions: 1 returns exactly 1 suggestion", () => {
    expect(suggestGroove("bacardi", { maxSuggestions: 1 })).toHaveLength(1);
  });

  it("5. Each suggestion has required fields", () => {
    const results = suggestGroove("private_school");
    for (const s of results) {
      expect(typeof s.patternId).toBe("string");
      expect(typeof s.label).toBe("string");
      expect(typeof s.lane).toBe("string");
      expect(typeof s.confidence).toBe("number");
      expect(typeof s.reason).toBe("string");
      expect(typeof s.ghostDensity).toBe("number");
      expect(typeof s.hitDensity).toBe("number");
      expect(typeof s.swing).toBe("number");
    }
  });

  // ─── Confidence bounds ─────────────────────────────────────────────────────

  it("6. All confidence values are between 0 and 1", () => {
    const results = suggestGroove("stixx_sgija", { variationLevel: 0.9 });
    for (const s of results) {
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("7. Suggestions are sorted by confidence descending", () => {
    const results = suggestGroove("sgija");
    for (let i = 1; i < results.length; i++) {
      expect(results[i].confidence).toBeLessThanOrEqual(results[i - 1].confidence);
    }
  });

  // ─── Lane targeting ────────────────────────────────────────────────────────

  it("8. private_school: first suggestion is in the private_school lane", () => {
    const top = suggestGroove("private_school")[0];
    expect(top.lane).toBe("private_school");
  });

  it("9. sgija: first suggestion is in the sgija lane", () => {
    const top = suggestGroove("sgija")[0];
    expect(top.lane).toBe("sgija");
  });

  it("10. stixx_sgija: first suggestion is in the stixx_sgija lane", () => {
    const top = suggestGroove("stixx_sgija")[0];
    expect(top.lane).toBe("stixx_sgija");
  });

  it("11. bacardi: first suggestion is in the bacardi lane", () => {
    const top = suggestGroove("bacardi")[0];
    expect(top.lane).toBe("bacardi");
  });

  // ─── Groove clarity adaptation ─────────────────────────────────────────────

  it("12. Low groove clarity → top suggestion has lower ghost density than high clarity", () => {
    const lowClarity  = suggestGroove("private_school", { grooveClarityScore: 0.1 })[0];
    const highClarity = suggestGroove("private_school", { grooveClarityScore: 0.9 })[0];
    expect(lowClarity.ghostDensity).toBeLessThanOrEqual(highClarity.ghostDensity);
  });

  it("13. High variation level → cross-lane suggestions appear in top 5", () => {
    const results = suggestGroove("private_school", {
      variationLevel: 1.0,
      compositeScore: 0.9,
      maxSuggestions: 5,
    });
    const hasCrossLane = results.some(s => s.lane !== "private_school");
    expect(hasCrossLane).toBe(true);
  });

  // ─── Reason field ──────────────────────────────────────────────────────────

  it("14. Every suggestion has a non-empty reason string", () => {
    const results = suggestGroove("gqom_fusion");
    for (const s of results) {
      expect(s.reason.length).toBeGreaterThan(0);
    }
  });

  it("15. Same-lane suggestion reason contains 'primary lane match'", () => {
    const results = suggestGroove("bacardi");
    const sameLane = results.find(s => s.lane === "bacardi");
    expect(sameLane).toBeDefined();
    expect(sameLane!.reason).toContain("primary lane match");
  });

});
