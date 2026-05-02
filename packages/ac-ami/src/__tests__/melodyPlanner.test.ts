import { planMelody } from "../melody/melodyPlanner";
import { exportMelodyToMidi } from "../melody/melodyMidi";
import type { MelodyPlan } from "../melody/melodyPlanner";

// ─────────────────────────────────────────────────────────────────────────────

describe("Melody Planner — planMelody", () => {

  // ─── Return shape ──────────────────────────────────────────────────────────

  it("1. Returns a MelodyPlan object with required fields", () => {
    const plan = planMelody("private_school", "C", 110);
    expect(plan).toMatchObject({
      lane:  "private_school",
      key:   "C",
      bpm:   110,
      bars:  4,
    });
    expect(Array.isArray(plan.notes)).toBe(true);
  });

  it("2. Default options produce 4 bars", () => {
    const plan = planMelody("bacardi", "Am", 118);
    expect(plan.bars).toBe(4);
  });

  it("3. Respects bars option", () => {
    const plan = planMelody("sgija", "F", 120, { bars: 8 });
    expect(plan.bars).toBe(8);
  });

  it("4. bars is clamped to [1, 32]", () => {
    expect(planMelody("gqom_fusion", "C", 130, { bars: 0 }).bars).toBe(1);
    expect(planMelody("gqom_fusion", "C", 130, { bars: 99 }).bars).toBe(32);
  });

  it("5. Each note has all required fields", () => {
    const plan = planMelody("private_school", "C", 110);
    for (const n of plan.notes) {
      expect(typeof n.pitch).toBe("number");
      expect(typeof n.step).toBe("number");
      expect(typeof n.durationSteps).toBe("number");
      expect(typeof n.velocity).toBe("number");
      expect(typeof n.chordTone).toBe("boolean");
    }
  });

  // ─── Pitch bounds ──────────────────────────────────────────────────────────

  it("6. All pitches are valid MIDI notes (0–127)", () => {
    const plan = planMelody("sgija", "G", 120, { register: "high" });
    for (const n of plan.notes) {
      expect(n.pitch).toBeGreaterThanOrEqual(0);
      expect(n.pitch).toBeLessThanOrEqual(127);
    }
  });

  it("7. High register produces higher pitches than low register on average", () => {
    const low  = planMelody("private_school", "C", 110, { register: "low" });
    const high = planMelody("private_school", "C", 110, { register: "high" });
    const avg  = (p: MelodyPlan) => p.notes.reduce((s, n) => s + n.pitch, 0) / p.notes.length;
    expect(avg(high)).toBeGreaterThan(avg(low));
  });

  // ─── Step ordering ─────────────────────────────────────────────────────────

  it("8. Steps are monotonically non-decreasing", () => {
    const plan = planMelody("private_school", "C", 110, { bars: 4 });
    for (let i = 1; i < plan.notes.length; i++) {
      expect(plan.notes[i].step).toBeGreaterThanOrEqual(plan.notes[i - 1].step);
    }
  });

  it("9. No note step exceeds bars * 16 - 1", () => {
    const bars = 4;
    const plan = planMelody("bacardi", "D", 120, { bars });
    for (const n of plan.notes) {
      expect(n.step).toBeLessThan(bars * 16);
    }
  });

  // ─── Density effects ───────────────────────────────────────────────────────

  it("10. Low density produces fewer notes than high density", () => {
    const low  = planMelody("sgija", "C", 120, { density: 0.1, bars: 4 });
    const high = planMelody("sgija", "C", 120, { density: 0.9, bars: 4 });
    expect(low.notes.length).toBeLessThanOrEqual(high.notes.length);
  });

  it("11. Low density: duration is 3 steps", () => {
    const plan = planMelody("bacardi", "C", 118, { density: 0.1 });
    for (const n of plan.notes) expect(n.durationSteps).toBe(3);
  });

  it("12. High density: duration is 1 step", () => {
    const plan = planMelody("bacardi", "C", 118, { density: 0.9 });
    for (const n of plan.notes) expect(n.durationSteps).toBe(1);
  });

  // ─── Style variants ────────────────────────────────────────────────────────

  it("13. Arpeggiated style produces notes (non-empty)", () => {
    const plan = planMelody("private_school", "C", 110, { style: "arpeggiated" });
    expect(plan.notes.length).toBeGreaterThan(0);
  });

  it("14. Stepwise style produces notes (non-empty)", () => {
    const plan = planMelody("mbiraiano", "Am", 112, { style: "stepwise" });
    expect(plan.notes.length).toBeGreaterThan(0);
  });

  // ─── MIDI export ───────────────────────────────────────────────────────────

  it("15. exportMelodyToMidi returns a Buffer starting with MThd", () => {
    const plan   = planMelody("private_school", "C", 110);
    const result = exportMelodyToMidi(plan);
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(14);
    // "MThd" magic bytes
    expect(result.buffer[0]).toBe(0x4d);
    expect(result.buffer[1]).toBe(0x54);
    expect(result.buffer[2]).toBe(0x68);
    expect(result.buffer[3]).toBe(0x64);
  });

});
