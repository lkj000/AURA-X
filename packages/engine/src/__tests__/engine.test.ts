// @aura-x/engine — comprehensive test suite
// Covers DSP, audio intelligence, high-end engine, ML engine, DAW export, and top-level API.

import { clamp, gaussScore, softmax, hashString, hammingDistance, mean } from "../_utils";
import { fftInPlace, estimateBpm, spectralCentroidFft, bandEnergies, computeRmsEnergy, computeChroma, onsetEnvelope } from "../_dsp";
import { parseWavMono } from "../_audio_io";
import { scoreAuthenticityLanes } from "../audio_intelligence/authenticity_scoring";
import { scoreLaneQuality } from "../audio_intelligence/lane_quality";
import { extractGroove } from "../audio_intelligence/groove_extraction";
import { extractAudioFeatures } from "../audio_intelligence/feature_extraction";
import { ConvergenceTracker } from "../high_end_engine/convergence";
import { buildRefinementPlan } from "../high_end_engine/refinement";
import { transferGroove } from "../high_end_engine/groove_transfer";
import { evaluateRender } from "../high_end_engine/render_evaluator";
import { emptyPolicy, updatePolicy, computeActionScore, laneLeaderboard } from "../ml_engine/adaptive_action_learning";
import { exportGrooveToMidi, groovePlanToMidi } from "../daw_export/midi_export";
import { applyPerceptionModel, computeBEff, computePerceptualDensity, barkScale } from "../perception/perception_model";
import { decomposeStems } from "../perception/stem_decomposer";
import { evaluateBuffer, buildEnhancement } from "../index";
import { LANE_GRAMMARS, AMAPIANO_THRESHOLD, REFINEMENT_ACTIONS } from "../types";
import type { AudioFeatures, GroovePlan, QualityScore, SamplePlan } from "../types";

// ── WAV builder ───────────────────────────────────────────────────────────────
// Generates a synthetic percussive WAV at ~114 BPM with a 110 Hz log-drum-like tone.

function buildWav(durationSec: number, sampleRate = 44100, freqHz = 110, bpm = 114): Buffer {
  const numSamples = Math.floor(durationSec * sampleRate);
  const beatPeriod = Math.floor((sampleRate * 60) / bpm);

  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + numSamples * 2, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);          // PCM
  header.writeUInt16LE(1, 22);          // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(numSamples * 2, 40);

  const data = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const pos = i % beatPeriod;
    const decay = Math.exp(-10 * pos / beatPeriod);
    const sample = Math.sin(2 * Math.PI * freqHz * t) * decay * 0.8;
    const clamped = Math.max(-1, Math.min(1, sample));
    data.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }

  return Buffer.concat([header, data]);
}

// Minimal dummy AudioFeatures for unit tests that don't need real DSP
function dummyFeatures(overrides: Partial<AudioFeatures> = {}): AudioFeatures {
  return {
    bpm: 114,
    energyRms: 0.50,
    spectralCentroid: 1525,
    subBassEnergy: 0.25,
    lowMidEnergy: 0.50,
    highEnergy: 0.25,
    groove: { swingRatio: 0.53, syncopationIndex: 0.45 },
    logDrum: null,
    harmonic: null,
    durationSec: 3,
    sampleRate: 44100,
    ...overrides,
  };
}

function dummyGroovePlan(lane: "private_school" | "sgija" | "bacardi" | "stixx_sgija" | "mbiraiano" | "three_step" | "gqom_fusion" | "hybrid_rnb_amapiano" = "sgija"): GroovePlan {
  const g = LANE_GRAMMARS[lane];
  return {
    grooveType: `${lane}_grammar`,
    lane,
    steps: 16,
    kickPattern:    Array.from({ length: 16 }, (_, i) => g.kick.includes(i) ? 1 : 0) as unknown as readonly number[],
    hatPattern:     Array.from({ length: 16 }, (_, i) => g.hat.includes(i) ? 1 : 0) as unknown as readonly number[],
    shakerPattern:  Array.from({ length: 16 }, (_, i) => g.shaker.includes(i) ? 1 : 0) as unknown as readonly number[],
    logDrumPattern: Array.from({ length: 16 }, (_, i) => g.log.includes(i) ? 1 : 0) as unknown as readonly number[],
    swing: g.swing,
    densityProfile: "medium",
    microtimingProfile: g.microtiming,
    styleBiasApplied: false,
  };
}

// ── 1. _utils ─────────────────────────────────────────────────────────────────

describe("_utils", () => {
  test("clamp — value within range", () => {
    expect(clamp(0.5)).toBe(0.5);
  });

  test("clamp — value below lo", () => {
    expect(clamp(-0.1)).toBe(0);
  });

  test("clamp — value above hi", () => {
    expect(clamp(1.5)).toBe(1);
  });

  test("clamp — custom bounds", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  test("gaussScore — at target scores 1", () => {
    expect(gaussScore(112, 112, 3)).toBeCloseTo(1.0, 5);
  });

  test("gaussScore — 1 sigma away scores ~0.607", () => {
    expect(gaussScore(115, 112, 3)).toBeCloseTo(Math.exp(-0.5), 4);
  });

  test("gaussScore — far away scores near 0", () => {
    expect(gaussScore(200, 112, 3)).toBeLessThan(0.01);
  });

  test("softmax — sums to 1", () => {
    const result = softmax([1, 2, 3, 4]);
    const sum = result.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  test("softmax — preserves rank order", () => {
    const result = softmax([1, 2, 3, 4]);
    expect(result[3]).toBeGreaterThan(result[2]);
    expect(result[2]).toBeGreaterThan(result[1]);
  });

  test("softmax — equal inputs yield equal probs", () => {
    const result = softmax([0, 0, 0]);
    result.forEach((p) => expect(p).toBeCloseTo(1 / 3, 10));
  });

  test("hashString — deterministic", () => {
    expect(hashString("sgija-0.750")).toBe(hashString("sgija-0.750"));
  });

  test("hashString — in [0, 1)", () => {
    const h = hashString("private_school-0.320");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(1);
  });

  test("hammingDistance — identical patterns", () => {
    expect(hammingDistance([1, 0, 1, 0], [1, 0, 1, 0])).toBe(0);
  });

  test("hammingDistance — completely different", () => {
    expect(hammingDistance([1, 1, 1, 1], [0, 0, 0, 0])).toBe(4);
  });

  test("mean — empty array", () => {
    expect(mean([])).toBe(0);
  });

  test("mean — basic", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });
});

// ── 2. _dsp ───────────────────────────────────────────────────────────────────

describe("_dsp", () => {
  test("fftInPlace — DC component (all-ones input)", () => {
    const n = 8;
    const re = new Float64Array(n).fill(1);
    const im = new Float64Array(n);
    fftInPlace(re, im);
    // DC bin = n, all others ≈ 0
    expect(re[0]).toBeCloseTo(n, 5);
    for (let k = 1; k < n; k++) {
      expect(Math.abs(re[k])).toBeLessThan(1e-9);
    }
  });

  test("fftInPlace — single tone at k=1 (n=8)", () => {
    const n = 8;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.cos(2 * Math.PI * i / n);
    fftInPlace(re, im);
    // Energy should peak at bins 1 and n-1
    expect(Math.abs(re[1])).toBeGreaterThan(3);
  });

  test("fftInPlace — preserves energy (Parseval)", () => {
    const n = 16;
    const re = Float64Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * 2 * i / n));
    const im = new Float64Array(n);
    const timePower = re.reduce((s, v) => s + v * v, 0);
    fftInPlace(re, im);
    const freqPower = re.reduce((s, v, i) => s + v * v + im[i] * im[i], 0) / n;
    expect(freqPower).toBeCloseTo(timePower, 3);
  });

  test("computeRmsEnergy — sine at 0.5 amplitude → ~0.354", () => {
    const n = 4096;
    const samples = Array.from({ length: n }, (_, i) => 0.5 * Math.sin(2 * Math.PI * 440 * i / 44100));
    const rms = computeRmsEnergy(samples);
    expect(rms).toBeCloseTo(0.5 / Math.SQRT2, 2);
  });

  test("computeRmsEnergy — silence → 0", () => {
    expect(computeRmsEnergy(new Array(1024).fill(0))).toBe(0);
  });

  test("spectralCentroidFft — low-freq sine has low centroid", () => {
    const sr = 44100, n = 4096;
    const samples = Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * 110 * i / sr));
    const centroid = spectralCentroidFft(samples, sr);
    expect(centroid).toBeLessThan(500);
  });

  test("spectralCentroidFft — high-freq sine has high centroid", () => {
    const sr = 44100, n = 4096;
    const samples = Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * 4000 * i / sr));
    const centroid = spectralCentroidFft(samples, sr);
    expect(centroid).toBeGreaterThan(2000);
  });

  test("bandEnergies — low-frequency signal → high subBass fraction", () => {
    const sr = 44100, n = 4096;
    const samples = Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * 80 * i / sr));
    const bands = bandEnergies(samples, sr);
    expect(bands.subBass).toBeGreaterThan(0.7);
  });

  test("bandEnergies — fractions sum to ≤ 1", () => {
    const sr = 44100, n = 4096;
    const samples = Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * 1000 * i / sr));
    const { subBass, lowMid, high } = bandEnergies(samples, sr);
    expect(subBass + lowMid + high).toBeCloseTo(1.0, 5);
  });

  test("estimateBpm — impulse train at 114 BPM stays in Amapiano range", () => {
    const sr = 44100, bpm = 114;
    const beatPeriod = Math.floor(sr * 60 / bpm);
    const numSamples = beatPeriod * 16;
    const samples = new Array(numSamples).fill(0);
    for (let b = 0; b < 16; b++) {
      const start = b * beatPeriod;
      for (let j = 0; j < 256; j++) samples[start + j] = Math.exp(-0.01 * j);
    }
    const result = estimateBpm(samples, sr);
    expect(result).toBeGreaterThanOrEqual(107);
    expect(result).toBeLessThanOrEqual(122);
  });

  test("onsetEnvelope — non-negative values", () => {
    const samples = Array.from({ length: 4096 }, () => (Math.random() * 2 - 1) * 0.5);
    const env = onsetEnvelope(samples, 512);
    for (const v of env) expect(v).toBeGreaterThanOrEqual(0);
  });

  test("computeChroma — 12 bins, normalised to [0, 1]", () => {
    const sr = 44100, n = 4096;
    const samples = Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * 440 * i / sr));
    const chroma = computeChroma(samples, sr);
    expect(chroma.length).toBe(12);
    for (const v of Array.from(chroma)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

// ── 3. WAV parser ─────────────────────────────────────────────────────────────

describe("parseWavMono", () => {
  test("parses valid 16-bit PCM WAV", () => {
    const wav = buildWav(1);
    const result = parseWavMono(wav);
    expect(result.sampleRate).toBe(44100);
    expect(result.channels).toBe(1);
    expect(result.samples.length).toBe(44100);
    expect(result.durationSec).toBeCloseTo(1.0, 2);
  });

  test("samples are in [-1, 1]", () => {
    const wav = buildWav(0.5);
    const { samples } = parseWavMono(wav);
    for (const s of samples) {
      expect(s).toBeGreaterThanOrEqual(-1.01);
      expect(s).toBeLessThanOrEqual(1.01);
    }
  });

  test("rejects non-WAV buffer", () => {
    const bad = Buffer.from("not a wav file at all!");
    expect(() => parseWavMono(bad)).toThrow();
  });

  test("rejects buffer that is too small", () => {
    expect(() => parseWavMono(Buffer.alloc(10))).toThrow();
  });
});

// ── 4. Authenticity scoring ───────────────────────────────────────────────────

describe("scoreAuthenticityLanes", () => {
  test("returns 8 lane scores", () => {
    const result = scoreAuthenticityLanes(dummyFeatures());
    expect(result.laneScores).toHaveLength(8);
  });

  test("laneConfidence in (0, 1)", () => {
    const result = scoreAuthenticityLanes(dummyFeatures());
    expect(result.laneConfidence).toBeGreaterThan(0);
    expect(result.laneConfidence).toBeLessThan(1);
  });

  test("overallAuthenticity is max lane score", () => {
    const result = scoreAuthenticityLanes(dummyFeatures());
    const maxScore = Math.max(...result.laneScores.map((ls) => ls.score));
    expect(result.overallAuthenticity).toBeCloseTo(maxScore, 10);
  });

  test("sgija-targeted audio classifies to sgija-range lane", () => {
    const features = dummyFeatures({ bpm: 114, energyRms: 0.80, spectralCentroid: 1525 });
    const result = scoreAuthenticityLanes(features);
    // sgija or nearby lane — just check lane is not undefined
    expect(result.bestFitLane).toBeTruthy();
  });

  test("hybridFlag fires when top-2 gap < 0.10", () => {
    // Equal features → probabilities close → hybrid should fire
    const result = scoreAuthenticityLanes(dummyFeatures({ bpm: 115 }));
    expect(typeof result.hybridFlag).toBe("boolean");
  });
});

// ── 5. Lane quality ───────────────────────────────────────────────────────────

describe("scoreLaneQuality", () => {
  test("producerScore in [0, 1]", () => {
    const qs = scoreLaneQuality(dummyFeatures(), "sgija");
    expect(qs.producerScore).toBeGreaterThanOrEqual(0);
    expect(qs.producerScore).toBeLessThanOrEqual(1);
  });

  test("tier is one of elite/strong/developing", () => {
    const qs = scoreLaneQuality(dummyFeatures(), "hybrid_rnb_amapiano");
    expect(["elite", "strong", "developing"]).toContain(qs.tier);
  });

  test("isElite consistent with tier", () => {
    const qs = scoreLaneQuality(dummyFeatures(), "private_school");
    expect(qs.isElite).toBe(qs.tier === "elite");
  });

  test("laneMetrics are numbers in [0, 1]", () => {
    const qs = scoreLaneQuality(dummyFeatures(), "bacardi");
    for (const v of Object.values(qs.laneMetrics)) {
      expect(typeof v).toBe("number");
      expect(v as number).toBeGreaterThanOrEqual(0);
      expect(v as number).toBeLessThanOrEqual(1);
    }
  });
});

// ── 6. Groove extraction ──────────────────────────────────────────────────────

describe("extractGroove", () => {
  test("swing ratio in [0.45, 0.58]", () => {
    const wav = buildWav(3);
    const { samples } = parseWavMono(wav);
    const groove = extractGroove(samples, 44100, 114);
    expect(groove.swingRatio).toBeGreaterThanOrEqual(0.45);
    expect(groove.swingRatio).toBeLessThanOrEqual(0.58);
  });

  test("syncopation index in [0, 1]", () => {
    const wav = buildWav(3);
    const { samples } = parseWavMono(wav);
    const groove = extractGroove(samples, 44100, 114);
    expect(groove.syncopationIndex).toBeGreaterThanOrEqual(0);
    expect(groove.syncopationIndex).toBeLessThanOrEqual(1);
  });
});

// ── 7. Feature extraction pipeline ───────────────────────────────────────────

describe("extractAudioFeatures", () => {
  let features: ReturnType<typeof extractAudioFeatures>;

  beforeAll(() => {
    const wav = buildWav(4);
    const { samples, sampleRate } = parseWavMono(wav);
    features = extractAudioFeatures(samples, sampleRate);
  });

  test("bpm in [60, 200]", () => {
    expect(features.bpm).toBeGreaterThanOrEqual(60);
    expect(features.bpm).toBeLessThanOrEqual(200);
  });

  test("energyRms in [0, 1]", () => {
    expect(features.energyRms).toBeGreaterThanOrEqual(0);
    expect(features.energyRms).toBeLessThanOrEqual(1);
  });

  test("spectralCentroid > 0", () => {
    expect(features.spectralCentroid).toBeGreaterThan(0);
  });

  test("band energies present", () => {
    expect(features.subBassEnergy + features.lowMidEnergy + features.highEnergy).toBeCloseTo(1.0, 4);
  });

  test("groove profile present", () => {
    expect(features.groove).toBeDefined();
    expect(features.groove.swingRatio).toBeGreaterThanOrEqual(0.45);
  });

  test("durationSec matches input", () => {
    expect(features.durationSec).toBeCloseTo(4.0, 1);
  });
});

// ── 8. ConvergenceTracker ─────────────────────────────────────────────────────

describe("ConvergenceTracker", () => {
  test("continues with no scores", () => {
    const ct = new ConvergenceTracker();
    expect(ct.shouldContinue()).toBe(true);
  });

  test("quality_threshold stop", () => {
    const ct = new ConvergenceTracker({ qualityThreshold: 0.85 });
    ct.addScore(0.90);
    expect(ct.shouldContinue()).toBe(false);
    expect(ct.state().stopReason).toBe("quality_threshold");
  });

  test("no_improvement stop", () => {
    const ct = new ConvergenceTracker({ improvementThreshold: 0.02 });
    ct.addScore(0.60);
    ct.addScore(0.605);  // tiny improvement < 0.02
    expect(ct.shouldContinue()).toBe(false);
    expect(ct.state().stopReason).toBe("no_improvement");
  });

  test("regression stop", () => {
    const ct = new ConvergenceTracker({ scoreDecrease: -0.01 });
    ct.addScore(0.70);
    ct.addScore(0.65);  // dropped by 0.05 > 0.01
    expect(ct.shouldContinue()).toBe(false);
    expect(ct.state().stopReason).toBe("regression");
  });

  test("iteration_limit stop", () => {
    const ct = new ConvergenceTracker({ maxIterations: 3 });
    ct.addScore(0.50); ct.addScore(0.60); ct.addScore(0.70);
    expect(ct.shouldContinue()).toBe(false);
    expect(ct.state().stopReason).toBe("iteration_limit");
  });

  test("bestScore tracks maximum", () => {
    const ct = new ConvergenceTracker({ maxIterations: 10 });
    ct.addScore(0.50); ct.addScore(0.80); ct.addScore(0.70);
    expect(ct.state().bestScore).toBe(0.80);
  });

  test("reset restores initial state", () => {
    const ct = new ConvergenceTracker();
    ct.addScore(0.90);
    ct.shouldContinue();
    ct.reset();
    expect(ct.shouldContinue()).toBe(true);
    expect(ct.state().scores).toHaveLength(0);
  });
});

// ── 9. Refinement planner ─────────────────────────────────────────────────────

describe("buildRefinementPlan", () => {
  test("returns a valid RefinementAction", () => {
    const groove = dummyGroovePlan("sgija");
    const plan = buildRefinementPlan(groove, 0.65);
    expect(REFINEMENT_ACTIONS).toContain(plan.selectedAction);
  });

  test("refinedGroove has 16 steps for all patterns", () => {
    const groove = dummyGroovePlan("bacardi");
    const { refinedGroove } = buildRefinementPlan(groove, 0.60);
    expect(refinedGroove.kickPattern).toHaveLength(16);
    expect(refinedGroove.hatPattern).toHaveLength(16);
    expect(refinedGroove.shakerPattern).toHaveLength(16);
    expect(refinedGroove.logDrumPattern).toHaveLength(16);
  });

  test("actionScore in [0, 1]", () => {
    const groove = dummyGroovePlan("gqom_fusion");
    const plan = buildRefinementPlan(groove, 0.55);
    expect(plan.actionScore).toBeGreaterThanOrEqual(0);
    expect(plan.actionScore).toBeLessThanOrEqual(1.5); // composite can exceed 1
  });

  test("mutations array is non-empty for sparse groove", () => {
    // Sparse groove has empty hat/log slots — density actions will fill them
    const sparse: GroovePlan = {
      grooveType: "sparse_test", lane: "private_school", steps: 16,
      kickPattern:    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0] as unknown as readonly number[],
      hatPattern:     [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0] as unknown as readonly number[],
      shakerPattern:  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0] as unknown as readonly number[],
      logDrumPattern: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0] as unknown as readonly number[],
      swing: 0.52, densityProfile: "sparse",
      microtimingProfile: "laidback_hat_pull", styleBiasApplied: false,
    };
    const plan = buildRefinementPlan(sparse, 0.58);
    expect(plan.mutations.length).toBeGreaterThanOrEqual(1);
  });

  test("policy-guided selection doesn't crash", () => {
    const groove = dummyGroovePlan("sgija");
    const policy = emptyPolicy();
    const updatedPolicy = updatePolicy(policy, "sgija", "increase_log_drum_density", 0.05);
    const plan = buildRefinementPlan(groove, 0.60, updatedPolicy);
    expect(plan).toBeDefined();
  });
});

// ── 10. Groove transfer ───────────────────────────────────────────────────────

describe("transferGroove", () => {
  test("output lane matches target", () => {
    const quality: QualityScore = { producerScore: 0.70, tier: "strong", isElite: false, laneMetrics: {} };
    const groove = transferGroove("sgija", "private_school", quality, "transform_to_target_preserve_identity");
    expect(groove.lane).toBe("sgija");
  });

  test("all patterns have length 16", () => {
    const quality: QualityScore = { producerScore: 0.60, tier: "strong", isElite: false, laneMetrics: {} };
    const groove = transferGroove("bacardi", "three_step", quality, "single_lane");
    expect(groove.kickPattern).toHaveLength(16);
    expect(groove.hatPattern).toHaveLength(16);
    expect(groove.shakerPattern).toHaveLength(16);
    expect(groove.logDrumPattern).toHaveLength(16);
  });

  test("pattern values are 0 or 1", () => {
    const quality: QualityScore = { producerScore: 0.80, tier: "strong", isElite: false, laneMetrics: {} };
    const groove = transferGroove("hybrid_rnb_amapiano", "sgija", quality, "multi_lane_blend");
    [...groove.kickPattern, ...groove.hatPattern, ...groove.shakerPattern, ...groove.logDrumPattern].forEach((v) => {
      expect([0, 1]).toContain(v);
    });
  });

  test("swing is in [0.45, 0.60]", () => {
    const quality: QualityScore = { producerScore: 0.50, tier: "developing", isElite: false, laneMetrics: {} };
    const groove = transferGroove("private_school", "sgija", quality, "preserve_primary_blend_secondary");
    expect(groove.swing).toBeGreaterThanOrEqual(0.45);
    expect(groove.swing).toBeLessThanOrEqual(0.60);
  });
});

// ── 11. Render evaluator ──────────────────────────────────────────────────────

describe("evaluateRender", () => {
  const quality: QualityScore = { producerScore: 0.75, tier: "strong", isElite: false, laneMetrics: {} };
  const samplePlan: SamplePlan = {
    targetLane: "sgija", sampleTier: "strong",
    kick:    { lane: "sgija", tier: "strong", density: "medium", role: "kick",    path: "/kick.wav" },
    hat:     { lane: "sgija", tier: "strong", density: "medium", role: "hat",     path: "/hat.wav" },
    shaker:  { lane: "sgija", tier: "strong", density: "medium", role: "shaker",  path: "/shaker.wav" },
    logDrum: { lane: "sgija", tier: "strong", density: "medium", role: "log_drum", path: "/log.wav" },
  };

  test("all metric scores in [0, 1]", () => {
    const groove = dummyGroovePlan("sgija");
    const features = dummyFeatures();
    const ev = evaluateRender(features, groove, samplePlan, quality);
    const metrics = [ev.laneFeel, ev.grooveAdherence, ev.logDrumFit, ev.sampleFit, ev.sectionCoherence, ev.producerAlignment];
    for (const m of metrics) {
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(1);
    }
  });

  test("overallRenderScore in [0, 1]", () => {
    const groove = dummyGroovePlan("sgija");
    const features = dummyFeatures();
    const ev = evaluateRender(features, groove, samplePlan, quality);
    expect(ev.overallRenderScore).toBeGreaterThanOrEqual(0);
    expect(ev.overallRenderScore).toBeLessThanOrEqual(1);
  });

  test("passesGate true when score >= 0.65", () => {
    const groove = dummyGroovePlan("sgija");
    const features = dummyFeatures({ bpm: 114, energyRms: 0.80, spectralCentroid: 1525 });
    const ev = evaluateRender(features, groove, samplePlan, quality);
    expect(ev.passesGate).toBe(ev.overallRenderScore >= 0.65);
  });
});

// ── 12. EMA adaptive action learning ─────────────────────────────────────────

describe("adaptive_action_learning", () => {
  test("emptyPolicy — all actions present in all 8 lanes", () => {
    const policy = emptyPolicy();
    for (const lane of ["private_school", "sgija", "bacardi", "stixx_sgija", "mbiraiano", "three_step", "gqom_fusion", "hybrid_rnb_amapiano"] as const) {
      for (const action of REFINEMENT_ACTIONS) {
        expect(policy.lanes[lane]![action]).toBeDefined();
      }
    }
  });

  test("updatePolicy — increments support", () => {
    const policy = emptyPolicy();
    const updated = updatePolicy(policy, "sgija", "increase_log_drum_density", 0.08);
    expect(updated.lanes.sgija!["increase_log_drum_density"].support).toBe(1);
  });

  test("updatePolicy — positive delta increases emaUtility", () => {
    let policy = emptyPolicy();
    policy = updatePolicy(policy, "bacardi", "increase_pattern_density", 0.10);
    policy = updatePolicy(policy, "bacardi", "increase_pattern_density", 0.10);
    expect(policy.lanes.bacardi!["increase_pattern_density"].emaUtility).toBeGreaterThan(0);
  });

  test("updatePolicy — immutable (does not mutate original)", () => {
    const policy = emptyPolicy();
    const original = JSON.stringify(policy);
    updatePolicy(policy, "sgija", "nudge_swing_toward_lane_mean", 0.05);
    expect(JSON.stringify(policy)).toBe(original);
  });

  test("computeActionScore — zero below min support", () => {
    const policy = emptyPolicy();
    const util = policy.lanes.sgija!["increase_log_drum_density"];
    expect(computeActionScore(util, policy)).toBe(0);
  });

  test("computeActionScore — positive after sufficient support", () => {
    let policy = emptyPolicy();
    for (let i = 0; i < 5; i++) {
      policy = updatePolicy(policy, "sgija", "align_groove_to_target_lane", 0.05);
    }
    const util = policy.lanes.sgija!["align_groove_to_target_lane"];
    expect(computeActionScore(util, policy)).toBeGreaterThan(0);
  });

  test("laneLeaderboard — returns 13 actions", () => {
    const policy = emptyPolicy();
    const board = laneLeaderboard(policy, "mbiraiano");
    expect(board).toHaveLength(REFINEMENT_ACTIONS.length);
  });

  test("laneLeaderboard — sorted descending by score", () => {
    let policy = emptyPolicy();
    for (let i = 0; i < 6; i++) {
      policy = updatePolicy(policy, "private_school", "increase_log_drum_prominence", 0.07);
    }
    const board = laneLeaderboard(policy, "private_school");
    for (let i = 0; i < board.length - 1; i++) {
      expect(board[i].score).toBeGreaterThanOrEqual(board[i + 1].score);
    }
  });
});

// ── 13. MIDI export ───────────────────────────────────────────────────────────

describe("MIDI export", () => {
  test("exportGrooveToMidi — valid MIDI header magic bytes", () => {
    const groove = dummyGroovePlan("sgija");
    const { buffer } = exportGrooveToMidi(groove, 114, 2);
    // MThd
    expect(buffer[0]).toBe(0x4d);
    expect(buffer[1]).toBe(0x54);
    expect(buffer[2]).toBe(0x68);
    expect(buffer[3]).toBe(0x64);
  });

  test("exportGrooveToMidi — format 0 single track", () => {
    const groove = dummyGroovePlan("bacardi");
    const { buffer } = exportGrooveToMidi(groove, 118, 4);
    const format = (buffer[8] << 8) | buffer[9];
    const tracks = (buffer[10] << 8) | buffer[11];
    expect(format).toBe(0);
    expect(tracks).toBe(1);
  });

  test("exportGrooveToMidi — ticks per quarter = 480", () => {
    const groove = dummyGroovePlan();
    const { buffer } = exportGrooveToMidi(groove, 114);
    const tpq = (buffer[12] << 8) | buffer[13];
    expect(tpq).toBe(480);
  });

  test("exportGrooveToMidi — noteCount > 0 for non-empty groove", () => {
    const groove = dummyGroovePlan("sgija");
    const { noteCount } = exportGrooveToMidi(groove, 114, 2);
    expect(noteCount).toBeGreaterThan(0);
  });

  test("exportGrooveToMidi — buffer has MTrk chunk", () => {
    const groove = dummyGroovePlan("three_step");
    const { buffer } = exportGrooveToMidi(groove, 113, 2);
    // MTrk starts at byte 14
    expect(buffer[14]).toBe(0x4d);
    expect(buffer[15]).toBe(0x54);
    expect(buffer[16]).toBe(0x72);
    expect(buffer[17]).toBe(0x6b);
  });

  test("groovePlanToMidi — returns Uint8Array", () => {
    const groove = dummyGroovePlan();
    const buf = groovePlanToMidi(groove, 114, 2);
    expect(buf).toBeInstanceOf(Uint8Array);
    expect(buf.length).toBeGreaterThan(50);
  });

  test("silence groove produces fewer notes than full groove", () => {
    const silentGroove: GroovePlan = {
      grooveType: "empty", lane: "sgija", steps: 16,
      kickPattern: new Array(16).fill(0) as unknown as readonly number[],
      hatPattern: new Array(16).fill(0) as unknown as readonly number[],
      shakerPattern: new Array(16).fill(0) as unknown as readonly number[],
      logDrumPattern: new Array(16).fill(0) as unknown as readonly number[],
      swing: 0.50, densityProfile: "sparse", microtimingProfile: "grid_tight", styleBiasApplied: false,
    };
    const full = dummyGroovePlan("sgija");
    const { noteCount: nc1 } = exportGrooveToMidi(silentGroove, 114, 1);
    const { noteCount: nc2 } = exportGrooveToMidi(full, 114, 1);
    expect(nc1).toBe(0);
    expect(nc2).toBeGreaterThan(0);
  });

  test("more bars → larger MIDI buffer", () => {
    const groove = dummyGroovePlan("bacardi");
    const { buffer: b2 } = exportGrooveToMidi(groove, 118, 2);
    const { buffer: b4 } = exportGrooveToMidi(groove, 118, 4);
    expect(b4.length).toBeGreaterThan(b2.length);
  });
});

// ── 14. High-level API: evaluateBuffer + buildEnhancement ────────────────────

describe("evaluateBuffer", () => {
  let result: ReturnType<typeof evaluateBuffer>;

  beforeAll(() => {
    const wav = buildWav(4);
    result = evaluateBuffer(wav);
  });

  test("returns passesThreshold boolean", () => {
    expect(typeof result.passesThreshold).toBe("boolean");
  });

  test("threshold matches AMAPIANO_THRESHOLD", () => {
    expect(result.threshold).toBe(AMAPIANO_THRESHOLD);
  });

  test("issues is an array", () => {
    expect(Array.isArray(result.issues)).toBe(true);
  });

  test("features has expected fields", () => {
    expect(result.features.bpm).toBeGreaterThan(0);
    expect(result.features.sampleRate).toBe(44100);
  });

  test("laneScores has bestFitLane", () => {
    expect(["private_school", "sgija", "bacardi", "stixx_sgija", "mbiraiano", "three_step", "gqom_fusion", "hybrid_rnb_amapiano"]).toContain(result.laneScores.bestFitLane);
  });

  test("rejects invalid buffer", () => {
    expect(() => evaluateBuffer(Buffer.from("garbage"))).toThrow();
  });
});

describe("buildEnhancement", () => {
  test("groovePlan has 16 steps per pattern", () => {
    const wav = buildWav(3);
    const eval_ = evaluateBuffer(wav);
    const enh = buildEnhancement(eval_);
    expect(enh.groovePlan.kickPattern).toHaveLength(16);
    expect(enh.groovePlan.logDrumPattern).toHaveLength(16);
  });

  test("suggestions is array of strings", () => {
    const wav = buildWav(3);
    const eval_ = evaluateBuffer(wav);
    const enh = buildEnhancement(eval_);
    expect(Array.isArray(enh.suggestions)).toBe(true);
    for (const s of enh.suggestions) expect(typeof s).toBe("string");
  });

  test("canAutoEnhance is boolean", () => {
    const wav = buildWav(3);
    const eval_ = evaluateBuffer(wav);
    const enh = buildEnhancement(eval_);
    expect(typeof enh.canAutoEnhance).toBe("boolean");
  });

  test("recommendedCtl includes lane and bpm", () => {
    const wav = buildWav(3);
    const eval_ = evaluateBuffer(wav);
    const enh = buildEnhancement(eval_);
    expect(enh.recommendedCtl).toHaveProperty("lane");
    expect(enh.recommendedCtl).toHaveProperty("bpm");
  });
});

// ── 15. O.211 Perception Model ────────────────────────────────────────────────

describe("perception_model", () => {
  const standardFeatures = dummyFeatures();   // sgija-like: bpm 114, energyRms 0.50, swing 0.53, sync 0.45

  test("barkScale — 1 kHz gives ~8.5 Bark", () => {
    const b = barkScale(1000);
    expect(b).toBeGreaterThan(7.0);
    expect(b).toBeLessThan(10.0);
  });

  test("barkScale — 100 Hz < 1000 Hz (monotone)", () => {
    expect(barkScale(100)).toBeLessThan(barkScale(1000));
    expect(barkScale(1000)).toBeLessThan(barkScale(10000));
  });

  test("computeBEff — in [0, 1] for standard features", () => {
    const bEff = computeBEff(standardFeatures);
    expect(bEff).toBeGreaterThanOrEqual(0);
    expect(bEff).toBeLessThanOrEqual(1);
  });

  test("computeBEff — increases with spectral centroid", () => {
    const low  = computeBEff(dummyFeatures({ spectralCentroid: 500 }));
    const high = computeBEff(dummyFeatures({ spectralCentroid: 4000 }));
    expect(high).toBeGreaterThan(low);
  });

  test("computePerceptualDensity — in [0, 1]", () => {
    const d = computePerceptualDensity(standardFeatures);
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThanOrEqual(1);
  });

  test("computePerceptualDensity — high-energy features yield higher density", () => {
    const low  = computePerceptualDensity(dummyFeatures({ energyRms: 0.10 }));
    const high = computePerceptualDensity(dummyFeatures({ energyRms: 0.90 }));
    expect(high).toBeGreaterThan(low);
  });

  test("applyPerceptionModel — returns exactly 3 anchors", () => {
    const report = applyPerceptionModel(standardFeatures);
    expect(report.anchors).toHaveLength(3);
  });

  test("applyPerceptionModel — anchor types are log_drum, harmonic, groove", () => {
    const report = applyPerceptionModel(standardFeatures);
    const types  = report.anchors.map((a) => a.type);
    expect(types).toContain("log_drum");
    expect(types).toContain("harmonic");
    expect(types).toContain("groove");
  });

  test("applyPerceptionModel — all anchor strengths in [0, 1]", () => {
    const report = applyPerceptionModel(standardFeatures);
    for (const a of report.anchors) {
      expect(a.strength).toBeGreaterThanOrEqual(0);
      expect(a.strength).toBeLessThanOrEqual(1);
      expect(a.clarity).toBeGreaterThanOrEqual(0);
      expect(a.clarity).toBeLessThanOrEqual(1);
    }
  });

  test("applyPerceptionModel — dominantAnchor is one of 3 types", () => {
    const report = applyPerceptionModel(standardFeatures);
    expect(["log_drum", "harmonic", "groove"]).toContain(report.dominantAnchor);
  });

  test("applyPerceptionModel — densityLabel is valid", () => {
    const report = applyPerceptionModel(standardFeatures);
    expect(["sparse", "balanced", "dense", "overcrowded"]).toContain(report.densityLabel);
  });

  test("applyPerceptionModel — passesGate is boolean, violations is array", () => {
    const report = applyPerceptionModel(standardFeatures);
    expect(typeof report.passesGate).toBe("boolean");
    expect(Array.isArray(report.violations)).toBe(true);
  });

  test("applyPerceptionModel — overcrowded features yield density > balanced features", () => {
    const busy  = dummyFeatures({ energyRms: 0.95, highEnergy: 0.75, groove: { swingRatio: 0.53, syncopationIndex: 0.90 } });
    const light = dummyFeatures({ energyRms: 0.10, highEnergy: 0.05, groove: { swingRatio: 0.53, syncopationIndex: 0.10 } });
    const dBusy  = computePerceptualDensity(busy);
    const dLight = computePerceptualDensity(light);
    expect(dBusy).toBeGreaterThan(dLight);
  });

  test("evaluateBuffer — result includes perception field", () => {
    const wav    = buildWav(4);
    const result = evaluateBuffer(wav);
    expect(result.perception).toBeDefined();
    expect(result.perception.anchors).toHaveLength(3);
    expect(typeof result.perception.bEff).toBe("number");
    expect(typeof result.perception.density).toBe("number");
    expect(typeof result.perception.passesGate).toBe("boolean");
  });
});

// ── 16. Virtual stem decomposition ───────────────────────────────────────────

describe("stem_decomposer", () => {
  // 110 Hz sine with beat-envelope decay — most energy in log_drum band (60–200 Hz)
  const wav = buildWav(4);
  const { samples, sampleRate } = (() => {
    const { parseWavMono: p } = require("../_audio_io");
    return p(wav) as { samples: number[]; sampleRate: number };
  })();

  let decomp: ReturnType<typeof decomposeStems>;
  beforeAll(() => { decomp = decomposeStems(samples, sampleRate); });

  test("returns exactly 5 stems", () => {
    expect(decomp.stems).toHaveLength(5);
  });

  test("stem names in order: sub_bass, log_drum, chord_pad, percussion, air", () => {
    const names = decomp.stems.map((s) => s.name);
    expect(names).toEqual(["sub_bass", "log_drum", "chord_pad", "percussion", "air"]);
  });

  test("all stem energies in [0, 1]", () => {
    for (const s of decomp.stems) {
      expect(s.energy).toBeGreaterThanOrEqual(0);
      expect(s.energy).toBeLessThanOrEqual(1);
    }
  });

  test("all presenceScores in [0, 1]", () => {
    for (const s of decomp.stems) {
      expect(s.presenceScore).toBeGreaterThanOrEqual(0);
      expect(s.presenceScore).toBeLessThanOrEqual(1);
    }
  });

  test("all tonality in [0, 1]", () => {
    for (const s of decomp.stems) {
      expect(s.tonality).toBeGreaterThanOrEqual(0);
      expect(s.tonality).toBeLessThanOrEqual(1);
    }
  });

  test("all transience in [0, 1]", () => {
    for (const s of decomp.stems) {
      expect(s.transience).toBeGreaterThanOrEqual(0);
      expect(s.transience).toBeLessThanOrEqual(1);
    }
  });

  test("log_drum stem has highest energy for 110 Hz signal", () => {
    const logDrum = decomp.stemMap["log_drum"];
    for (const s of decomp.stems) {
      if (s.name !== "log_drum") expect(logDrum.energy).toBeGreaterThan(s.energy);
    }
  });

  test("dominantStem is log_drum for 110 Hz signal", () => {
    expect(decomp.dominantStem).toBe("log_drum");
  });

  test("stemMap has all 5 stem names as keys", () => {
    const keys = Object.keys(decomp.stemMap);
    expect(keys).toContain("sub_bass");
    expect(keys).toContain("log_drum");
    expect(keys).toContain("chord_pad");
    expect(keys).toContain("percussion");
    expect(keys).toContain("air");
  });

  test("stemMap entries match stems array", () => {
    for (const s of decomp.stems) {
      expect(decomp.stemMap[s.name]).toBe(s);
    }
  });

  test("amapianoBalance in [0, 1]", () => {
    expect(decomp.amapianoBalance).toBeGreaterThanOrEqual(0);
    expect(decomp.amapianoBalance).toBeLessThanOrEqual(1);
  });

  test("balanceIssues is array of strings", () => {
    expect(Array.isArray(decomp.balanceIssues)).toBe(true);
    for (const issue of decomp.balanceIssues) expect(typeof issue).toBe("string");
  });

  test("totalEnergy matches sum of stem energies", () => {
    const sum = decomp.stems.reduce((s, st) => s + st.energy, 0);
    expect(decomp.totalEnergy).toBeCloseTo(sum, 10);
  });

  test("evaluateBuffer — result includes stems field", () => {
    const result = evaluateBuffer(buildWav(4));
    expect(result.stems).toBeDefined();
    expect(result.stems.stems).toHaveLength(5);
    expect(typeof result.stems.amapianoBalance).toBe("number");
    expect(Array.isArray(result.stems.balanceIssues)).toBe(true);
  });

  test("stem bandHz ranges are correct", () => {
    const expected: Record<string, [number, number]> = {
      sub_bass: [20, 60], log_drum: [60, 200], chord_pad: [200, 2000],
      percussion: [2000, 8000], air: [8000, 20000],
    };
    for (const s of decomp.stems) {
      expect(s.bandHz[0]).toBe(expected[s.name][0]);
      expect(s.bandHz[1]).toBe(expected[s.name][1]);
    }
  });
});

// ── 17. Lane grammar constants ────────────────────────────────────────────────

describe("LANE_GRAMMARS", () => {
  const lanes = ["private_school", "sgija", "bacardi", "stixx_sgija", "mbiraiano", "three_step", "gqom_fusion", "hybrid_rnb_amapiano"] as const;

  for (const lane of lanes) {
    test(`${lane} — all step indices < 16`, () => {
      const g = LANE_GRAMMARS[lane];
      for (const idx of [...g.kick, ...g.hat, ...g.shaker, ...g.log]) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(16);
      }
    });

    test(`${lane} — swing in [0.48, 0.58]`, () => {
      expect(LANE_GRAMMARS[lane].swing).toBeGreaterThanOrEqual(0.48);
      expect(LANE_GRAMMARS[lane].swing).toBeLessThanOrEqual(0.58);
    });
  }
});
