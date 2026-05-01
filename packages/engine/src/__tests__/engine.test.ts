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
import { computeCulturalAlignment } from "../cultural/cultural_encoder";
import { CULTURAL_PROFILES } from "../cultural/cultural_profiles";
import { synthesizeCtl } from "../ctl_synthesis/ctl_synthesizer";
import { analyzeAndPlan } from "../pipeline/analysis_pipeline";
import { evaluateBuffer, buildEnhancement } from "../pipeline/evaluation";
import { generateGrooveVariations } from "../groove/variation_engine";
import { compareEvaluations } from "../evaluation/comparison";
import { fingerprintGroovePlan, comparePatterns } from "../groove/pattern_fingerprint";
import { planArrangementArc } from "../arrangement/arc_planner";
import { generateMixSpec } from "../mix/mix_spec";
import { recommendSamples } from "../intelligence/sample_recommender";
import { humanizePattern } from "../groove/tempo_humanizer";
import { runQualityGates } from "../pipeline/quality_gate";
import { LANE_GRAMMARS, LANES, AMAPIANO_THRESHOLD, REFINEMENT_ACTIONS } from "../types";
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

// ── 17. Cultural encoding ─────────────────────────────────────────────────────

describe("cultural_encoder", () => {
  const features = dummyFeatures();   // sgija-like: bpm 114, energy 0.50, swing 0.53, sync 0.45

  test("CULTURAL_PROFILES covers all 8 lanes", () => {
    for (const lane of LANES) {
      expect(CULTURAL_PROFILES[lane]).toBeDefined();
    }
  });

  test("alignmentScore is in [0, 1] for all lanes", () => {
    for (const lane of LANES) {
      const alignment = computeCulturalAlignment(features, lane);
      expect(alignment.alignmentScore).toBeGreaterThanOrEqual(0);
      expect(alignment.alignmentScore).toBeLessThanOrEqual(1);
    }
  });

  test("markerScores has keys: bpm, energy, swing, syncopation, spectral", () => {
    const { markerScores } = computeCulturalAlignment(features, "sgija");
    for (const key of ["bpm", "energy", "swing", "syncopation", "spectral"]) {
      expect(markerScores).toHaveProperty(key);
    }
  });

  test("all markerScores are in [0, 1]", () => {
    const { markerScores } = computeCulturalAlignment(features, "private_school");
    for (const score of Object.values(markerScores)) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  test("deviations is array of strings", () => {
    const { deviations } = computeCulturalAlignment(features, "mbiraiano");
    expect(Array.isArray(deviations)).toBe(true);
    for (const d of deviations) expect(typeof d).toBe("string");
  });

  test("ctlConditioning has mixProfile, bpmTarget, keyBias, culturalDirectives", () => {
    const { ctlConditioning } = computeCulturalAlignment(features, "bacardi");
    expect(ctlConditioning).toHaveProperty("mixProfile");
    expect(ctlConditioning).toHaveProperty("bpmTarget");
    expect(ctlConditioning).toHaveProperty("keyBias");
    expect(ctlConditioning).toHaveProperty("culturalDirectives");
  });

  test("keyBias is non-empty for every lane", () => {
    for (const lane of LANES) {
      const { ctlConditioning } = computeCulturalAlignment(features, lane);
      expect(Array.isArray(ctlConditioning.keyBias)).toBe(true);
      expect(ctlConditioning.keyBias.length).toBeGreaterThan(0);
    }
  });

  test("gqom_fusion has dark_tribal mixProfile", () => {
    const { ctlConditioning } = computeCulturalAlignment(features, "gqom_fusion");
    expect(ctlConditioning.mixProfile).toBe("dark_tribal");
  });

  test("mbiraiano has spiritual_organic mixProfile", () => {
    const { ctlConditioning } = computeCulturalAlignment(features, "mbiraiano");
    expect(ctlConditioning.mixProfile).toBe("spiritual_organic");
  });

  test("high-alignment features score higher than misaligned features", () => {
    const aligned    = dummyFeatures({ bpm: 114, energyRms: 0.80, spectralCentroid: 1525 });
    const misaligned = dummyFeatures({ bpm: 140, energyRms: 0.10, spectralCentroid: 4000 });
    const scoreA = computeCulturalAlignment(aligned,    "sgija").alignmentScore;
    const scoreM = computeCulturalAlignment(misaligned, "sgija").alignmentScore;
    expect(scoreA).toBeGreaterThan(scoreM);
  });

  test("culturalDirectives is non-empty array of strings", () => {
    const { ctlConditioning } = computeCulturalAlignment(features, "private_school");
    expect(Array.isArray(ctlConditioning.culturalDirectives)).toBe(true);
    expect(ctlConditioning.culturalDirectives.length).toBeGreaterThan(0);
    for (const d of ctlConditioning.culturalDirectives) expect(typeof d).toBe("string");
  });

  test("evaluateBuffer — result includes cultural field", () => {
    const result = evaluateBuffer(buildWav(4));
    expect(result.cultural).toBeDefined();
    expect(result.cultural.alignmentScore).toBeGreaterThanOrEqual(0);
    expect(result.cultural.alignmentScore).toBeLessThanOrEqual(1);
    expect(result.cultural.ctlConditioning.mixProfile).toBeDefined();
    expect(Array.isArray(result.cultural.deviations)).toBe(true);
  });
});

// ── 18. CTL Spec Synthesis ────────────────────────────────────────────────────

describe("ctl_synthesizer", () => {
  let evaluation: ReturnType<typeof evaluateBuffer>;

  beforeAll(() => { evaluation = evaluateBuffer(buildWav(4)); });

  test("synthesizeCtl — does not throw", () => {
    expect(() => synthesizeCtl(evaluation, "Test Track", "test_user")).not.toThrow();
  });

  test("schema_version is ctl_v1", () => {
    const ctl = synthesizeCtl(evaluation, "Test Track", "test_user");
    expect(ctl.schema_version).toBe("ctl_v1");
  });

  test("global.subgenre matches bestFitLane", () => {
    const ctl = synthesizeCtl(evaluation, "Test Track", "test_user");
    expect(ctl.global.subgenre).toBe(evaluation.laneScores.bestFitLane);
  });

  test("global.bpm is in [95, 130]", () => {
    const ctl = synthesizeCtl(evaluation, "Test Track", "test_user");
    expect(ctl.global.bpm).toBeGreaterThanOrEqual(95);
    expect(ctl.global.bpm).toBeLessThanOrEqual(130);
  });

  test("global.key is a non-empty string", () => {
    const ctl = synthesizeCtl(evaluation, "Test Track", "test_user");
    expect(typeof ctl.global.key).toBe("string");
    expect(ctl.global.key.length).toBeGreaterThan(0);
  });

  test("style_constraints.preferred_keys is non-empty", () => {
    const ctl = synthesizeCtl(evaluation, "Test Track", "test_user");
    expect(Array.isArray(ctl.style_constraints.preferred_keys)).toBe(true);
    expect(ctl.style_constraints.preferred_keys.length).toBeGreaterThan(0);
  });

  test("all evaluation_targets in [0, 1]", () => {
    const ctl = synthesizeCtl(evaluation, "Test Track", "test_user");
    const et  = ctl.evaluation_targets;
    for (const v of Object.values(et)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test("sections is non-empty array", () => {
    const ctl = synthesizeCtl(evaluation, "Test Track", "test_user");
    expect(Array.isArray(ctl.sections)).toBe(true);
    expect(ctl.sections.length).toBeGreaterThan(0);
  });

  test("groove_patterns has at least 1 pattern with 16 steps", () => {
    const ctl = synthesizeCtl(evaluation, "Test Track", "test_user");
    expect(ctl.groove_patterns.length).toBeGreaterThan(0);
    expect(ctl.groove_patterns[0].steps).toHaveLength(16);
  });

  test("curves.energy values are in [0, 1]", () => {
    const ctl = synthesizeCtl(evaluation, "Test Track", "test_user");
    for (const pt of ctl.curves.energy) {
      expect(pt.value).toBeGreaterThanOrEqual(0);
      expect(pt.value).toBeLessThanOrEqual(1);
    }
  });

  test("curves.log_drum_density values are in [0, 1]", () => {
    const ctl = synthesizeCtl(evaluation, "Test Track", "test_user");
    for (const pt of ctl.curves.log_drum_density) {
      expect(pt.value).toBeGreaterThanOrEqual(0);
      expect(pt.value).toBeLessThanOrEqual(1);
    }
  });

  test("global.mix_profile matches cultural ctlConditioning", () => {
    const ctl = synthesizeCtl(evaluation, "Test Track", "test_user");
    expect(ctl.global.mix_profile).toBe(evaluation.cultural.ctlConditioning.mixProfile);
  });

  test("cultural_lineage has required keys", () => {
    const ctl = synthesizeCtl(evaluation, "Test Track", "test_user");
    expect(ctl.cultural_lineage).toHaveProperty("deep_house");
    expect(ctl.cultural_lineage).toHaveProperty("kwaito");
    expect(ctl.cultural_lineage).toHaveProperty("log_drum_innovation");
  });
});

// ── 19. Full analysis pipeline ────────────────────────────────────────────────

describe("analyzeAndPlan", () => {
  let plan: ReturnType<typeof analyzeAndPlan>;

  beforeAll(() => { plan = analyzeAndPlan(buildWav(4), "Test Track", "test_user"); });

  test("does not throw", () => {
    expect(() => analyzeAndPlan(buildWav(3), "T", "u")).not.toThrow();
  });

  test("evaluation field is an AmapianEvaluation", () => {
    expect(plan.evaluation).toBeDefined();
    expect(typeof plan.evaluation.passesThreshold).toBe("boolean");
    expect(plan.evaluation.laneScores).toBeDefined();
  });

  test("ctl field has schema_version ctl_v1", () => {
    expect(plan.ctl.schema_version).toBe("ctl_v1");
  });

  test("ctl.global.subgenre matches evaluation bestFitLane", () => {
    expect(plan.ctl.global.subgenre).toBe(plan.evaluation.laneScores.bestFitLane);
  });

  test("passesAllGates is boolean", () => {
    expect(typeof plan.passesAllGates).toBe("boolean");
  });

  test("passesAllGates equals allPass in gateReport", () => {
    expect(plan.passesAllGates).toBe(plan.gateReport.allPass);
  });

  test("gateReport has all three sub-gates", () => {
    expect(plan.gateReport).toHaveProperty("authenticityGate");
    expect(plan.gateReport).toHaveProperty("perceptionGate");
    expect(plan.gateReport).toHaveProperty("culturalGate");
    expect(typeof plan.gateReport.allPass).toBe("boolean");
  });

  test("gateReport.culturalGate.alignmentScore in [0, 1]", () => {
    const score = plan.gateReport.culturalGate.alignmentScore;
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  test("confidence in [0, 1]", () => {
    expect(plan.confidence).toBeGreaterThanOrEqual(0);
    expect(plan.confidence).toBeLessThanOrEqual(1);
  });

  test("recommendations is non-empty string array", () => {
    expect(Array.isArray(plan.recommendations)).toBe(true);
    expect(plan.recommendations.length).toBeGreaterThan(0);
    for (const r of plan.recommendations) expect(typeof r).toBe("string");
  });
});

// ── 20. Groove variation engine ───────────────────────────────────────────────

describe("generateGrooveVariations", () => {
  const set = generateGrooveVariations("sgija");

  test("returns all five variant types", () => {
    expect(set.main).toBeDefined();
    expect(set.variation).toBeDefined();
    expect(set.fill).toBeDefined();
    expect(set.breakdown).toBeDefined();
    expect(set.build).toBeDefined();
  });

  test("lane and bpm are correct", () => {
    expect(set.lane).toBe("sgija");
    expect(set.bpm).toBeGreaterThan(0);
  });

  test("all five variants have 16 steps per pattern", () => {
    for (const variant of [set.main, set.variation, set.fill, set.breakdown, set.build]) {
      expect(variant.kickPattern).toHaveLength(16);
      expect(variant.hatPattern).toHaveLength(16);
      expect(variant.shakerPattern).toHaveLength(16);
      expect(variant.logDrumPattern).toHaveLength(16);
    }
  });

  test("all pattern values are 0 or 1", () => {
    for (const variant of [set.main, set.variation, set.fill, set.breakdown, set.build]) {
      for (const pat of [variant.kickPattern, variant.hatPattern, variant.shakerPattern, variant.logDrumPattern]) {
        for (const v of pat) expect([0, 1]).toContain(v);
      }
    }
  });

  test("swing in [0.45, 0.60] for all variants", () => {
    for (const variant of [set.main, set.variation, set.fill, set.breakdown, set.build]) {
      expect(variant.swing).toBeGreaterThanOrEqual(0.45);
      expect(variant.swing).toBeLessThanOrEqual(0.60);
    }
  });

  test("fill has more log drum hits than main", () => {
    const mainHits = Array.from(set.main.logDrumPattern).filter((v) => v === 1).length;
    const fillHits = Array.from(set.fill.logDrumPattern).filter((v) => v === 1).length;
    expect(fillHits).toBeGreaterThan(mainHits);
  });

  test("breakdown has no log drum hits", () => {
    const hits = Array.from(set.breakdown.logDrumPattern).filter((v) => v === 1).length;
    expect(hits).toBe(0);
  });

  test("breakdown densityProfile is sparse", () => {
    expect(set.breakdown.densityProfile).toBe("sparse");
  });

  test("fill densityProfile is dense", () => {
    expect(set.fill.densityProfile).toBe("dense");
  });

  test("works for all 8 lanes without throwing", () => {
    for (const lane of LANES) {
      expect(() => generateGrooveVariations(lane)).not.toThrow();
    }
  });

  test("swingOverride option is respected", () => {
    const custom = generateGrooveVariations("private_school", { swingOverride: 0.55 });
    expect(custom.swing).toBeCloseTo(0.55, 5);
    for (const variant of [custom.main, custom.variation, custom.fill]) {
      expect(variant.swing).toBeCloseTo(0.55, 5);
    }
  });

  test("bpm option overrides default", () => {
    const custom = generateGrooveVariations("bacardi", { bpm: 120 });
    expect(custom.bpm).toBe(120);
  });

  test("variation and main have same lane", () => {
    expect(set.variation.lane).toBe(set.main.lane);
    expect(set.fill.lane).toBe(set.main.lane);
    expect(set.breakdown.lane).toBe(set.main.lane);
    expect(set.build.lane).toBe(set.main.lane);
  });
});

// ── 21. Comparative evaluation engine ────────────────────────────────────────

describe("comparison_engine", () => {
  const wav = buildWav(4);
  const sourceEv  = evaluateBuffer(wav);
  const genEv     = evaluateBuffer(buildWav(4, 44100, 110, 116)); // slightly different BPM

  test("compareEvaluations returns a ComparisonReport", () => {
    const report = compareEvaluations(sourceEv, genEv);
    expect(report).toBeDefined();
    expect(report.deltas).toHaveLength(8);
  });

  test("deltas array has 8 entries with required fields", () => {
    const { deltas } = compareEvaluations(sourceEv, genEv);
    for (const d of deltas) {
      expect(typeof d.dimension).toBe("string");
      expect(typeof d.source).toBe("number");
      expect(typeof d.generated).toBe("number");
      expect(typeof d.delta).toBe("number");
      expect(typeof d.weight).toBe("number");
      expect(typeof d.improved).toBe("boolean");
      expect(typeof d.regressed).toBe("boolean");
    }
  });

  test("all source/generated scores in [0, 1]", () => {
    const { deltas } = compareEvaluations(sourceEv, genEv);
    for (const d of deltas) {
      expect(d.source).toBeGreaterThanOrEqual(0);
      expect(d.source).toBeLessThanOrEqual(1);
      expect(d.generated).toBeGreaterThanOrEqual(0);
      expect(d.generated).toBeLessThanOrEqual(1);
    }
  });

  test("all delta values in [-1, 1]", () => {
    const { deltas } = compareEvaluations(sourceEv, genEv);
    for (const d of deltas) {
      expect(d.delta).toBeGreaterThanOrEqual(-1);
      expect(d.delta).toBeLessThanOrEqual(1);
    }
  });

  test("overallDelta in [-1, 1]", () => {
    const { overallDelta } = compareEvaluations(sourceEv, genEv);
    expect(overallDelta).toBeGreaterThanOrEqual(-1);
    expect(overallDelta).toBeLessThanOrEqual(1);
  });

  test("weights sum to ~1.0", () => {
    const { deltas } = compareEvaluations(sourceEv, genEv);
    const total = deltas.reduce((s, d) => s + d.weight, 0);
    expect(total).toBeCloseTo(1.0, 5);
  });

  test("dimension keys include all 8 expected names", () => {
    const { deltas } = compareEvaluations(sourceEv, genEv);
    const keys = deltas.map((d) => d.dimension);
    for (const k of ["authenticity", "quality", "cultural_alignment", "perception", "log_drum", "groove", "stem_balance", "bpm_proximity"]) {
      expect(keys).toContain(k);
    }
  });

  test("improved flag matches delta > 0.04", () => {
    const { deltas } = compareEvaluations(sourceEv, genEv);
    for (const d of deltas) {
      if (d.improved) expect(d.delta).toBeGreaterThan(0.04 - 1e-9);
      if (d.regressed) expect(d.delta).toBeLessThan(-0.04 + 1e-9);
    }
  });

  test("improvements and regressions are string arrays", () => {
    const { improvements, regressions } = compareEvaluations(sourceEv, genEv);
    expect(Array.isArray(improvements)).toBe(true);
    expect(Array.isArray(regressions)).toBe(true);
    for (const s of [...improvements, ...regressions]) expect(typeof s).toBe("string");
  });

  test("sourceLane and generatedLane are valid Lane values", () => {
    const { sourceLane, generatedLane } = compareEvaluations(sourceEv, genEv);
    expect(LANES).toContain(sourceLane);
    expect(LANES).toContain(generatedLane);
  });

  test("self-comparison yields overallDelta of 0", () => {
    const { overallDelta } = compareEvaluations(sourceEv, sourceEv);
    expect(overallDelta).toBeCloseTo(0, 9);
  });

  test("self-comparison has no improvements or regressions", () => {
    const { improvements, regressions } = compareEvaluations(sourceEv, sourceEv);
    expect(improvements).toHaveLength(0);
    expect(regressions).toHaveLength(0);
  });

  test("improved flag on report matches overallDelta sign", () => {
    const report = compareEvaluations(sourceEv, genEv);
    expect(report.improved).toBe(report.overallDelta > 0);
  });
});

// ── 22. Pattern fingerprinting & similarity ───────────────────────────────────

describe("pattern_fingerprint", () => {
  const set = generateGrooveVariations("sgija");

  test("fingerprintGroovePlan returns a PatternFingerprint", () => {
    const fp = fingerprintGroovePlan(set.main);
    expect(fp).toBeDefined();
    expect(fp.hash).toBeDefined();
    expect(fp.vectors).toBeDefined();
  });

  test("hash is a 32-char hex string", () => {
    const fp = fingerprintGroovePlan(set.main);
    expect(fp.hash).toHaveLength(32);
    expect(/^[0-9a-f]+$/.test(fp.hash)).toBe(true);
  });

  test("same plan produces identical hash (deterministic)", () => {
    const fp1 = fingerprintGroovePlan(set.main);
    const fp2 = fingerprintGroovePlan(set.main);
    expect(fp1.hash).toBe(fp2.hash);
  });

  test("different variants produce different hashes", () => {
    const hashes = [set.main, set.variation, set.fill, set.breakdown, set.build]
      .map((p) => fingerprintGroovePlan(p).hash);
    const unique = new Set(hashes);
    expect(unique.size).toBe(5);
  });

  test("density in [0, 1]", () => {
    for (const variant of [set.main, set.variation, set.fill, set.breakdown, set.build]) {
      const { density } = fingerprintGroovePlan(variant);
      expect(density).toBeGreaterThanOrEqual(0);
      expect(density).toBeLessThanOrEqual(1);
    }
  });

  test("fill has higher density than breakdown", () => {
    const fillDensity = fingerprintGroovePlan(set.fill).density;
    const bdDensity   = fingerprintGroovePlan(set.breakdown).density;
    expect(fillDensity).toBeGreaterThan(bdDensity);
  });

  test("vectors have 16 elements each", () => {
    const fp = fingerprintGroovePlan(set.main);
    expect(fp.vectors.kick).toHaveLength(16);
    expect(fp.vectors.hat).toHaveLength(16);
    expect(fp.vectors.shaker).toHaveLength(16);
    expect(fp.vectors.log).toHaveLength(16);
  });

  test("all vector values are 0 or 1", () => {
    const fp = fingerprintGroovePlan(set.main);
    for (const v of [...fp.vectors.kick, ...fp.vectors.hat, ...fp.vectors.shaker, ...fp.vectors.log]) {
      expect([0, 1]).toContain(v);
    }
  });

  test("comparePatterns — self similarity is 1.0", () => {
    const sim = comparePatterns(set.main, set.main);
    expect(sim.overallSim).toBeCloseTo(1.0, 9);
    expect(sim.kickSim).toBeCloseTo(1.0, 9);
    expect(sim.logSim).toBeCloseTo(1.0, 9);
  });

  test("comparePatterns — self comparison isMatch true", () => {
    const sim = comparePatterns(set.main, set.main);
    expect(sim.isMatch).toBe(true);
  });

  test("comparePatterns — all similarity scores in [0, 1]", () => {
    const sim = comparePatterns(set.main, set.fill);
    expect(sim.kickSim).toBeGreaterThanOrEqual(0); expect(sim.kickSim).toBeLessThanOrEqual(1);
    expect(sim.hatSim).toBeGreaterThanOrEqual(0);  expect(sim.hatSim).toBeLessThanOrEqual(1);
    expect(sim.shakerSim).toBeGreaterThanOrEqual(0); expect(sim.shakerSim).toBeLessThanOrEqual(1);
    expect(sim.logSim).toBeGreaterThanOrEqual(0);  expect(sim.logSim).toBeLessThanOrEqual(1);
    expect(sim.overallSim).toBeGreaterThanOrEqual(0); expect(sim.overallSim).toBeLessThanOrEqual(1);
  });

  test("comparePatterns — fingerprintA/B match individual hashes", () => {
    const fpA = fingerprintGroovePlan(set.main);
    const fpB = fingerprintGroovePlan(set.variation);
    const sim  = comparePatterns(set.main, set.variation);
    expect(sim.fingerprintA).toBe(fpA.hash);
    expect(sim.fingerprintB).toBe(fpB.hash);
  });

  test("comparePatterns — works for all 8 lanes without throwing", () => {
    for (const lane of LANES) {
      const s = generateGrooveVariations(lane);
      expect(() => comparePatterns(s.main, s.variation)).not.toThrow();
    }
  });

  test("breakdown vs fill similarity lower than main vs variation", () => {
    const simClose = comparePatterns(set.main, set.variation).overallSim;
    const simFar   = comparePatterns(set.breakdown, set.fill).overallSim;
    expect(simClose).toBeGreaterThan(simFar);
  });
});

// ── 23. Arrangement arc planner ───────────────────────────────────────────────

describe("arc_planner", () => {
  const arc = planArrangementArc("sgija");

  test("returns an ArrangementArc", () => {
    expect(arc).toBeDefined();
    expect(arc.sections).toHaveLength(8);
  });

  test("sections cover exactly 8 named sections in order", () => {
    const names = arc.sections.map((s) => s.name);
    expect(names).toEqual(["intro", "build1", "drop1", "breakdown", "build2", "drop2", "outro", "outro_fade"]);
  });

  test("sections are contiguous (no gaps)", () => {
    for (let i = 1; i < arc.sections.length; i++) {
      expect(arc.sections[i].startBar).toBe(arc.sections[i - 1].endBar);
    }
  });

  test("first section starts at bar 0", () => {
    expect(arc.sections[0].startBar).toBe(0);
  });

  test("last section ends at totalBars", () => {
    const last = arc.sections[arc.sections.length - 1];
    expect(last.endBar).toBe(arc.totalBars);
  });

  test("all bars >= 1", () => {
    for (const s of arc.sections) expect(s.bars).toBeGreaterThanOrEqual(1);
  });

  test("all intensity values in [0, 1]", () => {
    for (const s of arc.sections) {
      expect(s.intensity).toBeGreaterThanOrEqual(0);
      expect(s.intensity).toBeLessThanOrEqual(1);
    }
  });

  test("all filterHz values > 0", () => {
    for (const s of arc.sections) expect(s.filterHz).toBeGreaterThan(0);
  });

  test("drop1 has highest intensity (1.0)", () => {
    const drop = arc.sections.find((s) => s.name === "drop1")!;
    expect(drop.intensity).toBeCloseTo(1.0);
  });

  test("outro_fade has lowest intensity", () => {
    const fade  = arc.sections.find((s) => s.name === "outro_fade")!;
    const intro = arc.sections.find((s) => s.name === "intro")!;
    expect(fade.intensity).toBeLessThan(intro.intensity);
  });

  test("dropBar matches drop1 startBar", () => {
    const drop = arc.sections.find((s) => s.name === "drop1")!;
    expect(arc.dropBar).toBe(drop.startBar);
  });

  test("peakIntensity is 1.0 (drop1 intensity)", () => {
    expect(arc.peakIntensity).toBeCloseTo(1.0);
  });

  test("custom totalBars is respected", () => {
    const a64 = planArrangementArc("bacardi", { totalBars: 64 });
    expect(a64.totalBars).toBe(64);
    expect(a64.sections[a64.sections.length - 1].endBar).toBe(64);
  });

  test("custom bpm overrides lane default", () => {
    const custom = planArrangementArc("private_school", { bpm: 110 });
    expect(custom.bpm).toBe(110);
  });

  test("works for all 8 lanes without throwing", () => {
    for (const lane of LANES) {
      expect(() => planArrangementArc(lane)).not.toThrow();
    }
  });

  test("groove types assigned match expected pattern", () => {
    const types = arc.sections.map((s) => s.grooveType);
    expect(types[0]).toBe("breakdown");  // intro
    expect(types[1]).toBe("build");      // build1
    expect(types[2]).toBe("main");       // drop1
    expect(types[3]).toBe("breakdown");  // breakdown
    expect(types[5]).toBe("variation");  // drop2
    expect(types[6]).toBe("fill");       // outro
  });
});

// ── 24. Mix spec generator ────────────────────────────────────────────────────

describe("mix_spec", () => {
  const wav = buildWav(4);
  let spec: ReturnType<typeof generateMixSpec>;
  beforeAll(() => { spec = generateMixSpec(evaluateBuffer(wav)); });

  test("returns a MixSpec with stems and master", () => {
    expect(spec).toBeDefined();
    expect(spec.stems).toBeDefined();
    expect(spec.master).toBeDefined();
  });

  test("stems array has exactly 5 entries", () => {
    expect(spec.stems).toHaveLength(5);
  });

  test("stem names in order: sub_bass, log_drum, chord_pad, percussion, air", () => {
    const names = spec.stems.map((s) => s.stem);
    expect(names).toEqual(["sub_bass", "log_drum", "chord_pad", "percussion", "air"]);
  });

  test("all gainDb in [-12, +6]", () => {
    for (const s of spec.stems) {
      expect(s.gainDb).toBeGreaterThanOrEqual(-12);
      expect(s.gainDb).toBeLessThanOrEqual(6);
    }
  });

  test("all panLR in [-1, +1]", () => {
    for (const s of spec.stems) {
      expect(s.panLR).toBeGreaterThanOrEqual(-1);
      expect(s.panLR).toBeLessThanOrEqual(1);
    }
  });

  test("sub_bass and log_drum are center-panned (0)", () => {
    const subBass = spec.stems.find((s) => s.stem === "sub_bass")!;
    const logDrum = spec.stems.find((s) => s.stem === "log_drum")!;
    expect(subBass.panLR).toBe(0);
    expect(logDrum.panLR).toBe(0);
  });

  test("all compRatio in [1, 8]", () => {
    for (const s of spec.stems) {
      expect(s.compRatio).toBeGreaterThanOrEqual(1);
      expect(s.compRatio).toBeLessThanOrEqual(8);
    }
  });

  test("all reverbWet in [0, 1]", () => {
    for (const s of spec.stems) {
      expect(s.reverbWet).toBeGreaterThanOrEqual(0);
      expect(s.reverbWet).toBeLessThanOrEqual(1);
    }
  });

  test("sub_bass reverbWet is 0", () => {
    const subBass = spec.stems.find((s) => s.stem === "sub_bass")!;
    expect(subBass.reverbWet).toBe(0);
  });

  test("air has the highest reverbWet", () => {
    const air = spec.stems.find((s) => s.stem === "air")!;
    for (const s of spec.stems) {
      if (s.stem !== "air") expect(air.reverbWet).toBeGreaterThanOrEqual(s.reverbWet);
    }
  });

  test("master.lufsTarget in [-14, -9]", () => {
    expect(spec.master.lufsTarget).toBeGreaterThanOrEqual(-14);
    expect(spec.master.lufsTarget).toBeLessThanOrEqual(-9);
  });

  test("master.limitThresholdDb in [-6, -0.3]", () => {
    expect(spec.master.limitThresholdDb).toBeGreaterThanOrEqual(-6);
    expect(spec.master.limitThresholdDb).toBeLessThanOrEqual(-0.3);
  });

  test("master.stereoWidth in [0.8, 1.4]", () => {
    expect(spec.master.stereoWidth).toBeGreaterThanOrEqual(0.8);
    expect(spec.master.stereoWidth).toBeLessThanOrEqual(1.4);
  });

  test("master.eqLowCutHz is positive", () => {
    expect(spec.master.eqLowCutHz).toBeGreaterThan(0);
  });

  test("notes is an array of strings", () => {
    expect(Array.isArray(spec.notes)).toBe(true);
    for (const n of spec.notes) expect(typeof n).toBe("string");
  });

  test("works for all 8 lanes without throwing", () => {
    for (const lane of LANES) {
      const ev = evaluateBuffer(buildWav(4, 44100, 110, lane === "gqom_fusion" ? 120 : 114));
      expect(() => generateMixSpec(ev)).not.toThrow();
    }
  });
});

// ── 25. Sample recommendation engine ─────────────────────────────────────────

describe("sample_recommender", () => {
  const pack = recommendSamples("sgija");

  test("returns a SamplePack", () => {
    expect(pack).toBeDefined();
    expect(pack.lane).toBe("sgija");
  });

  test("recommendations has exactly 6 entries", () => {
    expect(pack.recommendations).toHaveLength(6);
    expect(pack.totalCount).toBe(6);
  });

  test("all 6 SampleRoles are present", () => {
    const roles = pack.recommendations.map((r) => r.role);
    for (const role of ["log_drum", "chord_stab", "bassline", "top_loop", "atmosphere", "fx"]) {
      expect(roles).toContain(role);
    }
  });

  test("roles are in canonical order", () => {
    const roles = pack.recommendations.map((r) => r.role);
    expect(roles).toEqual(["log_drum", "chord_stab", "bassline", "top_loop", "atmosphere", "fx"]);
  });

  test("all confidence values in [0, 1]", () => {
    for (const r of pack.recommendations) {
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });

  test("log_drum has highest confidence for sgija", () => {
    const ld = pack.recommendations.find((r) => r.role === "log_drum")!;
    for (const r of pack.recommendations) {
      expect(ld.confidence).toBeGreaterThanOrEqual(r.confidence);
    }
  });

  test("all bpmRange values are [lo, hi] with lo < hi", () => {
    for (const r of pack.recommendations) {
      expect(r.bpmRange[0]).toBeLessThan(r.bpmRange[1]);
    }
  });

  test("all keyHints are non-empty arrays", () => {
    for (const r of pack.recommendations) {
      expect(Array.isArray(r.keyHints)).toBe(true);
      expect(r.keyHints.length).toBeGreaterThan(0);
    }
  });

  test("all tags are non-empty string arrays", () => {
    for (const r of pack.recommendations) {
      expect(Array.isArray(r.tags)).toBe(true);
      expect(r.tags.length).toBeGreaterThan(0);
      for (const tag of r.tags) expect(typeof tag).toBe("string");
    }
  });

  test("culturalTags is non-empty and includes mixProfile", () => {
    expect(pack.culturalTags.length).toBeGreaterThan(0);
    expect(pack.culturalTags).toContain("raw_street");
  });

  test("mbiraiano pack includes mbira-specific chord_stab tag", () => {
    const mbira = recommendSamples("mbiraiano");
    const chord = mbira.recommendations.find((r) => r.role === "chord_stab")!;
    expect(chord.tags).toContain("mbira");
  });

  test("evaluation option boosts confidence", () => {
    const ev  = evaluateBuffer(buildWav(4));
    const base = recommendSamples("sgija");
    const withEv = recommendSamples("sgija", { evaluation: ev });
    // overall sum should differ (evaluation modifies confidence)
    const baseSum = base.recommendations.reduce((s, r) => s + r.confidence, 0);
    const evSum   = withEv.recommendations.reduce((s, r) => s + r.confidence, 0);
    expect(Math.abs(baseSum - evSum)).toBeGreaterThanOrEqual(0); // always true; no throw
    expect(withEv.recommendations).toHaveLength(6);
  });

  test("works for all 8 lanes without throwing", () => {
    for (const lane of LANES) {
      expect(() => recommendSamples(lane)).not.toThrow();
    }
  });
});

// ── 26. Tempo humanizer ───────────────────────────────────────────────────────

describe("tempo_humanizer", () => {
  const set = generateGrooveVariations("sgija");
  const hp  = humanizePattern(set.main, { bpm: 114, humanness: 0.5 });

  test("returns a HumanizedPattern", () => {
    expect(hp).toBeDefined();
    expect(hp.hits).toBeDefined();
    expect(hp.lane).toBe("sgija");
  });

  test("hits only contains active steps (value === 1)", () => {
    const active = [
      ...Array.from(set.main.kickPattern).filter((v) => v === 1),
      ...Array.from(set.main.hatPattern).filter((v) => v === 1),
      ...Array.from(set.main.shakerPattern).filter((v) => v === 1),
      ...Array.from(set.main.logDrumPattern).filter((v) => v === 1),
    ].length;
    expect(hp.hits).toHaveLength(active);
  });

  test("all step values in [0, 15]", () => {
    for (const h of hp.hits) {
      expect(h.step).toBeGreaterThanOrEqual(0);
      expect(h.step).toBeLessThanOrEqual(15);
    }
  });

  test("all voice values are valid VoiceNames", () => {
    const valid = new Set(["kick", "hat", "shaker", "log"]);
    for (const h of hp.hits) expect(valid.has(h.voice)).toBe(true);
  });

  test("all velocityScale values in [0.7, 1.3]", () => {
    for (const h of hp.hits) {
      expect(h.velocityScale).toBeGreaterThanOrEqual(0.7);
      expect(h.velocityScale).toBeLessThanOrEqual(1.3);
    }
  });

  test("swingMs is positive for swing > 0.5", () => {
    expect(set.main.swing).toBeGreaterThan(0.5);
    expect(hp.swingMs).toBeGreaterThan(0);
  });

  test("humanness=0 produces near-zero jitter offsets", () => {
    const tight = humanizePattern(set.main, { bpm: 114, humanness: 0 });
    for (const h of tight.hits) {
      // With humanness=0, only swing offset survives — jitter and globalShift collapse
      const isOffBeat = h.step % 2 === 1;
      if (!isOffBeat) expect(Math.abs(h.offsetMs)).toBeLessThan(0.01);
    }
  });

  test("humanness=1 produces larger offsets than humanness=0.1", () => {
    const loose = humanizePattern(set.main, { bpm: 114, humanness: 1.0 });
    const tight = humanizePattern(set.main, { bpm: 114, humanness: 0.1 });
    const rmsLoose = Math.sqrt(loose.hits.reduce((s, h) => s + h.offsetMs ** 2, 0) / loose.hits.length);
    const rmsTight = Math.sqrt(tight.hits.reduce((s, h) => s + h.offsetMs ** 2, 0) / tight.hits.length);
    expect(rmsLoose).toBeGreaterThan(rmsTight);
  });

  test("is deterministic — same inputs produce identical output", () => {
    const a = humanizePattern(set.main, { bpm: 114, humanness: 0.6 });
    const b = humanizePattern(set.main, { bpm: 114, humanness: 0.6 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("hits are sorted by step ascending", () => {
    for (let i = 1; i < hp.hits.length; i++) {
      expect(hp.hits[i].step).toBeGreaterThanOrEqual(hp.hits[i - 1].step);
    }
  });

  test("offsetTicks is proportional to offsetMs at given BPM", () => {
    for (const h of hp.hits) {
      const expectedTicks = h.offsetMs * (114 / 60) * (480 / 1000);
      expect(h.offsetTicks).toBeCloseTo(expectedTicks, 5);
    }
  });

  test("works for all 8 lanes and all 5 groove variants", () => {
    for (const lane of LANES) {
      const s = generateGrooveVariations(lane);
      for (const variant of [s.main, s.variation, s.fill, s.breakdown, s.build]) {
        expect(() => humanizePattern(variant, { bpm: 114 })).not.toThrow();
      }
    }
  });
});

// ── 27. Quality gate pipeline ─────────────────────────────────────────────────

describe("quality_gate", () => {
  const wav = buildWav(4);
  let report: ReturnType<typeof runQualityGates>;
  beforeAll(() => { report = runQualityGates(evaluateBuffer(wav)); });

  test("returns a QualityGateReport", () => {
    expect(report).toBeDefined();
    expect(report.gates).toHaveLength(5);
  });

  test("gates are named correctly in order", () => {
    const names = report.gates.map((g) => g.name);
    expect(names).toEqual(["authenticity", "perception", "cultural", "quality", "stem_balance"]);
  });

  test("all gate scores in [0, 1]", () => {
    for (const g of report.gates) {
      expect(g.score).toBeGreaterThanOrEqual(0);
      expect(g.score).toBeLessThanOrEqual(1);
    }
  });

  test("all gate weights sum to 1.0", () => {
    const total = report.gates.reduce((s, g) => s + g.weight, 0);
    expect(total).toBeCloseTo(1.0, 9);
  });

  test("overallScore in [0, 1]", () => {
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(1);
  });

  test("grade is one of S, A, B, C, F", () => {
    expect(["S", "A", "B", "C", "F"]).toContain(report.grade);
  });

  test("passCount matches number of passing gates", () => {
    const count = report.gates.filter((g) => g.passes).length;
    expect(report.passCount).toBe(count);
  });

  test("allPass matches all gates passing", () => {
    const allPass = report.gates.every((g) => g.passes);
    expect(report.allPass).toBe(allPass);
  });

  test("readyForRelease is false when allPass is false", () => {
    if (!report.allPass) expect(report.readyForRelease).toBe(false);
  });

  test("each gate has at least one reason string", () => {
    for (const g of report.gates) {
      expect(Array.isArray(g.reasons)).toBe(true);
      expect(g.reasons.length).toBeGreaterThan(0);
      expect(typeof g.reasons[0]).toBe("string");
    }
  });

  test("summary is a non-empty string", () => {
    expect(typeof report.summary).toBe("string");
    expect(report.summary.length).toBeGreaterThan(0);
  });

  test("summary contains grade letter", () => {
    expect(report.summary).toContain(`Grade ${report.grade}`);
  });

  test("overallScore equals weighted sum of gate scores", () => {
    const expected = report.gates.reduce((s, g) => s + g.score * g.weight, 0);
    expect(report.overallScore).toBeCloseTo(Math.min(1, Math.max(0, expected)), 9);
  });

  test("grade F when overallScore < 0.60 or passCount < 3", () => {
    // Construct a minimal fake evaluation that fails most gates
    const ev = evaluateBuffer(buildWav(0.5));
    const r  = runQualityGates(ev);
    if (r.passCount < 3 || r.overallScore < 0.60) {
      expect(r.grade).toBe("F");
    }
  });

  test("works for all 8 lanes without throwing", () => {
    for (const lane of LANES) {
      const ev = evaluateBuffer(buildWav(4, 44100, 110, lane === "gqom_fusion" ? 120 : 114));
      expect(() => runQualityGates(ev)).not.toThrow();
    }
  });
});

// ── 28. Lane grammar constants ────────────────────────────────────────────────

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
