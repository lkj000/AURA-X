import {
  scoreBpmAccuracy,
  scoreKeyAccuracy,
  scoreEnergyAccuracy,
  scoreGrooveDensity,
  scoreCulturalSignal,
  evaluateSignal,
  SUBGENRE_ONSET_TARGETS,
  SUBGENRE_LOW_MID_TARGETS,
} from "../evaluation/audioFeatureBridge";
import { CTLv1 } from "@aura-x/ctl";

// ─── Minimal CTL fixture ──────────────────────────────────────────────────────

function makeCTL(overrides: Partial<CTLv1["global"]> = {}): CTLv1 {
  return {
    version: "1.0",
    global: {
      title: "Test Track",
      bpm: 112,
      key: "F#m",
      mode: "minor",
      subgenre: "private_school",
      emotional_profile: "nostalgic",
      created_by: "test",
      ...overrides,
    },
    harmony: {
      root_note: "F#",
      scale_type: "minor_pentatonic",
      chord_progression: ["i", "III", "VII", "v"],
      extensions: ["7th"],
      lineage_weight: 0.8,
    },
    groove: {
      pattern_id: "private_school_basic",
      log_drum_placement: [0, 0.5, 1.0],
      microtiming_ms: 12,
      swing_ratio: 0.55,
      polyrhythm_layer: null,
    },
    instrumentation: {
      log_drum_patch: "log_drum_deep",
      piano_voicing: "close",
      bass_register: "sub",
      pad_texture: "warm",
      percussion_stack: ["shaker", "clap"],
      lead_element: null,
    },
    production: {
      bpm_stretch_allowed: true,
      target_lufs: -14,
      stereo_width: 0.7,
      reverb_send: 0.2,
      sidechain_depth: 0.4,
    },
    evaluation_targets: {
      authenticity_target: 0.75,
      innovation_target: 0.5,
      cultural_resonance_target: 0.8,
    },
    generation: {
      mode: "mode_1_suno",
      prompt_style: "detailed",
      seed: null,
      duration_sec: 180,
    },
    metadata: {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version_hash: "abc123",
      tags: [],
    },
  } as unknown as CTLv1;
}

// ─── scoreBpmAccuracy ─────────────────────────────────────────────────────────

describe("scoreBpmAccuracy", () => {
  it("1. Gap ≤2 → 1.0", () => {
    expect(scoreBpmAccuracy(112, 113)).toBe(1.0);
  });

  it("2. Gap ≤5 → 0.85", () => {
    expect(scoreBpmAccuracy(112, 116)).toBe(0.85);
  });

  it("3. Gap ≤8 → 0.65", () => {
    expect(scoreBpmAccuracy(112, 118)).toBe(0.65);
  });

  it("4. Gap >12 → 0.10", () => {
    expect(scoreBpmAccuracy(112, 130)).toBe(0.10);
  });
});

// ─── scoreKeyAccuracy ─────────────────────────────────────────────────────────

describe("scoreKeyAccuracy", () => {
  it("5. Exact match → 1.0", () => {
    expect(scoreKeyAccuracy("F#m", "F#m")).toBe(1.0);
  });

  it("6. Same tonic, different mode → 0.7", () => {
    expect(scoreKeyAccuracy("F#m", "F#")).toBe(0.7);
  });

  it("7. Pentatonic neighbor → 0.5", () => {
    // F# neighbors include A, B, C#, E
    expect(scoreKeyAccuracy("F#m", "Am")).toBe(0.5);
  });

  it("8. Unrelated key → 0.1", () => {
    expect(scoreKeyAccuracy("F#m", "Cm")).toBe(0.1);
  });
});

// ─── scoreGrooveDensity ───────────────────────────────────────────────────────

describe("scoreGrooveDensity", () => {
  it("9. Onset density within range → 1.0", () => {
    // private_school range: [4.0, 6.0]
    expect(scoreGrooveDensity("private_school", 5.0)).toBe(1.0);
  });

  it("10. Unknown subgenre → 0.5 (fallback)", () => {
    expect(scoreGrooveDensity("unknown_subgenre", 5.0)).toBe(0.5);
  });
});

// ─── evaluateSignal ───────────────────────────────────────────────────────────

describe("evaluateSignal", () => {
  it("11. Perfect match → passes signal gate", () => {
    const ctl = makeCTL({ bpm: 112, key: "F#m", subgenre: "private_school" });
    const observed = {
      bpm: 112,
      bpm_confidence: 0.95,
      key: "F#m",
      mode: "minor",
      key_confidence: 0.9,
      energy_mean: 0.75,
      energy_peak: 0.9,
      onset_density: 5.0,
      duration_sec: 180,
      low_mid_ratio: 0.18,
    };
    const result = evaluateSignal(ctl, observed);
    expect(result.passed_signal_gate).toBe(true);
    expect(result.signal_composite_score).toBeGreaterThanOrEqual(0.65);
  });

  it("12. Poor BPM + key mismatch → signal notes populated", () => {
    const ctl = makeCTL({ bpm: 112, key: "F#m", subgenre: "private_school" });
    const observed = {
      bpm: 130,
      bpm_confidence: 0.5,
      key: "Cm",
      mode: "minor",
      key_confidence: 0.4,
      energy_mean: 0.75,
      energy_peak: 0.9,
      onset_density: 5.0,
      duration_sec: 180,
      low_mid_ratio: 0.18,
    };
    const result = evaluateSignal(ctl, observed);
    expect(result.signal_notes.length).toBeGreaterThan(0);
    expect(result.key_match).toBe(false);
    expect(result.bpm_gap).toBeGreaterThan(5);
  });
});
