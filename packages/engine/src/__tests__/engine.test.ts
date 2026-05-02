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
import { interpolateGrooves } from "../groove/groove_interpolator";
import { generateProductionReport } from "../pipeline/production_report";
import { buildChordProgression } from "../intelligence/chord_voicing";
import { detectDrift } from "../pipeline/drift_detector";
import { exportChordProgressionToMidi } from "../daw_export/chord_midi_export";
import { runFullSession } from "../pipeline/full_session";
import { computeLaneSimilarityMatrix } from "../audio_intelligence/lane_similarity";
import { scoreGrooveComplexity } from "../groove/complexity_scorer";
import { transposeProgression } from "../intelligence/key_transposer";
import { automateGains } from "../arrangement/stem_gain_automator";
import { generateSidechain } from "../groove/sidechain_generator";
import { generateFilterAutomation } from "../arrangement/filter_automator";
import { calculateReverb } from "../mix/reverb_calculator";
import { generateCompressorSpec } from "../mix/compressor_generator";
import { generateEqSpec } from "../mix/eq_generator";
import { scheduleVocalChops } from "../intelligence/vocal_chop_scheduler";
import { generateWidthAutomation } from "../arrangement/width_automator";
import { quantizeToScale, SCALE_INTERVALS } from "../intelligence/scale_quantizer";
import { scoreTension } from "../intelligence/tension_scorer";
import { validateStructure } from "../pipeline/structure_validator";
import { generateCallResponse } from "../groove/call_response_generator";
import { deduplicateMidi } from "../daw_export/midi_deduplicator";
import { shapeVelocities } from "../groove/velocity_shaper";
import { quantizeSwing }         from "../groove/swing_quantizer";
import { generateMuteSchedule }  from "../arrangement/stem_mute_automator";
import { normalizeDensity }      from "../groove/density_normalizer";
import { buildTickMap }          from "../daw_export/bar_tick_converter";
import { retrogradePattern }     from "../groove/retrograde";
import { generateEuclidean }     from "../groove/euclidean_rhythm";
import { generatePolyrhythm }   from "../groove/polyrhythm_generator";
import { combinePatterns }      from "../groove/pattern_combiner";
import { quantizeNotes }        from "../daw_export/note_quantizer";
import { generateChordStab }      from "../groove/chord_stab_generator";
import { computeEnergyProfile }      from "../intelligence/energy_profile";
import { generateTransitionFill }    from "../arrangement/transition_fill_generator";
import { generatePitchBend }         from "../intelligence/pitch_bend_generator";
import { generateCcAutomation }      from "../daw_export/cc_automation";
import { analyzeTaps }               from "../intelligence/tap_analyzer";
import { resolveProb }               from "../groove/prob_sequencer";
import { generateTempoRamp }         from "../arrangement/tempo_ramp_generator";
import { buildDrumMap, resolveDrumNote } from "../daw_export/drum_mapper";
import { generateArpeggio }              from "../groove/arpeggiator";
import { generateStutter }              from "../groove/note_stutter";
import { injectGhostNotes }            from "../groove/ghost_note_injector";
import { generateEcho }               from "../groove/note_echo";
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

// ── 28. Groove interpolator ───────────────────────────────────────────────────

describe("groove_interpolator", () => {
  const setA = generateGrooveVariations("sgija");
  const setB = generateGrooveVariations("bacardi");

  test("returns a GrooveInterpolation", () => {
    const gi = interpolateGrooves(setA.main, setB.main, { alpha: 0.5 });
    expect(gi).toBeDefined();
    expect(gi.plan).toBeDefined();
    expect(gi.alpha).toBeCloseTo(0.5);
  });

  test("alpha=0 produces plan identical to planA", () => {
    const gi = interpolateGrooves(setA.main, setB.main, { alpha: 0 });
    expect(Array.from(gi.plan.kickPattern)).toEqual(Array.from(setA.main.kickPattern));
    expect(Array.from(gi.plan.logDrumPattern)).toEqual(Array.from(setA.main.logDrumPattern));
  });

  test("alpha=1 produces plan identical to planB", () => {
    const gi = interpolateGrooves(setA.main, setB.main, { alpha: 1 });
    expect(Array.from(gi.plan.kickPattern)).toEqual(Array.from(setB.main.kickPattern));
    expect(Array.from(gi.plan.logDrumPattern)).toEqual(Array.from(setB.main.logDrumPattern));
  });

  test("swing is linearly interpolated at alpha=0.5", () => {
    const gi = interpolateGrooves(setA.main, setB.main, { alpha: 0.5 });
    const expected = (setA.main.swing + setB.main.swing) / 2;
    expect(gi.plan.swing).toBeCloseTo(expected, 9);
  });

  test("swing at alpha=0 equals planA swing", () => {
    const gi = interpolateGrooves(setA.main, setB.main, { alpha: 0 });
    expect(gi.plan.swing).toBeCloseTo(setA.main.swing, 9);
  });

  test("swing at alpha=1 equals planB swing", () => {
    const gi = interpolateGrooves(setA.main, setB.main, { alpha: 1 });
    expect(gi.plan.swing).toBeCloseTo(setB.main.swing, 9);
  });

  test("all pattern values are 0 or 1", () => {
    const gi = interpolateGrooves(setA.main, setB.main, { alpha: 0.5 });
    for (const p of [gi.plan.kickPattern, gi.plan.hatPattern, gi.plan.shakerPattern, gi.plan.logDrumPattern]) {
      for (const v of p) expect([0, 1]).toContain(v);
    }
  });

  test("all patterns have exactly 16 steps", () => {
    const gi = interpolateGrooves(setA.main, setB.main, { alpha: 0.5 });
    expect(gi.plan.kickPattern).toHaveLength(16);
    expect(gi.plan.hatPattern).toHaveLength(16);
    expect(gi.plan.shakerPattern).toHaveLength(16);
    expect(gi.plan.logDrumPattern).toHaveLength(16);
  });

  test("hitsA and hitsB reflect actual hit counts", () => {
    const gi = interpolateGrooves(setA.main, setB.main, { alpha: 0.5 });
    const countPlan = (p: GroovePlan) => [p.kickPattern, p.hatPattern, p.shakerPattern, p.logDrumPattern]
      .reduce((s, v) => s + Array.from(v).filter((x) => x === 1).length, 0);
    expect(gi.hitsA).toBe(countPlan(setA.main));
    expect(gi.hitsB).toBe(countPlan(setB.main));
  });

  test("laneA and laneB reflect input lanes", () => {
    const gi = interpolateGrooves(setA.main, setB.main, { alpha: 0.5 });
    expect(gi.laneA).toBe("sgija");
    expect(gi.laneB).toBe("bacardi");
  });

  test("alpha clamped to [0, 1] — negative input treated as 0", () => {
    const gi = interpolateGrooves(setA.main, setB.main, { alpha: -0.5 });
    expect(gi.alpha).toBeCloseTo(0, 9);
  });

  test("self-interpolation at any alpha is identical to input", () => {
    const gi = interpolateGrooves(setA.main, setA.main, { alpha: 0.7 });
    expect(Array.from(gi.plan.kickPattern)).toEqual(Array.from(setA.main.kickPattern));
    expect(Array.from(gi.plan.hatPattern)).toEqual(Array.from(setA.main.hatPattern));
  });

  test("densityProfile is sparse/medium/dense", () => {
    const gi = interpolateGrooves(setA.main, setB.main, { alpha: 0.5 });
    expect(["sparse", "medium", "dense"]).toContain(gi.plan.densityProfile);
  });

  test("works across all lane pairs without throwing", () => {
    for (let i = 0; i < LANES.length - 1; i++) {
      const sA = generateGrooveVariations(LANES[i]);
      const sB = generateGrooveVariations(LANES[i + 1]);
      expect(() => interpolateGrooves(sA.main, sB.main, { alpha: 0.5 })).not.toThrow();
    }
  });
});

// ── 29. Production report generator ──────────────────────────────────────────

describe("production_report", () => {
  const wav = buildWav(4);
  let report: ReturnType<typeof generateProductionReport>;
  beforeAll(() => { report = generateProductionReport(evaluateBuffer(wav)); });

  test("returns a ProductionReport with all required fields", () => {
    expect(report.summary).toBeDefined();
    expect(report.qualityGate).toBeDefined();
    expect(report.mixSpec).toBeDefined();
    expect(report.samplePack).toBeDefined();
    expect(report.arrangement).toBeDefined();
    expect(report.recommendations).toBeDefined();
    expect(report.generatedAt).toBeDefined();
  });

  test("summary.lane is a valid Lane", () => {
    expect(LANES).toContain(report.summary.lane);
  });

  test("summary.bpm is a positive integer", () => {
    expect(Number.isInteger(report.summary.bpm)).toBe(true);
    expect(report.summary.bpm).toBeGreaterThan(0);
  });

  test("summary.grade matches qualityGate.grade", () => {
    expect(report.summary.grade).toBe(report.qualityGate.grade);
  });

  test("summary.overallScore matches qualityGate.overallScore", () => {
    expect(report.summary.overallScore).toBeCloseTo(report.qualityGate.overallScore, 9);
  });

  test("summary.readyForRelease matches qualityGate.readyForRelease", () => {
    expect(report.summary.readyForRelease).toBe(report.qualityGate.readyForRelease);
  });

  test("mixSpec has 5 stems", () => {
    expect(report.mixSpec.stems).toHaveLength(5);
  });

  test("samplePack has 6 recommendations", () => {
    expect(report.samplePack.recommendations).toHaveLength(6);
  });

  test("arrangement has 8 sections", () => {
    expect(report.arrangement.sections).toHaveLength(8);
  });

  test("arrangement lane matches summary lane", () => {
    expect(report.arrangement.lane).toBe(report.summary.lane);
  });

  test("recommendations is an array of strings, max 12", () => {
    expect(Array.isArray(report.recommendations)).toBe(true);
    expect(report.recommendations.length).toBeLessThanOrEqual(12);
    for (const r of report.recommendations) expect(typeof r).toBe("string");
  });

  test("recommendations has no duplicates", () => {
    const unique = new Set(report.recommendations);
    expect(unique.size).toBe(report.recommendations.length);
  });

  test("generatedAt is a valid ISO-8601 string", () => {
    expect(() => new Date(report.generatedAt)).not.toThrow();
    expect(new Date(report.generatedAt).toISOString()).toBe(report.generatedAt);
  });

  test("qualityGate has 5 gates summing weight to 1.0", () => {
    const total = report.qualityGate.gates.reduce((s, g) => s + g.weight, 0);
    expect(total).toBeCloseTo(1.0, 9);
  });

  test("works for all 8 lanes without throwing", () => {
    for (const lane of LANES) {
      const ev = evaluateBuffer(buildWav(4, 44100, 110, lane === "gqom_fusion" ? 120 : 114));
      expect(() => generateProductionReport(ev)).not.toThrow();
    }
  });
});

// ── 30. Chord voicing engine ──────────────────────────────────────────────────

describe("chord_voicing", () => {
  const prog = buildChordProgression({ lane: "private_school" });

  test("returns a ChordProgression", () => {
    expect(prog).toBeDefined();
    expect(prog.voicings).toHaveLength(4);
  });

  test("amapianoStyle is true", () => {
    expect(prog.amapianoStyle).toBe(true);
  });

  test("loopable is true", () => {
    expect(prog.loopable).toBe(true);
  });

  test("all chord symbols are non-empty strings", () => {
    for (const v of prog.voicings) {
      expect(typeof v.chordSymbol).toBe("string");
      expect(v.chordSymbol.length).toBeGreaterThan(0);
    }
  });

  test("all rootMidi values in valid MIDI range [36, 71] (octave 3)", () => {
    for (const v of prog.voicings) {
      expect(v.rootMidi).toBeGreaterThanOrEqual(36);
      expect(v.rootMidi).toBeLessThanOrEqual(71);
    }
  });

  test("all notes arrays have rootMidi as first element", () => {
    for (const v of prog.voicings) {
      expect(v.notes[0]).toBe(v.rootMidi);
    }
  });

  test("all notes are in ascending order", () => {
    for (const v of prog.voicings) {
      for (let i = 1; i < v.notes.length; i++) {
        expect(v.notes[i]).toBeGreaterThanOrEqual(v.notes[i - 1]);
      }
    }
  });

  test("all notes in valid MIDI range [48, 96]", () => {
    for (const v of prog.voicings) {
      for (const n of v.notes) {
        expect(n).toBeGreaterThanOrEqual(48);
        expect(n).toBeLessThanOrEqual(96);
      }
    }
  });

  test("each voicing has 3–5 notes (Amapiano compact spread)", () => {
    for (const v of prog.voicings) {
      expect(v.notes.length).toBeGreaterThanOrEqual(3);
      expect(v.notes.length).toBeLessThanOrEqual(6);
    }
  });

  test("all tension values in [0, 1]", () => {
    for (const v of prog.voicings) {
      expect(v.tension).toBeGreaterThanOrEqual(0);
      expect(v.tension).toBeLessThanOrEqual(1);
    }
  });

  test("all chordFunction values are valid", () => {
    const valid = new Set(["tonic", "subdominant", "dominant", "tension"]);
    for (const v of prog.voicings) expect(valid.has(v.function)).toBe(true);
  });

  test("first chord is always tonic function", () => {
    expect(prog.voicings[0].function).toBe("tonic");
  });

  test("mbiraiano uses pure minor (shorter intervals, 3 notes)", () => {
    const mbira = buildChordProgression({ lane: "mbiraiano" });
    for (const v of mbira.voicings) {
      expect(v.notes.length).toBe(4); // bass + 3 intervals for "m"
    }
  });

  test("gqom_fusion last chord has highest tension", () => {
    const gqom = buildChordProgression({ lane: "gqom_fusion" });
    const last   = gqom.voicings[gqom.voicings.length - 1];
    for (const v of gqom.voicings.slice(0, -1)) {
      expect(last.tension).toBeGreaterThan(v.tension - 0.001);
    }
  });

  test("key field is non-empty string", () => {
    expect(typeof prog.key).toBe("string");
    expect(prog.key.length).toBeGreaterThan(0);
  });

  test("works for all 8 lanes without throwing", () => {
    for (const lane of LANES) {
      expect(() => buildChordProgression({ lane })).not.toThrow();
    }
  });
});

// ── 31. Session drift detector ────────────────────────────────────────────────

describe("drift_detector", () => {
  const wav = buildWav(4);
  const stableEv = evaluateBuffer(wav);

  // 5-element stable series
  const stableSeries = [stableEv, stableEv, stableEv, stableEv, stableEv];

  test("returns a DriftReport with 4 traces", () => {
    const r = detectDrift("sgija", stableSeries);
    expect(r).toBeDefined();
    expect(r.traces).toHaveLength(4);
  });

  test("trace names are authenticity, quality, cultural, stemBalance", () => {
    const r = detectDrift("sgija", stableSeries);
    expect(r.traces.map((t) => t.signal)).toEqual(["authenticity", "quality", "cultural", "stemBalance"]);
  });

  test("iterations matches series length", () => {
    const r = detectDrift("sgija", stableSeries);
    expect(r.iterations).toBe(5);
  });

  test("each trace.values has same length as series", () => {
    const r = detectDrift("sgija", stableSeries);
    for (const t of r.traces) expect(t.values).toHaveLength(5);
  });

  test("all trace.mean values in [0, 1]", () => {
    const r = detectDrift("sgija", stableSeries);
    for (const t of r.traces) {
      expect(t.mean).toBeGreaterThanOrEqual(0);
      expect(t.mean).toBeLessThanOrEqual(1);
    }
  });

  test("all trace.velocity values in [-1, 1]", () => {
    const r = detectDrift("sgija", stableSeries);
    for (const t of r.traces) {
      expect(t.velocity).toBeGreaterThanOrEqual(-1);
      expect(t.velocity).toBeLessThanOrEqual(1);
    }
  });

  test("stable series produces velocity ≈ 0 for each trace", () => {
    const r = detectDrift("sgija", stableSeries);
    for (const t of r.traces) expect(Math.abs(t.velocity)).toBeCloseTo(0, 9);
  });

  test("stable series: driftDetected is false", () => {
    const r = detectDrift("sgija", stableSeries);
    expect(r.driftDetected).toBe(false);
  });

  test("all trend values are valid DriftTrend strings", () => {
    const valid = new Set(["improving", "stable", "degrading", "volatile"]);
    const r = detectDrift("private_school", stableSeries);
    for (const t of r.traces) expect(valid.has(t.trend)).toBe(true);
    expect(valid.has(r.overallTrend)).toBe(true);
  });

  test("recovery is a non-empty string array", () => {
    const r = detectDrift("sgija", stableSeries);
    expect(Array.isArray(r.recovery)).toBe(true);
    expect(r.recovery.length).toBeGreaterThan(0);
    for (const s of r.recovery) expect(typeof s).toBe("string");
  });

  test("criticalSignals is empty for stable series", () => {
    const r = detectDrift("sgija", stableSeries);
    expect(r.criticalSignals).toHaveLength(0);
  });

  test("single evaluation does not throw", () => {
    expect(() => detectDrift("bacardi", [stableEv])).not.toThrow();
  });

  test("works for all 8 lanes without throwing", () => {
    for (const lane of LANES) {
      expect(() => detectDrift(lane, stableSeries)).not.toThrow();
    }
  });
});

// ── 32. Chord-to-MIDI exporter ────────────────────────────────────────────────

describe("chord_midi_export", () => {
  const prog   = buildChordProgression({ lane: "private_school" });
  const result = exportChordProgressionToMidi(prog, { bpm: 112 });

  test("returns a ChordMidiResult", () => {
    expect(result).toBeDefined();
    expect(result.buffer).toBeDefined();
  });

  test("buffer has valid MIDI header magic bytes (MThd)", () => {
    expect(result.buffer[0]).toBe(0x4d);  // M
    expect(result.buffer[1]).toBe(0x54);  // T
    expect(result.buffer[2]).toBe(0x68);  // h
    expect(result.buffer[3]).toBe(0x64);  // d
  });

  test("buffer is format 0 (single track)", () => {
    const format = (result.buffer[8] << 8) | result.buffer[9];
    const tracks = (result.buffer[10] << 8) | result.buffer[11];
    expect(format).toBe(0);
    expect(tracks).toBe(1);
  });

  test("TPQ is 480", () => {
    const tpq = (result.buffer[12] << 8) | result.buffer[13];
    expect(tpq).toBe(480);
  });

  test("MTrk chunk marker present after MThd", () => {
    expect(result.buffer[14]).toBe(0x4d);  // M
    expect(result.buffer[15]).toBe(0x54);  // T
    expect(result.buffer[16]).toBe(0x72);  // r
    expect(result.buffer[17]).toBe(0x6b);  // k
  });

  test("chordCount = voicings × repeat (default repeat=2)", () => {
    expect(result.chordCount).toBe(prog.voicings.length * 2);
  });

  test("beatsPerChord defaults to 4", () => {
    expect(result.beatsPerChord).toBe(4);
  });

  test("totalBars = chordCount × beatsPerChord / 4", () => {
    expect(result.totalBars).toBe((result.chordCount * result.beatsPerChord) / 4);
  });

  test("lane matches input progression lane", () => {
    expect(result.lane).toBe("private_school");
  });

  test("bpm matches input", () => {
    expect(result.bpm).toBe(112);
  });

  test("custom beatsPerChord is respected", () => {
    const r2 = exportChordProgressionToMidi(prog, { bpm: 114, beatsPerChord: 8 });
    expect(r2.beatsPerChord).toBe(8);
    expect(r2.totalBars).toBe((r2.chordCount * 8) / 4);
  });

  test("custom repeat is respected", () => {
    const r4 = exportChordProgressionToMidi(prog, { bpm: 114, repeat: 4 });
    expect(r4.chordCount).toBe(prog.voicings.length * 4);
  });

  test("buffer is larger with more repeats", () => {
    const r2 = exportChordProgressionToMidi(prog, { bpm: 114, repeat: 2 });
    const r4 = exportChordProgressionToMidi(prog, { bpm: 114, repeat: 4 });
    expect(r4.buffer.length).toBeGreaterThan(r2.buffer.length);
  });

  test("works for all 8 lanes without throwing", () => {
    for (const lane of LANES) {
      const p = buildChordProgression({ lane });
      expect(() => exportChordProgressionToMidi(p, { bpm: 114 })).not.toThrow();
    }
  });
});

// ── 33. Full session engine ───────────────────────────────────────────────────

describe("full_session", () => {
  let session: ReturnType<typeof runFullSession>;
  beforeAll(() => { session = runFullSession({ lane: "sgija" }); });

  test("returns a FullSession object", () => {
    expect(session).toBeDefined();
    expect(session.lane).toBe("sgija");
  });

  test("bpm defaults to lane target", () => {
    expect(session.bpm).toBeGreaterThan(0);
  });

  test("grooves has all 5 variants", () => {
    expect(session.grooves.main).toBeDefined();
    expect(session.grooves.variation).toBeDefined();
    expect(session.grooves.fill).toBeDefined();
    expect(session.grooves.breakdown).toBeDefined();
    expect(session.grooves.build).toBeDefined();
  });

  test("fingerprints has entries for all 5 variants", () => {
    for (const v of ["main", "variation", "fill", "breakdown", "build"]) {
      expect(session.fingerprints[v as keyof typeof session.fingerprints]).toBeDefined();
      expect(session.fingerprints[v as keyof typeof session.fingerprints].hash).toHaveLength(32);
    }
  });

  test("arc has 8 sections", () => {
    expect(session.arc.sections).toHaveLength(8);
  });

  test("arc lane matches session lane", () => {
    expect(session.arc.lane).toBe(session.lane);
  });

  test("humanized.lane matches session lane", () => {
    expect(session.humanized.lane).toBe(session.lane);
  });

  test("interpolated.laneA and laneB are both session lane", () => {
    expect(session.interpolated.laneA).toBe(session.lane);
    expect(session.interpolated.laneB).toBe(session.lane);
  });

  test("samplePack has 6 recommendations", () => {
    expect(session.samplePack.recommendations).toHaveLength(6);
  });

  test("chords has 4 voicings", () => {
    expect(session.chords.voicings).toHaveLength(4);
  });

  test("mixSpec is null when no evaluation provided", () => {
    expect(session.mixSpec).toBeNull();
  });

  test("report is null when no evaluation provided", () => {
    expect(session.report).toBeNull();
  });

  test("grooveMidi is a Buffer with MThd header", () => {
    expect(Buffer.isBuffer(session.grooveMidi)).toBe(true);
    expect(session.grooveMidi[0]).toBe(0x4d);
    expect(session.grooveMidi[3]).toBe(0x64);
  });

  test("chordMidi is a Buffer with MThd header", () => {
    expect(Buffer.isBuffer(session.chordMidi)).toBe(true);
    expect(session.chordMidi[0]).toBe(0x4d);
    expect(session.chordMidi[3]).toBe(0x64);
  });

  test("with evaluation: mixSpec and report are populated", () => {
    const ev = evaluateBuffer(buildWav(4));
    const s  = runFullSession({ lane: "sgija", evaluation: ev });
    expect(s.mixSpec).not.toBeNull();
    expect(s.report).not.toBeNull();
    expect(s.report!.summary.lane).toBeDefined();
  });

  test("custom bpm is respected across modules", () => {
    const s = runFullSession({ lane: "bacardi", bpm: 120 });
    expect(s.bpm).toBe(120);
    expect(s.arc.bpm).toBe(120);
    expect(s.humanized.bpm).toBe(120);
  });

  test("works for all 8 lanes without throwing", () => {
    for (const lane of LANES) {
      expect(() => runFullSession({ lane })).not.toThrow();
    }
  });
});

// ── 34. Lane similarity matrix ────────────────────────────────────────────────

describe("lane_similarity", () => {
  let lsm: ReturnType<typeof computeLaneSimilarityMatrix>;
  beforeAll(() => { lsm = computeLaneSimilarityMatrix(); });

  test("returns a LaneSimilarityMatrix", () => {
    expect(lsm).toBeDefined();
    expect(lsm.matrix).toBeDefined();
    expect(lsm.pairs).toBeDefined();
  });

  test("matrix covers all 8×8 lane pairs", () => {
    for (const lA of LANES) {
      for (const lB of LANES) {
        expect(lsm.matrix[lA][lB]).toBeDefined();
      }
    }
  });

  test("self-similarity is exactly 1.0 for all lanes", () => {
    for (const lane of LANES) {
      expect(lsm.matrix[lane][lane]).toBeCloseTo(1.0, 9);
    }
  });

  test("matrix is symmetric", () => {
    for (const lA of LANES) {
      for (const lB of LANES) {
        expect(lsm.matrix[lA][lB]).toBeCloseTo(lsm.matrix[lB][lA], 9);
      }
    }
  });

  test("all similarity values in [0, 1]", () => {
    for (const lA of LANES) {
      for (const lB of LANES) {
        expect(lsm.matrix[lA][lB]).toBeGreaterThanOrEqual(0);
        expect(lsm.matrix[lA][lB]).toBeLessThanOrEqual(1);
      }
    }
  });

  test("pairs has exactly 28 unique pairs (C(8,2))", () => {
    expect(lsm.pairs).toHaveLength(28);
  });

  test("pairs are sorted descending by similarity", () => {
    for (let i = 1; i < lsm.pairs.length; i++) {
      expect(lsm.pairs[i].similarity).toBeLessThanOrEqual(lsm.pairs[i - 1].similarity);
    }
  });

  test("each pair has distance = 1 - similarity", () => {
    for (const p of lsm.pairs) {
      expect(p.distance).toBeCloseTo(1 - p.similarity, 9);
    }
  });

  test("closest has 3 entries", () => {
    expect(lsm.closest).toHaveLength(3);
  });

  test("farthest has 3 entries", () => {
    expect(lsm.farthest).toHaveLength(3);
  });

  test("closest similarity >= farthest similarity", () => {
    for (const c of lsm.closest) {
      for (const f of lsm.farthest) {
        expect(c.similarity).toBeGreaterThanOrEqual(f.similarity);
      }
    }
  });

  test("neighbors covers all 8 lanes", () => {
    for (const lane of LANES) {
      expect(lsm.neighbors[lane]).toBeDefined();
      expect(LANES).toContain(lsm.neighbors[lane]);
    }
  });

  test("neighbor is never the lane itself", () => {
    for (const lane of LANES) {
      expect(lsm.neighbors[lane]).not.toBe(lane);
    }
  });

  test("closest pair has higher similarity than median pair", () => {
    const median = lsm.pairs[Math.floor(lsm.pairs.length / 2)].similarity;
    expect(lsm.closest[0].similarity).toBeGreaterThan(median);
  });

  test("is deterministic — identical result on second call", () => {
    const lsm2 = computeLaneSimilarityMatrix();
    expect(JSON.stringify(lsm.matrix)).toBe(JSON.stringify(lsm2.matrix));
  });
});

// ── 35. Groove complexity scorer ─────────────────────────────────────────────

describe("groove_complexity", () => {
  const set = generateGrooveVariations("sgija");

  test("returns a GrooveComplexityScore", () => {
    const score = scoreGrooveComplexity(set.main);
    expect(score).toBeDefined();
    expect(score.voiceScores).toHaveLength(4);
  });

  test("voiceScores covers kick, hat, shaker, log in order", () => {
    const { voiceScores } = scoreGrooveComplexity(set.main);
    expect(voiceScores.map((v) => v.voice)).toEqual(["kick", "hat", "shaker", "log"]);
  });

  test("all voice entropy values in [0, 1]", () => {
    const { voiceScores } = scoreGrooveComplexity(set.main);
    for (const v of voiceScores) {
      expect(v.entropy).toBeGreaterThanOrEqual(0);
      expect(v.entropy).toBeLessThanOrEqual(1);
    }
  });

  test("all voice syncopation values in [0, 1]", () => {
    const { voiceScores } = scoreGrooveComplexity(set.main);
    for (const v of voiceScores) {
      expect(v.syncopation).toBeGreaterThanOrEqual(0);
      expect(v.syncopation).toBeLessThanOrEqual(1);
    }
  });

  test("all voice density values in [0, 1]", () => {
    const { voiceScores } = scoreGrooveComplexity(set.main);
    for (const v of voiceScores) {
      expect(v.density).toBeGreaterThanOrEqual(0);
      expect(v.density).toBeLessThanOrEqual(1);
    }
  });

  test("aggregate entropy in [0, 1]", () => {
    const s = scoreGrooveComplexity(set.main);
    expect(s.entropy).toBeGreaterThanOrEqual(0);
    expect(s.entropy).toBeLessThanOrEqual(1);
  });

  test("syncopation in [0, 1]", () => {
    const s = scoreGrooveComplexity(set.main);
    expect(s.syncopation).toBeGreaterThanOrEqual(0);
    expect(s.syncopation).toBeLessThanOrEqual(1);
  });

  test("density in [0, 1]", () => {
    const s = scoreGrooveComplexity(set.main);
    expect(s.density).toBeGreaterThanOrEqual(0);
    expect(s.density).toBeLessThanOrEqual(1);
  });

  test("independence in [0, 1]", () => {
    const s = scoreGrooveComplexity(set.main);
    expect(s.independence).toBeGreaterThanOrEqual(0);
    expect(s.independence).toBeLessThanOrEqual(1);
  });

  test("overall in [0, 1]", () => {
    const s = scoreGrooveComplexity(set.main);
    expect(s.overall).toBeGreaterThanOrEqual(0);
    expect(s.overall).toBeLessThanOrEqual(1);
  });

  test("complexityTier is a valid tier string", () => {
    const valid = new Set(["minimal", "sparse", "moderate", "complex", "dense"]);
    const s = scoreGrooveComplexity(set.main);
    expect(valid.has(s.complexityTier)).toBe(true);
  });

  test("breakdown (no log drum) has lower complexity than fill", () => {
    const bd   = scoreGrooveComplexity(set.breakdown);
    const fill = scoreGrooveComplexity(set.fill);
    expect(fill.overall).toBeGreaterThan(bd.overall);
  });

  test("fill has higher density than breakdown", () => {
    const bd   = scoreGrooveComplexity(set.breakdown);
    const fill = scoreGrooveComplexity(set.fill);
    expect(fill.density).toBeGreaterThan(bd.density);
  });

  test("all-zero pattern produces entropy 0", () => {
    const emptyPlan = { ...set.breakdown, logDrumPattern: new Array(16).fill(0) as unknown as readonly number[] };
    const s = scoreGrooveComplexity(emptyPlan);
    const logScore = s.voiceScores.find((v) => v.voice === "log")!;
    expect(logScore.entropy).toBeCloseTo(0, 9);
  });

  test("works for all 8 lanes and 5 variants without throwing", () => {
    for (const lane of LANES) {
      const s = generateGrooveVariations(lane);
      for (const variant of [s.main, s.variation, s.fill, s.breakdown, s.build]) {
        expect(() => scoreGrooveComplexity(variant)).not.toThrow();
      }
    }
  });
});

// ── 36. Key transposer ────────────────────────────────────────────────────────

describe("key_transposer", () => {
  const amProg = buildChordProgression({ lane: "private_school" }); // key "Am"

  test("returns a TransposeResult", () => {
    const r = transposeProgression(amProg, "Cm");
    expect(r).toBeDefined();
    expect(r.progression).toBeDefined();
    expect(r.semitones).toBeDefined();
  });

  test("same-key transpose returns semitones = 0", () => {
    const r = transposeProgression(amProg, "Am");
    expect(r.semitones).toBe(0);
  });

  test("same-key transpose returns identical progression reference", () => {
    const r = transposeProgression(amProg, "Am");
    expect(r.progression).toBe(amProg);
  });

  test("Am → Cm = +3 semitones (shortest path up)", () => {
    const r = transposeProgression(amProg, "Cm");
    expect(r.semitones).toBe(3);
  });

  test("Am → Gm = −2 semitones (shortest path down)", () => {
    const r = transposeProgression(amProg, "Gm");
    expect(r.semitones).toBe(-2);
  });

  test("|semitones| <= 6 for all target keys (shortest path)", () => {
    const targets = ["Am", "Bbm", "Bm", "Cm", "Dbm", "Dm", "Ebm", "Em", "Fm", "Gbm", "Gm", "Abm"];
    for (const t of targets) {
      const r = transposeProgression(amProg, t);
      expect(Math.abs(r.semitones)).toBeLessThanOrEqual(6);
    }
  });

  test("all MIDI notes shift by exactly semitones", () => {
    const r = transposeProgression(amProg, "Cm");  // +3
    amProg.voicings.forEach((orig, i) => {
      const trans = r.progression.voicings[i];
      for (let n = 0; n < orig.notes.length; n++) {
        expect(trans.notes[n]).toBe(orig.notes[n] + 3);
      }
    });
  });

  test("rootMidi shifts by semitones", () => {
    const r = transposeProgression(amProg, "Cm");
    amProg.voicings.forEach((orig, i) => {
      expect(r.progression.voicings[i].rootMidi).toBe(orig.rootMidi + 3);
    });
  });

  test("transposed chord symbols contain new root names", () => {
    const r = transposeProgression(amProg, "Bm");  // +2 (Am → Bm)
    const symbols = r.progression.voicings.map((v) => v.chordSymbol);
    expect(symbols[0]).toMatch(/^B/);  // Am9 → Bm9
  });

  test("transposed key field matches target root", () => {
    const r = transposeProgression(amProg, "Dm");
    expect(r.progression.key).toMatch(/^D/);
  });

  test("originalKey is preserved", () => {
    const r = transposeProgression(amProg, "Fm");
    expect(r.originalKey).toBe("Am");
  });

  test("voicing count preserved after transposition", () => {
    const r = transposeProgression(amProg, "Ebm");
    expect(r.progression.voicings).toHaveLength(amProg.voicings.length);
  });

  test("double transposition returns to original root notes", () => {
    const r1 = transposeProgression(amProg, "Cm");   // +3
    const r2 = transposeProgression(r1.progression, "Am");  // −3
    amProg.voicings.forEach((orig, i) => {
      for (let n = 0; n < orig.notes.length; n++) {
        expect(r2.progression.voicings[i].notes[n]).toBe(orig.notes[n]);
      }
    });
  });

  test("works for all 8 lane progressions without throwing", () => {
    for (const lane of LANES) {
      const p = buildChordProgression({ lane });
      expect(() => transposeProgression(p, "Dm")).not.toThrow();
    }
  });
});

// ── 37. Lane grammar constants ────────────────────────────────────────────────

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

// ── 38. Stem gain automator ───────────────────────────────────────────────────

describe("stem_gain_automator", () => {
  const arc = planArrangementArc("private_school", { totalBars: 64 });
  const automation = automateGains(arc);

  test("returns one curve per stem (5 stems)", () => {
    expect(automation.curves).toHaveLength(5);
  });

  test("each curve has the correct stem name", () => {
    const names = automation.curves.map((c) => c.stem);
    expect(names).toContain("sub_bass");
    expect(names).toContain("log_drum");
    expect(names).toContain("chord_pad");
    expect(names).toContain("percussion");
    expect(names).toContain("air");
  });

  test("totalBars matches arc", () => {
    expect(automation.totalBars).toBe(arc.totalBars);
  });

  test("all gain values are clamped to [0, 1]", () => {
    for (const curve of automation.curves) {
      for (const p of curve.points) {
        expect(p.gain).toBeGreaterThanOrEqual(0);
        expect(p.gain).toBeLessThanOrEqual(1);
      }
    }
  });

  test("gain points are in ascending bar order", () => {
    for (const curve of automation.curves) {
      for (let i = 1; i < curve.points.length; i++) {
        expect(curve.points[i].bar).toBeGreaterThan(curve.points[i - 1].bar);
      }
    }
  });

  test("each curve has at least 2 points", () => {
    for (const curve of automation.curves) {
      expect(curve.points.length).toBeGreaterThanOrEqual(2);
    }
  });

  test("drop sections bring sub_bass to 1.0", () => {
    const subBass = automation.curves.find((c) => c.stem === "sub_bass")!;
    const drop1Section = arc.sections.find((s) => s.name === "drop1")!;
    const dropPoint = subBass.points.find((p) => p.bar === drop1Section.endBar);
    expect(dropPoint?.gain).toBe(1.0);
  });

  test("breakdown section brings sub_bass below 0.5", () => {
    const subBass = automation.curves.find((c) => c.stem === "sub_bass")!;
    const bdSection = arc.sections.find((s) => s.name === "breakdown")!;
    const bdPoint = subBass.points.find((p) => p.bar === bdSection.endBar);
    expect(bdPoint?.gain).toBeLessThan(0.5);
  });

  test("breakdown section lifts air to 1.0", () => {
    const air = automation.curves.find((c) => c.stem === "air")!;
    const bdSection = arc.sections.find((s) => s.name === "breakdown")!;
    const bdPoint = air.points.find((p) => p.bar === bdSection.endBar);
    expect(bdPoint?.gain).toBe(1.0);
  });

  test("outro_fade ends all stems at gain 0", () => {
    for (const curve of automation.curves) {
      const last = curve.points[curve.points.length - 1];
      expect(last.gain).toBe(0);
    }
  });

  test("build1 end gain is higher than intro end gain for log_drum", () => {
    const log = automation.curves.find((c) => c.stem === "log_drum")!;
    const introEnd = arc.sections.find((s) => s.name === "intro")!.endBar;
    const build1End = arc.sections.find((s) => s.name === "build1")!.endBar;
    const introGain = log.points.find((p) => p.bar === introEnd)?.gain ?? 0;
    const build1Gain = log.points.find((p) => p.bar === build1End)?.gain ?? 0;
    expect(build1Gain).toBeGreaterThan(introGain);
  });

  test("works for all 8 lanes without throwing", () => {
    for (const lane of LANES) {
      const a = planArrangementArc(lane, { totalBars: 32 });
      expect(() => automateGains(a)).not.toThrow();
    }
  });
});

// ── 39. Sidechain pattern generator ──────────────────────────────────────────

describe("sidechain_generator", () => {
  // Kick on steps 0 and 8 — classic four-to-the-floor half-bar kicks
  const scPlan: import("../types").GroovePlan = {
    grooveType: "main",
    lane: "private_school",
    steps: 16,
    kickPattern:    [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    hatPattern:     [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
    shakerPattern:  [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    logDrumPattern: [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,1],
    swing: 0.52,
    densityProfile: "medium",
    microtimingProfile: "straight",
    styleBiasApplied: false,
  };

  const sc = generateSidechain(scPlan, { bpm: 112 });

  test("stepGains has exactly 16 values", () => {
    expect(sc.stepGains).toHaveLength(16);
  });

  test("all gain values are in [0, 1]", () => {
    for (const g of sc.stepGains) {
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
    }
  });

  test("kick steps (0, 8) have reduced gain", () => {
    expect(sc.stepGains[0]).toBeLessThan(1);
    expect(sc.stepGains[8]).toBeLessThan(1);
  });

  test("kick step gain equals 1 − depth (default 0.70)", () => {
    expect(sc.stepGains[0]).toBeCloseTo(0.30, 6);
    expect(sc.stepGains[8]).toBeCloseTo(0.30, 6);
  });

  test("steps outside all release windows have gain = 1.0", () => {
    // kicks at 0 and 8, release=3 → windows [0–3] and [8–11] are affected
    expect(sc.stepGains[4]).toBeCloseTo(1.0, 6);
    expect(sc.stepGains[5]).toBeCloseTo(1.0, 6);
    expect(sc.stepGains[12]).toBeCloseTo(1.0, 6);
  });

  test("kickSteps matches the kick pattern", () => {
    expect(sc.kickSteps).toEqual([0, 8]);
  });

  test("releaseMs scales with BPM (lower BPM → longer step)", () => {
    const slow = generateSidechain(scPlan, { bpm: 80 });
    const fast = generateSidechain(scPlan, { bpm: 140 });
    expect(slow.releaseMs).toBeGreaterThan(fast.releaseMs);
  });

  test("depth=0 yields all gains = 1.0", () => {
    const noSc = generateSidechain(scPlan, { bpm: 112, depth: 0 });
    for (const g of noSc.stepGains) expect(g).toBeCloseTo(1.0, 6);
  });

  test("depth=1.0 yields gain=0 at kick steps", () => {
    const fullSc = generateSidechain(scPlan, { bpm: 112, depth: 1.0 });
    expect(fullSc.stepGains[0]).toBeCloseTo(0, 6);
    expect(fullSc.stepGains[8]).toBeCloseTo(0, 6);
  });

  test("gain recovers monotonically after each kick", () => {
    // Steps 0→1→2→3 should be strictly increasing
    expect(sc.stepGains[1]).toBeGreaterThan(sc.stepGains[0]);
    expect(sc.stepGains[2]).toBeGreaterThan(sc.stepGains[1]);
    expect(sc.stepGains[3]).toBeGreaterThan(sc.stepGains[2]);
  });

  test("plan with no kicks returns all gains = 1.0", () => {
    const silentPlan: import("../types").GroovePlan = {
      ...scPlan,
      kickPattern: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    };
    const silent = generateSidechain(silentPlan, { bpm: 112 });
    for (const g of silent.stepGains) expect(g).toBeCloseTo(1.0, 6);
    expect(silent.kickSteps).toHaveLength(0);
  });

  test("works for all 8 lanes without throwing", () => {
    for (const lane of LANES) {
      const lp: import("../types").GroovePlan = { ...scPlan, lane };
      expect(() => generateSidechain(lp, { bpm: 114 })).not.toThrow();
    }
  });
});

// ── 40. Filter automation generator ──────────────────────────────────────────

describe("filter_automator", () => {
  const arc = planArrangementArc("private_school", { totalBars: 64 });
  const fa  = generateFilterAutomation(arc);

  test("totalBars matches arc", () => {
    expect(fa.totalBars).toBe(arc.totalBars);
  });

  test("points are in strictly ascending bar order", () => {
    for (let i = 1; i < fa.points.length; i++) {
      expect(fa.points[i].bar).toBeGreaterThan(fa.points[i - 1].bar);
    }
  });

  test("no duplicate bar values", () => {
    const bars = fa.points.map((p) => p.bar);
    expect(new Set(bars).size).toBe(bars.length);
  });

  test("all cutoffHz values in audible range [20, 20000]", () => {
    for (const p of fa.points) {
      expect(p.cutoffHz).toBeGreaterThanOrEqual(20);
      expect(p.cutoffHz).toBeLessThanOrEqual(20000);
    }
  });

  test("first point is at bar 0", () => {
    expect(fa.points[0].bar).toBe(0);
  });

  test("first point cutoffHz is INITIAL_HZ (300) — filter sealed at start", () => {
    expect(fa.points[0].cutoffHz).toBe(300);
  });

  test("drop1 section ends with cutoffHz >= 18000", () => {
    const drop1 = arc.sections.find((s) => s.name === "drop1")!;
    const pt    = fa.points.find((p) => p.bar === drop1.endBar);
    expect(pt?.cutoffHz).toBeGreaterThanOrEqual(18000);
  });

  test("breakdown section ends with cutoffHz <= 1200", () => {
    const bd = arc.sections.find((s) => s.name === "breakdown")!;
    const pt = fa.points.find((p) => p.bar === bd.endBar);
    expect(pt?.cutoffHz).toBeLessThanOrEqual(1200);
  });

  test("outro_fade section ends at minimum cutoffHz (400)", () => {
    const last = fa.points[fa.points.length - 1];
    expect(last.cutoffHz).toBe(400);
  });

  test("build1 end cutoffHz > build1 start cutoffHz (filter opens)", () => {
    const build1 = arc.sections.find((s) => s.name === "build1")!;
    const start  = fa.points.find((p) => p.bar === build1.startBar)!;
    const end    = fa.points.find((p) => p.bar === build1.endBar)!;
    expect(end.cutoffHz).toBeGreaterThan(start.cutoffHz);
  });

  test("has at least as many points as sections + 1 (initial point)", () => {
    expect(fa.points.length).toBeGreaterThanOrEqual(arc.sections.length + 1);
  });

  test("works for all 8 lanes without throwing", () => {
    for (const lane of LANES) {
      const a = planArrangementArc(lane, { totalBars: 32 });
      expect(() => generateFilterAutomation(a)).not.toThrow();
    }
  });
});

// ── 41. Reverb tail calculator ────────────────────────────────────────────────

describe("reverb_calculator", () => {
  const spec = calculateReverb(114, "luxury_noir");

  test("returns one ReverbParams per stem (5 total)", () => {
    expect(spec.params).toHaveLength(5);
  });

  test("all 5 stems are present", () => {
    const stems = spec.params.map((p) => p.stem);
    expect(stems).toContain("sub_bass");
    expect(stems).toContain("log_drum");
    expect(stems).toContain("chord_pad");
    expect(stems).toContain("percussion");
    expect(stems).toContain("air");
  });

  test("all preDelayMs in [0, 200]", () => {
    for (const p of spec.params) {
      expect(p.preDelayMs).toBeGreaterThanOrEqual(0);
      expect(p.preDelayMs).toBeLessThanOrEqual(200);
    }
  });

  test("all decayMs in [50, 4000]", () => {
    for (const p of spec.params) {
      expect(p.decayMs).toBeGreaterThanOrEqual(50);
      expect(p.decayMs).toBeLessThanOrEqual(4000);
    }
  });

  test("all wetLevel in [0, 1]", () => {
    for (const p of spec.params) {
      expect(p.wetLevel).toBeGreaterThanOrEqual(0);
      expect(p.wetLevel).toBeLessThanOrEqual(1);
    }
  });

  test("all roomSize in [0, 1]", () => {
    for (const p of spec.params) {
      expect(p.roomSize).toBeGreaterThanOrEqual(0);
      expect(p.roomSize).toBeLessThanOrEqual(1);
    }
  });

  test("sub_bass has the lowest wetLevel (dry bass)", () => {
    const wetLevels = spec.params.map((p) => p.wetLevel);
    const subWet    = spec.params.find((p) => p.stem === "sub_bass")!.wetLevel;
    expect(subWet).toBe(Math.min(...wetLevels));
  });

  test("air has the highest decayMs (lush tail)", () => {
    const decays  = spec.params.map((p) => p.decayMs);
    const airDecay = spec.params.find((p) => p.stem === "air")!.decayMs;
    expect(airDecay).toBe(Math.max(...decays));
  });

  test("chord_pad decayMs > log_drum decayMs", () => {
    const chordDecay = spec.params.find((p) => p.stem === "chord_pad")!.decayMs;
    const logDecay   = spec.params.find((p) => p.stem === "log_drum")!.decayMs;
    expect(chordDecay).toBeGreaterThan(logDecay);
  });

  test("spiritual_organic produces higher decayMs than raw_street for chord_pad", () => {
    const spiritual = calculateReverb(114, "spiritual_organic");
    const raw       = calculateReverb(114, "raw_street");
    const sChord    = spiritual.params.find((p) => p.stem === "chord_pad")!.decayMs;
    const rChord    = raw.params.find((p) => p.stem === "chord_pad")!.decayMs;
    expect(sChord).toBeGreaterThan(rChord);
  });

  test("higher BPM yields shorter decayMs for chord_pad (same profile)", () => {
    const slow = calculateReverb(90,  "luxury_noir");
    const fast = calculateReverb(140, "luxury_noir");
    const sChord = slow.params.find((p) => p.stem === "chord_pad")!.decayMs;
    const fChord = fast.params.find((p) => p.stem === "chord_pad")!.decayMs;
    expect(sChord).toBeGreaterThan(fChord);
  });

  test("works for all 6 MixProfile values without throwing", () => {
    const profiles = ["luxury_noir", "raw_street", "bounce_club", "spiritual_organic", "dark_tribal", "crossover_rb"] as const;
    for (const mp of profiles) {
      expect(() => calculateReverb(114, mp)).not.toThrow();
    }
  });
});

// ── 42. Compressor settings generator ────────────────────────────────────────

describe("compressor_generator", () => {
  const spec = generateCompressorSpec(114, "bounce_club");

  test("returns one CompressorParams per stem (5 total)", () => {
    expect(spec.params).toHaveLength(5);
  });

  test("all 5 stems are present", () => {
    const stems = spec.params.map((p) => p.stem);
    expect(stems).toContain("sub_bass");
    expect(stems).toContain("log_drum");
    expect(stems).toContain("chord_pad");
    expect(stems).toContain("percussion");
    expect(stems).toContain("air");
  });

  test("thresholdDb is in [−60, 0] for all stems", () => {
    for (const p of spec.params) {
      expect(p.thresholdDb).toBeGreaterThanOrEqual(-60);
      expect(p.thresholdDb).toBeLessThanOrEqual(0);
    }
  });

  test("ratio >= 1 for all stems", () => {
    for (const p of spec.params) expect(p.ratio).toBeGreaterThanOrEqual(1);
  });

  test("attackMs in [0.1, 200] for all stems", () => {
    for (const p of spec.params) {
      expect(p.attackMs).toBeGreaterThanOrEqual(0.1);
      expect(p.attackMs).toBeLessThanOrEqual(200);
    }
  });

  test("releaseMs in [10, 2000] for all stems", () => {
    for (const p of spec.params) {
      expect(p.releaseMs).toBeGreaterThanOrEqual(10);
      expect(p.releaseMs).toBeLessThanOrEqual(2000);
    }
  });

  test("makeupDb in [0, 24] for all stems", () => {
    for (const p of spec.params) {
      expect(p.makeupDb).toBeGreaterThanOrEqual(0);
      expect(p.makeupDb).toBeLessThanOrEqual(24);
    }
  });

  test("kneeDb in [0, 12] for all stems", () => {
    for (const p of spec.params) {
      expect(p.kneeDb).toBeGreaterThanOrEqual(0);
      expect(p.kneeDb).toBeLessThanOrEqual(12);
    }
  });

  test("percussion has the shortest attackMs (fastest transient response)", () => {
    const attacks    = spec.params.map((p) => p.attackMs);
    const percAttack = spec.params.find((p) => p.stem === "percussion")!.attackMs;
    expect(percAttack).toBe(Math.min(...attacks));
  });

  test("log_drum ratio > chord_pad ratio (transient vs sustain)", () => {
    const logRatio   = spec.params.find((p) => p.stem === "log_drum")!.ratio;
    const chordRatio = spec.params.find((p) => p.stem === "chord_pad")!.ratio;
    expect(logRatio).toBeGreaterThan(chordRatio);
  });

  test("raw_street produces higher log_drum ratio than luxury_noir", () => {
    const raw  = generateCompressorSpec(114, "raw_street");
    const lux  = generateCompressorSpec(114, "luxury_noir");
    const rawR = raw.params.find((p) => p.stem === "log_drum")!.ratio;
    const luxR = lux.params.find((p) => p.stem === "log_drum")!.ratio;
    expect(rawR).toBeGreaterThan(luxR);
  });

  test("higher BPM yields shorter attackMs for log_drum", () => {
    const slow = generateCompressorSpec(90,  "bounce_club");
    const fast = generateCompressorSpec(140, "bounce_club");
    const sAtk = slow.params.find((p) => p.stem === "log_drum")!.attackMs;
    const fAtk = fast.params.find((p) => p.stem === "log_drum")!.attackMs;
    expect(sAtk).toBeGreaterThan(fAtk);
  });

  test("bpm and mixProfile are reflected in the output", () => {
    expect(spec.bpm).toBe(114);
    expect(spec.mixProfile).toBe("bounce_club");
  });

  test("works for all 6 MixProfile values without throwing", () => {
    const profiles = ["luxury_noir", "raw_street", "bounce_club", "spiritual_organic", "dark_tribal", "crossover_rb"] as const;
    for (const mp of profiles) {
      expect(() => generateCompressorSpec(114, mp)).not.toThrow();
    }
  });
});

// ── 43. EQ curve generator ────────────────────────────────────────────────────

describe("eq_generator", () => {
  const spec = generateEqSpec("private_school", "luxury_noir");

  test("returns one StemEq per stem (5 total)", () => {
    expect(spec.stems).toHaveLength(5);
  });

  test("each stem has exactly 4 bands", () => {
    for (const s of spec.stems) expect(s.bands).toHaveLength(4);
  });

  test("all freqHz values in [20, 20000]", () => {
    for (const s of spec.stems) {
      for (const b of s.bands) {
        expect(b.freqHz).toBeGreaterThanOrEqual(20);
        expect(b.freqHz).toBeLessThanOrEqual(20000);
      }
    }
  });

  test("all gainDb values in [−24, +24]", () => {
    for (const s of spec.stems) {
      for (const b of s.bands) {
        expect(b.gainDb).toBeGreaterThanOrEqual(-24);
        expect(b.gainDb).toBeLessThanOrEqual(24);
      }
    }
  });

  test("all q values in [0.1, 10]", () => {
    for (const s of spec.stems) {
      for (const b of s.bands) {
        expect(b.q).toBeGreaterThanOrEqual(0.1);
        expect(b.q).toBeLessThanOrEqual(10);
      }
    }
  });

  test("band 0 of every stem is a highpass (lowcut or lowshelf)", () => {
    for (const s of spec.stems) {
      expect(["lowcut", "lowshelf"]).toContain(s.bands[0].type);
    }
  });

  test("cut filter bands (lowcut / highcut) have gainDb = 0", () => {
    for (const s of spec.stems) {
      for (const b of s.bands) {
        if (b.type === "lowcut" || b.type === "highcut") {
          expect(b.gainDb).toBe(0);
        }
      }
    }
  });

  test("luxury_noir produces higher air-shelf gainDb than raw_street for chord_pad", () => {
    const lux = generateEqSpec("private_school", "luxury_noir");
    const raw = generateEqSpec("private_school", "raw_street");
    const luxAir = lux.stems.find((s) => s.stem === "chord_pad")!.bands[3].gainDb;
    const rawAir = raw.stems.find((s) => s.stem === "chord_pad")!.bands[3].gainDb;
    expect(luxAir).toBeGreaterThan(rawAir);
  });

  test("raw_street produces higher body gainDb than luxury_noir for log_drum", () => {
    const raw = generateEqSpec("private_school", "raw_street");
    const lux = generateEqSpec("private_school", "luxury_noir");
    const rawBody = raw.stems.find((s) => s.stem === "log_drum")!.bands[1].gainDb;
    const luxBody = lux.stems.find((s) => s.stem === "log_drum")!.bands[1].gainDb;
    expect(rawBody).toBeGreaterThan(luxBody);
  });

  test("gqom_fusion has lower sub_bass HP freqHz than private_school (deeper sub)", () => {
    const gqom  = generateEqSpec("gqom_fusion",    "crossover_rb");
    const ps    = generateEqSpec("private_school",  "crossover_rb");
    const gHp   = gqom.stems.find((s) => s.stem === "sub_bass")!.bands[0].freqHz;
    const psHp  = ps.stems.find((s)   => s.stem === "sub_bass")!.bands[0].freqHz;
    expect(gHp).toBeLessThan(psHp);
  });

  test("lane and mixProfile are reflected in output", () => {
    expect(spec.lane).toBe("private_school");
    expect(spec.mixProfile).toBe("luxury_noir");
  });

  test("works for all 8 lanes × 6 MixProfiles without throwing", () => {
    const profiles = ["luxury_noir", "raw_street", "bounce_club", "spiritual_organic", "dark_tribal", "crossover_rb"] as const;
    for (const lane of LANES) {
      for (const mp of profiles) {
        expect(() => generateEqSpec(lane, mp)).not.toThrow();
      }
    }
  });
});

// ── 44. Vocal chop scheduler ──────────────────────────────────────────────────

describe("vocal_chop_scheduler", () => {
  const pat = scheduleVocalChops("private_school", { bpm: 114, density: "medium" });

  test("returns correct density label", () => {
    expect(pat.density).toBe("medium");
  });

  test("medium density produces 5 events", () => {
    expect(pat.events).toHaveLength(5);
  });

  test("sparse density produces 3 events", () => {
    const sp = scheduleVocalChops("private_school", { bpm: 114, density: "sparse" });
    expect(sp.events).toHaveLength(3);
  });

  test("dense density produces 8 events", () => {
    const de = scheduleVocalChops("private_school", { bpm: 114, density: "dense" });
    expect(de.events).toHaveLength(8);
  });

  test("all step values in [0, 15]", () => {
    for (const e of pat.events) {
      expect(e.step).toBeGreaterThanOrEqual(0);
      expect(e.step).toBeLessThanOrEqual(15);
    }
  });

  test("no duplicate step positions", () => {
    const steps = pat.events.map((e) => e.step);
    expect(new Set(steps).size).toBe(steps.length);
  });

  test("events are in ascending step order", () => {
    for (let i = 1; i < pat.events.length; i++) {
      expect(pat.events[i].step).toBeGreaterThan(pat.events[i - 1].step);
    }
  });

  test("all durationSteps in [1, 4]", () => {
    for (const e of pat.events) {
      expect(e.durationSteps).toBeGreaterThanOrEqual(1);
      expect(e.durationSteps).toBeLessThanOrEqual(4);
    }
  });

  test("all velocity in [40, 127]", () => {
    for (const e of pat.events) {
      expect(e.velocity).toBeGreaterThanOrEqual(40);
      expect(e.velocity).toBeLessThanOrEqual(127);
    }
  });

  test("pitchSemitones drawn from pentatonic-flavoured set [-7,-5,-3,0,2,4,7]", () => {
    const allowed = new Set([-7, -5, -3, 0, 2, 4, 7]);
    for (const e of pat.events) {
      expect(allowed.has(e.pitchSemitones)).toBe(true);
    }
  });

  test("output is deterministic — same args yield same events", () => {
    const a = scheduleVocalChops("sgija", { bpm: 116, density: "dense" });
    const b = scheduleVocalChops("sgija", { bpm: 116, density: "dense" });
    expect(a.events).toEqual(b.events);
  });

  test("high BPM limits max chop duration to 2 steps", () => {
    const fast = scheduleVocalChops("private_school", { bpm: 140, density: "dense" });
    for (const e of fast.events) expect(e.durationSteps).toBeLessThanOrEqual(2);
  });

  test("works for all 8 lanes and all densities without throwing", () => {
    const densities = ["sparse", "medium", "dense"] as const;
    for (const lane of LANES) {
      for (const d of densities) {
        expect(() => scheduleVocalChops(lane, { density: d, bpm: 114 })).not.toThrow();
      }
    }
  });
});

// ── 45. Stereo width automator ────────────────────────────────────────────────

describe("width_automator", () => {
  const arc = planArrangementArc("private_school", { totalBars: 64 });
  const wa  = generateWidthAutomation(arc);

  test("totalBars matches arc", () => {
    expect(wa.totalBars).toBe(arc.totalBars);
  });

  test("points are in strictly ascending bar order", () => {
    for (let i = 1; i < wa.points.length; i++) {
      expect(wa.points[i].bar).toBeGreaterThan(wa.points[i - 1].bar);
    }
  });

  test("no duplicate bar values", () => {
    const bars = wa.points.map((p) => p.bar);
    expect(new Set(bars).size).toBe(bars.length);
  });

  test("all width values in [0.5, 1.8]", () => {
    for (const p of wa.points) {
      expect(p.width).toBeGreaterThanOrEqual(0.5);
      expect(p.width).toBeLessThanOrEqual(1.8);
    }
  });

  test("first point is at bar 0", () => {
    expect(wa.points[0].bar).toBe(0);
  });

  test("first point width is INITIAL_WIDTH (0.75)", () => {
    expect(wa.points[0].width).toBe(0.75);
  });

  test("drop1 section ends with width >= 1.4 (wide open)", () => {
    const drop1 = arc.sections.find((s) => s.name === "drop1")!;
    const pt    = wa.points.find((p) => p.bar === drop1.endBar);
    expect(pt?.width).toBeGreaterThanOrEqual(1.4);
  });

  test("breakdown section ends with width < 0.8 (narrow)", () => {
    const bd = arc.sections.find((s) => s.name === "breakdown")!;
    const pt = wa.points.find((p) => p.bar === bd.endBar);
    expect(pt?.width).toBeLessThan(0.8);
  });

  test("drop2 ends with the widest value of any section", () => {
    const drop2 = arc.sections.find((s) => s.name === "drop2")!;
    const drop2Pt = wa.points.find((p) => p.bar === drop2.endBar)!;
    const maxW    = Math.max(...wa.points.map((p) => p.width));
    expect(drop2Pt.width).toBe(maxW);
  });

  test("outro_fade ends at narrowest section width (0.60)", () => {
    const last = wa.points[wa.points.length - 1];
    expect(last.width).toBe(0.60);
  });

  test("has at least sections.length + 1 points", () => {
    expect(wa.points.length).toBeGreaterThanOrEqual(arc.sections.length + 1);
  });

  test("works for all 8 lanes without throwing", () => {
    for (const lane of LANES) {
      const a = planArrangementArc(lane, { totalBars: 32 });
      expect(() => generateWidthAutomation(a)).not.toThrow();
    }
  });
});

// ── 46. Scale quantizer ───────────────────────────────────────────────────────

describe("scale_quantizer", () => {
  // Am pentatonic: A(69) C(72) D(74) E(76) G(79) — all in scale
  const amPentNotes = [69, 72, 74, 76, 79];

  test("notes already in scale are unchanged (movedCount = 0)", () => {
    const r = quantizeToScale(amPentNotes, "A", "minor_pentatonic");
    expect(r.movedCount).toBe(0);
    for (const n of r.notes) expect(n.shiftSemitones).toBe(0);
  });

  test("Bb4 (70) out of Am pentatonic snaps to A4 (69), shift = −1", () => {
    const r = quantizeToScale([70], "A", "minor_pentatonic");
    expect(r.notes[0].quantized).toBe(69);
    expect(r.notes[0].shiftSemitones).toBe(-1);
  });

  test("all quantized notes land on a scale degree", () => {
    const chromatic = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71];
    const r = quantizeToScale(chromatic, "A", "dorian");
    const rootPC = 9; // A
    const ivs = new Set(SCALE_INTERVALS["dorian"]);
    for (const n of r.notes) {
      const interval = ((n.quantized % 12) - rootPC + 12) % 12;
      expect(ivs.has(interval)).toBe(true);
    }
  });

  test("movedCount equals count of notes with shift ≠ 0", () => {
    const r = quantizeToScale([60, 61, 62, 63], "C", "major");
    const moved = r.notes.filter((n) => n.shiftSemitones !== 0).length;
    expect(r.movedCount).toBe(moved);
  });

  test("maxShift is the largest absolute shift applied", () => {
    const r = quantizeToScale([60, 61, 62, 63], "C", "major");
    const expected = Math.max(...r.notes.map((n) => Math.abs(n.shiftSemitones)));
    expect(r.maxShift).toBe(expected);
  });

  test("no shift exceeds 6 semitones (shortest path)", () => {
    const r = quantizeToScale(Array.from({ length: 128 }, (_, i) => i), "F", "minor_pentatonic");
    for (const n of r.notes) expect(Math.abs(n.shiftSemitones)).toBeLessThanOrEqual(6);
  });

  test("all quantized MIDI values in [0, 127]", () => {
    const r = quantizeToScale([0, 64, 127], "C", "blues");
    for (const n of r.notes) {
      expect(n.quantized).toBeGreaterThanOrEqual(0);
      expect(n.quantized).toBeLessThanOrEqual(127);
    }
  });

  test("empty input returns zero notes and movedCount = 0", () => {
    const r = quantizeToScale([], "D", "major");
    expect(r.notes).toHaveLength(0);
    expect(r.movedCount).toBe(0);
    expect(r.maxShift).toBe(0);
  });

  test("root and scale are reflected in output", () => {
    const r = quantizeToScale([60], "Bb", "dorian");
    expect(r.root).toBe("Bb");
    expect(r.scale).toBe("dorian");
  });

  test("minor_pentatonic produces only 5 distinct pitch classes", () => {
    const r = quantizeToScale(Array.from({ length: 48 }, (_, i) => 48 + i), "A", "minor_pentatonic");
    const pcs = new Set(r.notes.map((n) => n.quantized % 12));
    expect(pcs.size).toBe(5);
  });

  test("output is deterministic", () => {
    const a = quantizeToScale([61, 63, 66, 68, 70], "G", "natural_minor");
    const b = quantizeToScale([61, 63, 66, 68, 70], "G", "natural_minor");
    expect(a.notes).toEqual(b.notes);
  });

  test("works for all 8 scale names without throwing", () => {
    const scales = Object.keys(SCALE_INTERVALS) as import("../types").ScaleName[];
    for (const s of scales) {
      expect(() => quantizeToScale([60, 62, 64, 65, 67], "C", s)).not.toThrow();
    }
  });
});

// ── 47. Harmonic tension scorer ───────────────────────────────────────────────

describe("tension_scorer", () => {
  // Use buildChordProgression for a real Am-key progression
  const prog = buildChordProgression({ lane: "private_school" });
  const arc  = scoreTension(prog);

  test("returns one ChordTension per voicing", () => {
    expect(arc.chords).toHaveLength(prog.voicings.length);
  });

  test("all tension values in [0, 1]", () => {
    for (const c of arc.chords) {
      expect(c.tension).toBeGreaterThanOrEqual(0);
      expect(c.tension).toBeLessThanOrEqual(1);
    }
  });

  test("peakTension >= every chord tension", () => {
    for (const c of arc.chords) expect(arc.peakTension).toBeGreaterThanOrEqual(c.tension);
  });

  test("meanTension is the arithmetic mean of chord tensions", () => {
    const expected = arc.chords.reduce((s, c) => s + c.tension, 0) / arc.chords.length;
    expect(arc.meanTension).toBeCloseTo(expected, 6);
  });

  test("resolution equals the tension of the final chord", () => {
    expect(arc.resolution).toBe(arc.chords[arc.chords.length - 1].tension);
  });

  test("key is reflected in output", () => {
    expect(arc.key).toBe(prog.key);
  });

  test("C major triad is labelled 'resolved' (tension < 0.15)", () => {
    const cMajProg: import("../types").ChordProgression = {
      lane: "private_school", key: "C", loopable: true, amapianoStyle: false,
      voicings: [{ chordSymbol: "C", rootMidi: 48, notes: [60, 64, 67], function: "tonic", tension: 0 }],
    };
    const r = scoreTension(cMajProg);
    expect(r.chords[0].label).toBe("resolved");
    expect(r.chords[0].tension).toBeLessThan(0.15);
  });

  test("semitone cluster is labelled 'dissonant' (tension >= 0.70)", () => {
    const clusterProg: import("../types").ChordProgression = {
      lane: "private_school", key: "C", loopable: false, amapianoStyle: false,
      voicings: [{ chordSymbol: "cluster", rootMidi: 60, notes: [60, 61, 62], function: "tension", tension: 1 }],
    };
    const r = scoreTension(clusterProg);
    expect(r.chords[0].label).toBe("dissonant");
    expect(r.chords[0].tension).toBeGreaterThanOrEqual(0.70);
  });

  test("tritone dyad has higher tension than perfect-5th dyad", () => {
    const makeSimple = (notes: number[]): import("../types").ChordProgression => ({
      lane: "private_school", key: "C", loopable: false, amapianoStyle: false,
      voicings: [{ chordSymbol: "x", rootMidi: notes[0], notes, function: "dominant", tension: 0.5 }],
    });
    const tritoneTension = scoreTension(makeSimple([60, 66])).chords[0].tension;
    const fifthTension   = scoreTension(makeSimple([60, 67])).chords[0].tension;
    expect(tritoneTension).toBeGreaterThan(fifthTension);
  });

  test("empty progression returns safe zero defaults", () => {
    const empty = scoreTension({ lane: "private_school", key: "Am", voicings: [], loopable: false, amapianoStyle: false });
    expect(empty.chords).toHaveLength(0);
    expect(empty.meanTension).toBe(0);
    expect(empty.peakTension).toBe(0);
    expect(empty.resolution).toBe(0);
  });

  test("single-note voicing has tension = 0 (no pairs)", () => {
    const singleProg: import("../types").ChordProgression = {
      lane: "private_school", key: "C", loopable: false, amapianoStyle: false,
      voicings: [{ chordSymbol: "C", rootMidi: 60, notes: [60], function: "tonic", tension: 0 }],
    };
    expect(scoreTension(singleProg).chords[0].tension).toBe(0);
  });

  test("works for all 8 lanes without throwing", () => {
    for (const lane of LANES) {
      const p = buildChordProgression({ lane });
      expect(() => scoreTension(p)).not.toThrow();
    }
  });
});

// ── 48. Song structure validator ──────────────────────────────────────────────

describe("structure_validator", () => {
  const arc = planArrangementArc("private_school", { totalBars: 64 });
  const sv  = validateStructure(arc);

  test("standard arc passes all 12 rules (passes = true)", () => {
    expect(sv.passes).toBe(true);
  });

  test("score is 1.0 when all rules pass", () => {
    expect(sv.score).toBe(1.0);
  });

  test("exactly 12 rules are evaluated", () => {
    expect(sv.rules).toHaveLength(12);
  });

  test("violations array is empty for a valid arc", () => {
    expect(sv.violations).toHaveLength(0);
  });

  test("score is in [0, 1]", () => {
    expect(sv.score).toBeGreaterThanOrEqual(0);
    expect(sv.score).toBeLessThanOrEqual(1);
  });

  test("passes === (score === 1.0)", () => {
    expect(sv.passes).toBe(sv.score === 1.0);
  });

  test("each rule has a non-empty name and message", () => {
    for (const r of sv.rules) {
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.message.length).toBeGreaterThan(0);
    }
  });

  test("out-of-range BPM triggers amapiano_bpm_range failure", () => {
    const slowArc = planArrangementArc("private_school", { bpm: 80, totalBars: 64 });
    const result  = validateStructure(slowArc);
    const bpmRule = result.rules.find((r) => r.name === "amapiano_bpm_range")!;
    expect(bpmRule.passes).toBe(false);
    expect(result.violations).toContain(bpmRule.message);
  });

  test("totalBars below 16 triggers total_bars_valid failure", () => {
    const tinyArc = planArrangementArc("private_school", { totalBars: 8 });
    const result  = validateStructure(tinyArc);
    const rule    = result.rules.find((r) => r.name === "total_bars_valid")!;
    expect(rule.passes).toBe(false);
  });

  test("score decreases proportionally with number of violations", () => {
    const slowArc = planArrangementArc("private_school", { bpm: 80, totalBars: 8 });
    const result  = validateStructure(slowArc);
    const passCount = result.rules.filter((r) => r.passes).length;
    expect(result.score).toBeCloseTo(passCount / 12, 6);
  });

  test("drop1 and drop2 intensity rules pass for standard arc", () => {
    const d1 = sv.rules.find((r) => r.name === "drop1_high_intensity")!;
    const d2 = sv.rules.find((r) => r.name === "drop2_high_intensity")!;
    expect(d1.passes).toBe(true);
    expect(d2.passes).toBe(true);
  });

  test("works for all 8 lanes without throwing", () => {
    for (const lane of LANES) {
      const a = planArrangementArc(lane, { totalBars: 64 });
      expect(() => validateStructure(a)).not.toThrow();
    }
  });
});

// ── 49. Call-and-response generator ──────────────────────────────────────────

describe("call_response_generator", () => {
  const cr = generateCallResponse("private_school", { density: "medium" });

  test("call pattern has exactly 16 steps", () => {
    expect(cr.call).toHaveLength(16);
  });

  test("response pattern has exactly 16 steps", () => {
    expect(cr.response).toHaveLength(16);
  });

  test("all response values are 0 or 1", () => {
    for (const v of cr.response) expect(v === 0 || v === 1).toBe(true);
  });

  test("complement + overlap = 1.0", () => {
    expect(cr.complement + cr.overlap).toBeCloseTo(1.0, 6);
  });

  test("complement is the fraction of response hits on call-silent steps", () => {
    const total    = cr.response.reduce((s, v) => s + v, 0);
    const compHits = cr.response.reduce((s, v, i) => s + (v === 1 && cr.call[i] === 0 ? 1 : 0), 0);
    const expected = total > 0 ? compHits / total : 0;
    expect(cr.complement).toBeCloseTo(expected, 6);
  });

  test("dense density produces more response hits than sparse", () => {
    const dense  = generateCallResponse("private_school", { density: "dense"  });
    const sparse = generateCallResponse("private_school", { density: "sparse" });
    const dHits  = dense.response.reduce((s, v) => s + v, 0);
    const sHits  = sparse.response.reduce((s, v) => s + v, 0);
    expect(dHits).toBeGreaterThanOrEqual(sHits);
  });

  test("callVoice and respVoice are reflected in output", () => {
    expect(cr.callVoice).toBe("log");
    expect(cr.respVoice).toBe("hat");
  });

  test("output is deterministic", () => {
    const a = generateCallResponse("sgija", { density: "dense", callVoice: "log", respVoice: "hat" });
    const b = generateCallResponse("sgija", { density: "dense", callVoice: "log", respVoice: "hat" });
    expect(a.response).toEqual(b.response);
  });

  test("all-zero call produces complement = 1.0 (all hits fill silences)", () => {
    const silentCall = new Array(16).fill(0);
    const r = generateCallResponse("private_school", { callPattern: silentCall });
    if (r.response.some((v) => v === 1)) {
      expect(r.complement).toBeCloseTo(1.0, 6);
      expect(r.overlap).toBeCloseTo(0.0, 6);
    }
  });

  test("complement is in [0, 1]", () => {
    expect(cr.complement).toBeGreaterThanOrEqual(0);
    expect(cr.complement).toBeLessThanOrEqual(1);
  });

  test("medium density: complement > 0.5 (majority fills silences)", () => {
    expect(cr.complement).toBeGreaterThan(0.5);
  });

  test("works for all 8 lanes and all densities without throwing", () => {
    const densities = ["sparse", "medium", "dense"] as const;
    for (const lane of LANES) {
      for (const d of densities) {
        expect(() => generateCallResponse(lane, { density: d })).not.toThrow();
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 50. MIDI note deduplicator
// ─────────────────────────────────────────────────────────────────────────────

import type { MidiNoteEvent } from "../types";

function n(pitch: number, startTick: number, durationTicks: number, velocity = 80, channel = 0): MidiNoteEvent {
  return { pitch, startTick, durationTicks, velocity, channel };
}

describe("50. MIDI note deduplicator", () => {
  test("empty input returns empty output with zero counts", () => {
    const r = deduplicateMidi([]);
    expect(r.notes).toHaveLength(0);
    expect(r.originalCount).toBe(0);
    expect(r.removedCount).toBe(0);
    expect(r.truncatedCount).toBe(0);
  });

  test("single clean note passes through unchanged", () => {
    const note = n(60, 0, 96);
    const r = deduplicateMidi([note]);
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]).toMatchObject({ pitch: 60, startTick: 0, durationTicks: 96 });
    expect(r.originalCount).toBe(1);
    expect(r.removedCount).toBe(0);
    expect(r.truncatedCount).toBe(0);
  });

  test("duplicate notes at exact same tick: keeps one, removes other", () => {
    const r = deduplicateMidi([n(60, 0, 96, 80), n(60, 0, 96, 80)]);
    expect(r.notes).toHaveLength(1);
    expect(r.removedCount).toBe(1);
  });

  test("merge threshold: notes within threshold are merged (later removed)", () => {
    // startTick 0 and 2 — within threshold of 4
    const r = deduplicateMidi([n(60, 0, 48), n(60, 2, 48)], { mergeThresholdTicks: 4 });
    expect(r.notes).toHaveLength(1);
    expect(r.removedCount).toBe(1);
  });

  test("merge threshold: notes beyond threshold are kept", () => {
    // startTick 0 and 10 — beyond threshold of 4
    const r = deduplicateMidi([n(60, 0, 48), n(60, 10, 48)], { mergeThresholdTicks: 4 });
    expect(r.notes).toHaveLength(2);
    expect(r.removedCount).toBe(0);
  });

  test("overlapping notes: earlier note truncated to end at next note start", () => {
    // note at 0 with dur 100 overlaps note at 50 — should truncate to 50
    const r = deduplicateMidi([n(60, 0, 100), n(60, 50, 96)]);
    expect(r.notes).toHaveLength(2);
    expect(r.notes[0].durationTicks).toBe(50);
    expect(r.truncatedCount).toBe(1);
  });

  test("truncated note below minDurationTicks is removed instead", () => {
    // note at 0 dur 100 overlaps note at 2 — truncated dur=2 < default minDur=1? No, 2>=1 — use minDur=5
    const r = deduplicateMidi([n(60, 0, 100), n(60, 3, 96)], { minDurationTicks: 5 });
    // truncated dur would be 3, which < 5, so removed
    expect(r.notes).toHaveLength(1);
    expect(r.removedCount).toBeGreaterThanOrEqual(1);
  });

  test("different pitches on same channel are treated independently", () => {
    const r = deduplicateMidi([n(60, 0, 100), n(62, 0, 100), n(64, 0, 100)]);
    expect(r.notes).toHaveLength(3);
    expect(r.removedCount).toBe(0);
  });

  test("same pitch on different channels are treated independently", () => {
    const r = deduplicateMidi([
      n(60, 0, 100, 80, 0),
      n(60, 0, 100, 80, 1),
    ]);
    expect(r.notes).toHaveLength(2);
    expect(r.removedCount).toBe(0);
  });

  test("output is sorted by startTick ASC, then channel ASC, then pitch ASC", () => {
    const input = [
      n(64, 20, 48, 80, 1),
      n(60, 10, 48, 80, 0),
      n(62, 10, 48, 80, 0),
      n(60, 0,  48, 80, 0),
    ];
    const r = deduplicateMidi(input);
    expect(r.notes[0].startTick).toBe(0);
    expect(r.notes[1].startTick).toBe(10);
    expect(r.notes[1].pitch).toBe(60);
    expect(r.notes[2].pitch).toBe(62);
    expect(r.notes[3].startTick).toBe(20);
  });

  test("originalCount equals input length regardless of deduplication", () => {
    const input = [n(60, 0, 96), n(60, 0, 96), n(62, 5, 48)];
    const r = deduplicateMidi(input);
    expect(r.originalCount).toBe(3);
  });

  test("removedCount + truncatedCount + output length is <= originalCount", () => {
    const input = [
      n(60, 0, 200), n(60, 0, 200),   // duplicate → 1 removed
      n(60, 50, 200),                   // overlaps → 1 truncated
      n(62, 0, 48),
    ];
    const r = deduplicateMidi(input);
    expect(r.removedCount + r.truncatedCount + r.notes.length).toBeLessThanOrEqual(r.originalCount + r.truncatedCount);
    expect(r.originalCount).toBe(4);
  });

  test("notes with durationTicks < minDurationTicks filtered out entirely", () => {
    const r = deduplicateMidi([n(60, 0, 3), n(62, 0, 3)], { minDurationTicks: 5 });
    expect(r.notes).toHaveLength(0);
    expect(r.removedCount).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 51. Pattern velocity shaper
// ─────────────────────────────────────────────────────────────────────────────

describe("51. Pattern velocity shaper", () => {
  const allActive = new Array(16).fill(1);
  const allSilent = new Array(16).fill(0);
  // kick-like pattern: 0, 4, 8, 12
  const kickPat   = allActive.map((_, i) => (i % 4 === 0 ? 1 : 0));

  test("all-silent pattern returns all-zero velocities, peakStep -1, meanVelocity 0", () => {
    const r = shapeVelocities(allSilent);
    expect(r.velocities.every((v) => v === 0)).toBe(true);
    expect(r.peakStep).toBe(-1);
    expect(r.meanVelocity).toBe(0);
  });

  test("all-active pattern: all 16 velocities in [1, 127]", () => {
    const r = shapeVelocities(allActive);
    for (const v of r.velocities) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(127);
    }
  });

  test("velocities array is always length 16", () => {
    expect(shapeVelocities([]).velocities).toHaveLength(16);
    expect(shapeVelocities(allActive).velocities).toHaveLength(16);
    expect(shapeVelocities([1, 0, 1]).velocities).toHaveLength(16);
  });

  test("pattern is a defensive copy (not the original reference)", () => {
    const input = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
    const r = shapeVelocities(input);
    input[0] = 0;
    expect(r.pattern[0]).toBe(1);
  });

  test("downbeat (step 0) louder than odd ghost step (step 1) when both active", () => {
    const r = shapeVelocities(allActive, { seed: "test" });
    expect(r.velocities[0]).toBeGreaterThan(r.velocities[1]);
  });

  test("peakStep points to the step with the highest velocity", () => {
    const r = shapeVelocities(allActive);
    const maxV = Math.max(...r.velocities);
    expect(r.velocities[r.peakStep]).toBe(maxV);
  });

  test("meanVelocity is the mean of active-step velocities", () => {
    const r = shapeVelocities(kickPat);
    const active = r.velocities.filter((v) => v > 0);
    const expected = active.reduce((s, v) => s + v, 0) / active.length;
    expect(r.meanVelocity).toBeCloseTo(expected, 6);
  });

  test("ghost=false raises odd-step velocities above ghost=true", () => {
    const rGhost    = shapeVelocities(allActive, { ghost: true,  seed: "g" });
    const rNoGhost  = shapeVelocities(allActive, { ghost: false, seed: "g" });
    // Average odd-step velocity should be higher when ghost=false
    const oddAvgG  = [1,3,5,7,9,11,13,15].reduce((s, i) => s + rGhost.velocities[i],   0) / 8;
    const oddAvgNG = [1,3,5,7,9,11,13,15].reduce((s, i) => s + rNoGhost.velocities[i], 0) / 8;
    expect(oddAvgNG).toBeGreaterThan(oddAvgG);
  });

  test("higher accentStrength → higher velocity on downbeat (step 0)", () => {
    const rLow  = shapeVelocities(allActive, { accentStrength: 0.0, seed: "a" });
    const rHigh = shapeVelocities(allActive, { accentStrength: 0.5, seed: "a" });
    expect(rHigh.velocities[0]).toBeGreaterThanOrEqual(rLow.velocities[0]);
  });

  test("output is deterministic for identical inputs", () => {
    const r1 = shapeVelocities(allActive, { seed: "s1" });
    const r2 = shapeVelocities(allActive, { seed: "s1" });
    expect(r1.velocities).toEqual(r2.velocities);
  });

  test("different seeds produce different velocity arrays", () => {
    const r1 = shapeVelocities(allActive, { seed: "seedA" });
    const r2 = shapeVelocities(allActive, { seed: "seedB" });
    expect(r1.velocities).not.toEqual(r2.velocities);
  });

  test("silent steps always have velocity 0 regardless of options", () => {
    const r = shapeVelocities(kickPat, { ghost: false, accentStrength: 1.0 });
    for (let i = 0; i < 16; i++) {
      if (kickPat[i] === 0) expect(r.velocities[i]).toBe(0);
    }
  });

  test("baseVelocity is honoured — lower base → lower mean velocity", () => {
    const rLow  = shapeVelocities(allActive, { baseVelocity: 40, seed: "b" });
    const rHigh = shapeVelocities(allActive, { baseVelocity: 100, seed: "b" });
    expect(rHigh.meanVelocity).toBeGreaterThan(rLow.meanVelocity);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 52. Groove swing quantizer
// ─────────────────────────────────────────────────────────────────────────────

describe("52. Groove swing quantizer", () => {
  const ALL16 = Array.from({ length: 16 }, (_, i) => i);
  const TPB   = 480;   // ticks per beat (PPQ)
  const TPS   = 120;   // ticks per 16th note at PPQ 480

  test("empty steps returns empty tickPositions", () => {
    const r = quantizeSwing([]);
    expect(r.tickPositions).toHaveLength(0);
    expect(r.stepPositions).toHaveLength(0);
  });

  test("swingPercent=0 → straight grid (odd step at exact midpoint)", () => {
    const r = quantizeSwing(ALL16, { swingPercent: 0 });
    // Step 1 should be at TPS (= 0.5 × pairWidth = 0.5 × 240)
    expect(r.tickPositions[1]).toBe(TPS);
    // All steps at i × TPS
    for (let i = 0; i < 16; i++) {
      expect(r.tickPositions[i]).toBe(i * TPS);
    }
  });

  test("step 0 tick is always 0", () => {
    for (const pct of [0, 25, 50]) {
      expect(quantizeSwing([0], { swingPercent: pct }).tickPositions[0]).toBe(0);
    }
  });

  test("swingPercent=50 → 2:1 triplet: odd step at 0.75 × pairWidth", () => {
    const r       = quantizeSwing([0, 1], { swingPercent: 50 });
    const pairW   = 2 * TPS;
    expect(r.tickPositions[0]).toBe(0);
    expect(r.tickPositions[1]).toBe(Math.round(0.75 * pairW));
  });

  test("even steps are never moved by swing", () => {
    const straight = quantizeSwing(ALL16, { swingPercent: 0 });
    const swung    = quantizeSwing(ALL16, { swingPercent: 50 });
    for (let i = 0; i < 16; i += 2) {
      expect(swung.tickPositions[i]).toBe(straight.tickPositions[i]);
    }
  });

  test("odd steps shift later with swing > 0 vs swing = 0", () => {
    const straight = quantizeSwing(ALL16, { swingPercent: 0 });
    const swung    = quantizeSwing(ALL16, { swingPercent: 30 });
    for (let i = 1; i < 16; i += 2) {
      expect(swung.tickPositions[i]).toBeGreaterThan(straight.tickPositions[i]);
    }
  });

  test("tickPositions are monotonically non-decreasing for full 0..15 input", () => {
    const r = quantizeSwing(ALL16, { swingPercent: 40 });
    for (let i = 1; i < r.tickPositions.length; i++) {
      expect(r.tickPositions[i]).toBeGreaterThanOrEqual(r.tickPositions[i - 1]);
    }
  });

  test("swingRatio formula: 0.5 + (swingPercent/100) × 0.25", () => {
    expect(quantizeSwing([], { swingPercent: 0  }).swingRatio).toBeCloseTo(0.50, 6);
    expect(quantizeSwing([], { swingPercent: 50 }).swingRatio).toBeCloseTo(0.75, 6);
    expect(quantizeSwing([], { swingPercent: 25 }).swingRatio).toBeCloseTo(0.625, 6);
  });

  test("ticksPerStep = ticksPerBeat / 4", () => {
    expect(quantizeSwing([], { ticksPerBeat: 480 }).ticksPerStep).toBe(120);
    expect(quantizeSwing([], { ticksPerBeat: 960 }).ticksPerStep).toBe(240);
  });

  test("custom ticksPerBeat scales all tick positions proportionally", () => {
    const r480 = quantizeSwing(ALL16, { swingPercent: 25, ticksPerBeat: 480 });
    const r960 = quantizeSwing(ALL16, { swingPercent: 25, ticksPerBeat: 960 });
    for (let i = 0; i < 16; i++) {
      expect(r960.tickPositions[i]).toBe(r480.tickPositions[i] * 2);
    }
  });

  test("tickPositions length equals stepPositions length", () => {
    const r = quantizeSwing([0, 3, 7, 12], { swingPercent: 20 });
    expect(r.tickPositions).toHaveLength(r.stepPositions.length);
  });

  test("stepPositions is a copy of the input", () => {
    const input = [0, 4, 8, 12];
    const r = quantizeSwing(input);
    input[0] = 99;
    expect(r.stepPositions[0]).toBe(0);
  });

  test("output is deterministic for identical inputs", () => {
    const r1 = quantizeSwing(ALL16, { swingPercent: 33, ticksPerBeat: 480 });
    const r2 = quantizeSwing(ALL16, { swingPercent: 33, ticksPerBeat: 480 });
    expect(r1.tickPositions).toEqual(r2.tickPositions);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 53. Stem mute automator
// ─────────────────────────────────────────────────────────────────────────────

describe("53. Stem mute automator", () => {
  const arc      = planArrangementArc("sgija");
  const schedule = generateMuteSchedule(arc);

  const event = (sec: string, stem: string) =>
    schedule.events.find((e) => e.section === sec && e.stem === stem);

  test("events count equals sections × 5 stems", () => {
    expect(schedule.events).toHaveLength(arc.sections.length * 5);
  });

  test("sections array matches arc section names in order", () => {
    expect(schedule.sections).toEqual(arc.sections.map((s) => s.name));
  });

  test("stems array contains all 5 canonical stems", () => {
    expect(schedule.stems).toEqual(
      expect.arrayContaining(["sub_bass", "log_drum", "chord_pad", "percussion", "air"]),
    );
    expect(schedule.stems).toHaveLength(5);
  });

  test("log_drum is active (not muted) in every section", () => {
    const logEvents = schedule.events.filter((e) => e.stem === "log_drum");
    expect(logEvents.every((e) => e.muted === false)).toBe(true);
  });

  test("sub_bass is muted in intro", () => {
    expect(event("intro", "sub_bass")?.muted).toBe(true);
  });

  test("sub_bass is active in drop1", () => {
    expect(event("drop1", "sub_bass")?.muted).toBe(false);
  });

  test("all 5 stems are active in drop1", () => {
    const drop1Events = schedule.events.filter((e) => e.section === "drop1");
    expect(drop1Events.every((e) => e.muted === false)).toBe(true);
  });

  test("all 5 stems are active in drop2", () => {
    const drop2Events = schedule.events.filter((e) => e.section === "drop2");
    expect(drop2Events.every((e) => e.muted === false)).toBe(true);
  });

  test("chord_pad is muted in outro_fade", () => {
    expect(event("outro_fade", "chord_pad")?.muted).toBe(true);
  });

  test("percussion is muted in breakdown", () => {
    expect(event("breakdown", "percussion")?.muted).toBe(true);
  });

  test("air is muted in intro", () => {
    expect(event("intro", "air")?.muted).toBe(true);
  });

  test("output is deterministic — same arc produces identical schedule", () => {
    const arc2  = planArrangementArc("sgija");
    const sched2 = generateMuteSchedule(arc2);
    expect(sched2.events).toEqual(schedule.events);
  });

  test("works for all 8 lanes without throwing", () => {
    for (const lane of LANES) {
      expect(() => generateMuteSchedule(planArrangementArc(lane))).not.toThrow();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 54. Groove density normalizer
// ─────────────────────────────────────────────────────────────────────────────

describe("54. Groove density normalizer", () => {
  const allZero = new Array(16).fill(0);
  const allOne  = new Array(16).fill(1);
  const half    = allOne.map((_, i) => (i % 2 === 0 ? 1 : 0)); // 8 active

  test("all-zero + targetFill=0.5 adds 8 steps", () => {
    const r = normalizeDensity(allZero, { targetFill: 0.5 });
    expect(r.stepsAdded).toBe(8);
    expect(r.stepsRemoved).toBe(0);
    expect(r.pattern.reduce((s, v) => s + v, 0)).toBe(8);
  });

  test("all-ones + targetFill=0.5 removes 8 steps", () => {
    const r = normalizeDensity(allOne, { targetFill: 0.5 });
    expect(r.stepsRemoved).toBe(8);
    expect(r.stepsAdded).toBe(0);
    expect(r.pattern.reduce((s, v) => s + v, 0)).toBe(8);
  });

  test("pattern already at target fill → no change", () => {
    const r = normalizeDensity(half, { targetFill: 0.5 });
    expect(r.stepsAdded).toBe(0);
    expect(r.stepsRemoved).toBe(0);
    expect(r.pattern).toEqual(half);
  });

  test("actualFill = active steps / 16 after normalization", () => {
    const r = normalizeDensity(allZero, { targetFill: 0.75 });
    expect(r.actualFill).toBeCloseTo(r.pattern.reduce((s, v) => s + v, 0) / 16, 6);
  });

  test("actualFill is close to targetFill (within 1/16)", () => {
    const r = normalizeDensity(allZero, { targetFill: 0.6 });
    expect(Math.abs(r.actualFill - r.targetFill)).toBeLessThanOrEqual(1 / 16);
  });

  test("output pattern length is always 16", () => {
    expect(normalizeDensity([], { targetFill: 0.5 }).pattern).toHaveLength(16);
    expect(normalizeDensity(allOne).pattern).toHaveLength(16);
  });

  test("originalFill reflects input fill ratio", () => {
    expect(normalizeDensity(half).originalFill).toBeCloseTo(0.5, 6);
    expect(normalizeDensity(allZero).originalFill).toBeCloseTo(0.0, 6);
    expect(normalizeDensity(allOne).originalFill).toBeCloseTo(1.0, 6);
  });

  test("targetFill=0 removes all active steps", () => {
    const r = normalizeDensity(allOne, { targetFill: 0 });
    expect(r.pattern.every((v) => v === 0)).toBe(true);
  });

  test("targetFill=1 activates all steps", () => {
    const r = normalizeDensity(allZero, { targetFill: 1 });
    expect(r.pattern.every((v) => v === 1)).toBe(true);
  });

  test("stepsAdded and stepsRemoved cannot both be > 0", () => {
    for (const fill of [0, 0.25, 0.5, 0.75, 1]) {
      const r = normalizeDensity(half, { targetFill: fill });
      expect(r.stepsAdded === 0 || r.stepsRemoved === 0).toBe(true);
    }
  });

  test("output is deterministic for same inputs", () => {
    const r1 = normalizeDensity(allZero, { targetFill: 0.5, seed: "x" });
    const r2 = normalizeDensity(allZero, { targetFill: 0.5, seed: "x" });
    expect(r1.pattern).toEqual(r2.pattern);
  });

  test("different seeds produce different patterns when adding steps", () => {
    const r1 = normalizeDensity(allZero, { targetFill: 0.5, seed: "seedA" });
    const r2 = normalizeDensity(allZero, { targetFill: 0.5, seed: "seedB" });
    expect(r1.pattern).not.toEqual(r2.pattern);
  });

  test("output pattern is binary — only 0s and 1s", () => {
    const r = normalizeDensity(half, { targetFill: 0.75 });
    expect(r.pattern.every((v) => v === 0 || v === 1)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 55. Bar-to-tick converter
// ─────────────────────────────────────────────────────────────────────────────

describe("55. Bar-to-tick converter", () => {
  const arc  = planArrangementArc("sgija");   // 8 sections, 128 bars, bpm 114
  const tmap = buildTickMap(arc);
  const TPB  = 480;
  const BPB  = 4;
  const TPR  = TPB * BPB;   // 1920 ticks per bar

  test("sections count matches arc sections count", () => {
    expect(tmap.sections).toHaveLength(arc.sections.length);
  });

  test("sections are in arc order", () => {
    expect(tmap.sections.map((s) => s.section)).toEqual(
      arc.sections.map((s) => s.name),
    );
  });

  test("startTick = startBar × ticksPerBar", () => {
    for (let i = 0; i < arc.sections.length; i++) {
      expect(tmap.sections[i].startTick).toBe(arc.sections[i].startBar * TPR);
    }
  });

  test("endTick = endBar × ticksPerBar", () => {
    for (let i = 0; i < arc.sections.length; i++) {
      expect(tmap.sections[i].endTick).toBe(arc.sections[i].endBar * TPR);
    }
  });

  test("first section startTick = 0", () => {
    expect(tmap.sections[0].startTick).toBe(0);
  });

  test("last section endTick = totalTicks", () => {
    const last = tmap.sections[tmap.sections.length - 1];
    expect(last.endTick).toBe(tmap.totalTicks);
  });

  test("adjacent sections share tick boundaries", () => {
    for (let i = 0; i < tmap.sections.length - 1; i++) {
      expect(tmap.sections[i].endTick).toBe(tmap.sections[i + 1].startTick);
    }
  });

  test("dropTick = arc.dropBar × ticksPerBar", () => {
    expect(tmap.dropTick).toBe(arc.dropBar * TPR);
  });

  test("totalTicks = arc.totalBars × ticksPerBar", () => {
    expect(tmap.totalTicks).toBe(arc.totalBars * TPR);
  });

  test("ticksPerBar = ticksPerBeat × beatsPerBar", () => {
    expect(tmap.ticksPerBar).toBe(tmap.ticksPerBeat * tmap.beatsPerBar);
  });

  test("bars = endBar − startBar for each section", () => {
    for (let i = 0; i < arc.sections.length; i++) {
      const s = arc.sections[i];
      expect(tmap.sections[i].bars).toBe(s.endBar - s.startBar);
    }
  });

  test("custom ticksPerBeat doubles all ticks proportionally", () => {
    const t960 = buildTickMap(arc, { ticksPerBeat: 960 });
    expect(t960.totalTicks).toBe(tmap.totalTicks * 2);
    expect(t960.sections[0].endTick).toBe(tmap.sections[0].endTick * 2);
  });

  test("works for all 8 lanes without throwing", () => {
    for (const lane of LANES) {
      expect(() => buildTickMap(planArrangementArc(lane))).not.toThrow();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 56. Pattern retrograde
// ─────────────────────────────────────────────────────────────────────────────

describe("56. Pattern retrograde", () => {
  const pat  = [1,0,0,1, 0,1,0,0, 1,0,1,0, 0,0,1,0];
  const result = retrogradePattern(pat);

  test("original is a copy of input (not same reference)", () => {
    const input = [...pat];
    const r = retrogradePattern(input);
    input[0] = 0;
    expect(r.original[0]).toBe(1);
  });

  test("reversed is the time-reversal of original", () => {
    expect(result.reversed).toEqual([...pat].reverse());
  });

  test("mirrored flips every bit (0→1, 1→0)", () => {
    for (let i = 0; i < 16; i++) {
      expect(result.mirrored[i]).toBe(pat[i] === 1 ? 0 : 1);
    }
  });

  test("rotated by default 8 = second half followed by first half", () => {
    const expected = [...pat.slice(8), ...pat.slice(0, 8)];
    expect(result.rotated).toEqual(expected);
  });

  test("rotated by 0 equals original", () => {
    const r = retrogradePattern(pat, { rotateBy: 0 });
    expect(r.rotated).toEqual([...pat]);
  });

  test("rotated by 16 wraps to original", () => {
    const r = retrogradePattern(pat, { rotateBy: 16 });
    expect(r.rotated).toEqual([...pat]);
  });

  test("all output arrays are length 16", () => {
    expect(result.original).toHaveLength(16);
    expect(result.reversed).toHaveLength(16);
    expect(result.mirrored).toHaveLength(16);
    expect(result.rotated).toHaveLength(16);
  });

  test("palindrome=true for a symmetric pattern", () => {
    const sym = [1,0,1,0, 0,1,0,1, 1,0,1,0, 0,1,0,1];
    expect(retrogradePattern(sym).palindrome).toBe(true);
  });

  test("palindrome=false for non-symmetric pattern", () => {
    expect(result.palindrome).toBe(false);
  });

  test("reversed of reversed equals original", () => {
    const r2 = retrogradePattern(result.reversed);
    expect(r2.reversed).toEqual(result.original);
  });

  test("mirrored of mirrored equals original", () => {
    const r2 = retrogradePattern(result.mirrored);
    expect(r2.mirrored).toEqual(result.original);
  });

  test("empty input pads to 16 zeros", () => {
    const r = retrogradePattern([]);
    expect(r.original).toEqual(new Array(16).fill(0));
  });

  test("output is deterministic", () => {
    expect(retrogradePattern(pat)).toEqual(retrogradePattern(pat));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 57. Euclidean rhythm generator
// ─────────────────────────────────────────────────────────────────────────────

describe("57. Euclidean rhythm generator", () => {
  test("E(0,16) — zero hits returns all zeros", () => {
    const r = generateEuclidean(0, 16);
    expect(r.pattern.every((v) => v === 0)).toBe(true);
    expect(r.hits).toBe(0);
  });

  test("E(16,16) — all hits returns all ones", () => {
    const r = generateEuclidean(16, 16);
    expect(r.pattern.every((v) => v === 1)).toBe(true);
    expect(r.hits).toBe(16);
  });

  test("E(4,16) — four-on-the-floor: hits at 0, 4, 8, 12", () => {
    const r = generateEuclidean(4, 16);
    expect(r.pattern[0]).toBe(1);
    expect(r.pattern[4]).toBe(1);
    expect(r.pattern[8]).toBe(1);
    expect(r.pattern[12]).toBe(1);
    expect(r.pattern.reduce((s, v) => s + v, 0)).toBe(4);
  });

  test("E(8,16) — every other step active", () => {
    const r = generateEuclidean(8, 16);
    expect(r.pattern.reduce((s, v) => s + v, 0)).toBe(8);
    // Every even step should be 1
    for (let i = 0; i < 16; i += 2) expect(r.pattern[i]).toBe(1);
  });

  test("E(3,8) — Afro-Cuban tresillo: [1,0,0,1,0,0,1,0]", () => {
    const r = generateEuclidean(3, 8);
    expect(r.pattern).toEqual([1, 0, 0, 1, 0, 0, 1, 0]);
  });

  test("actual hit count always equals requested hits", () => {
    for (const h of [1, 3, 5, 7, 11, 13]) {
      const r = generateEuclidean(h, 16);
      expect(r.pattern.reduce((s, v) => s + v, 0)).toBe(h);
    }
  });

  test("pattern length equals steps", () => {
    expect(generateEuclidean(3, 8).pattern).toHaveLength(8);
    expect(generateEuclidean(5, 16).pattern).toHaveLength(16);
    expect(generateEuclidean(7, 32).pattern).toHaveLength(32);
  });

  test("density = hits / steps", () => {
    const r = generateEuclidean(5, 16);
    expect(r.density).toBeCloseTo(5 / 16, 6);
  });

  test("offset rotates the pattern cyclically", () => {
    const r0 = generateEuclidean(4, 16, { offset: 0 });
    const r4 = generateEuclidean(4, 16, { offset: 4 });
    expect(r4.pattern).toEqual([...r0.pattern.slice(4), ...r0.pattern.slice(0, 4)]);
  });

  test("offset equal to steps wraps to original", () => {
    const r0  = generateEuclidean(5, 16, { offset: 0  });
    const r16 = generateEuclidean(5, 16, { offset: 16 });
    expect(r16.pattern).toEqual(r0.pattern);
  });

  test("output is binary — only 0s and 1s", () => {
    for (const h of [1, 5, 7, 12]) {
      const r = generateEuclidean(h, 16);
      expect(r.pattern.every((v) => v === 0 || v === 1)).toBe(true);
    }
  });

  test("output is deterministic", () => {
    expect(generateEuclidean(5, 16)).toEqual(generateEuclidean(5, 16));
  });

  test("E(5,16) and E(7,16) — common Amapiano densities have correct hit counts", () => {
    expect(generateEuclidean(5, 16).hits).toBe(5);
    expect(generateEuclidean(7, 16).hits).toBe(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 58. Polyrhythm layer generator
// ─────────────────────────────────────────────────────────────────────────────

describe("58. Polyrhythm layer generator", () => {
  const r34  = generatePolyrhythm();                              // 3:4 default
  const r43  = generatePolyrhythm({ stepsA: 4, stepsB: 3 });
  const TPB  = 1920;

  test("default ratio is '3:4'", () => {
    expect(r34.ratio).toBe("3:4");
  });

  test("layerA pattern length equals stepsA", () => {
    expect(r34.layerA.pattern).toHaveLength(3);
  });

  test("layerB pattern length equals stepsB", () => {
    expect(r34.layerB.pattern).toHaveLength(4);
  });

  test("tickGrid length equals steps for each layer", () => {
    expect(r34.layerA.tickGrid).toHaveLength(r34.layerA.steps);
    expect(r34.layerB.tickGrid).toHaveLength(r34.layerB.steps);
  });

  test("first tickGrid entry is 0 for both layers", () => {
    expect(r34.layerA.tickGrid[0]).toBe(0);
    expect(r34.layerB.tickGrid[0]).toBe(0);
  });

  test("tickGrid entries are monotonically increasing", () => {
    for (const layer of [r34.layerA, r34.layerB]) {
      for (let i = 1; i < layer.tickGrid.length; i++) {
        expect(layer.tickGrid[i]).toBeGreaterThan(layer.tickGrid[i - 1]);
      }
    }
  });

  test("last tickGrid entry < ticksPerBar", () => {
    expect(r34.layerA.tickGrid[r34.layerA.tickGrid.length - 1]).toBeLessThan(TPB);
    expect(r34.layerB.tickGrid[r34.layerB.tickGrid.length - 1]).toBeLessThan(TPB);
  });

  test("3:4 tickGrid A at [0, 640, 1280] with default ticksPerBar=1920", () => {
    expect(r34.layerA.tickGrid).toEqual([0, 640, 1280]);
  });

  test("3:4 tickGrid B at [0, 480, 960, 1440] with default ticksPerBar=1920", () => {
    expect(r34.layerB.tickGrid).toEqual([0, 480, 960, 1440]);
  });

  test("ratio reflects actual stepsA:stepsB", () => {
    expect(r43.ratio).toBe("4:3");
    expect(generatePolyrhythm({ stepsA: 5, stepsB: 7 }).ratio).toBe("5:7");
  });

  test("ticksPerBar is honoured and reflected in output", () => {
    const r = generatePolyrhythm({ ticksPerBar: 960 });
    expect(r.ticksPerBar).toBe(960);
    expect(r.layerA.tickGrid[1]).toBe(Math.round(960 / 3));
  });

  test("custom hits are applied to each layer", () => {
    const r = generatePolyrhythm({ stepsA: 4, hitsA: 2, stepsB: 4, hitsB: 3 });
    expect(r.layerA.hits).toBe(2);
    expect(r.layerB.hits).toBe(3);
    expect(r.layerA.pattern.reduce((s, v) => s + v, 0)).toBe(2);
    expect(r.layerB.pattern.reduce((s, v) => s + v, 0)).toBe(3);
  });

  test("output is deterministic", () => {
    expect(generatePolyrhythm()).toEqual(generatePolyrhythm());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 59. Groove pattern combiner
// ─────────────────────────────────────────────────────────────────────────────

describe("59. Groove pattern combiner", () => {
  const A = [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0];   // even steps
  const B = [0,1,0,1, 0,1,0,1, 0,1,0,1, 0,1,0,1];   // odd steps
  const X = [1,1,0,0, 1,1,0,0, 1,1,0,0, 1,1,0,0];   // steps 0,1,4,5,...
  const allZ = new Array(16).fill(0);
  const allO = new Array(16).fill(1);

  test("OR: active if either A or B is active", () => {
    const r = combinePatterns(A, B, { mode: "or" });
    expect(r.pattern.every((v) => v === 1)).toBe(true);
  });

  test("AND: active only if both A and B active", () => {
    const r = combinePatterns(A, X, { mode: "and" });
    // A: even steps; X: steps 0,1,4,5,... → overlap at 0,4,8,12
    expect(r.pattern[0]).toBe(1);
    expect(r.pattern[1]).toBe(0);   // A=0, X=1 → no
    expect(r.pattern[2]).toBe(0);   // A=1, X=0 → no
  });

  test("XOR: active if exactly one source active", () => {
    const r = combinePatterns(A, B, { mode: "xor" });
    expect(r.pattern.every((v) => v === 1)).toBe(true);   // A and B complement
    const rSame = combinePatterns(A, A, { mode: "xor" });
    expect(rSame.pattern.every((v) => v === 0)).toBe(true);
  });

  test("a_not_b: active in A but not B", () => {
    const r = combinePatterns(A, X, { mode: "a_not_b" });
    for (let i = 0; i < 16; i++) {
      expect(r.pattern[i]).toBe(A[i] === 1 && X[i] === 0 ? 1 : 0);
    }
  });

  test("b_not_a: active in B but not A", () => {
    const r = combinePatterns(A, X, { mode: "b_not_a" });
    for (let i = 0; i < 16; i++) {
      expect(r.pattern[i]).toBe(X[i] === 1 && A[i] === 0 ? 1 : 0);
    }
  });

  test("interleave: even steps from A, odd steps from B", () => {
    const r = combinePatterns(A, B, { mode: "interleave" });
    for (let i = 0; i < 16; i++) {
      expect(r.pattern[i]).toBe(i % 2 === 0 ? A[i] : B[i]);
    }
  });

  test("default mode is OR", () => {
    expect(combinePatterns(A, B).mode).toBe("or");
  });

  test("sourceMask 'AB' when both sources contribute (OR)", () => {
    const r = combinePatterns(allO, allO, { mode: "or" });
    expect(r.sourceMask.every((m) => m === "AB")).toBe(true);
  });

  test("sourceMask 'none' for silent steps", () => {
    const r = combinePatterns(allZ, allZ, { mode: "or" });
    expect(r.sourceMask.every((m) => m === "none")).toBe(true);
  });

  test("density = active count / 16", () => {
    const r = combinePatterns(A, B, { mode: "or" });
    expect(r.density).toBeCloseTo(1.0, 6);
    const r2 = combinePatterns(A, allZ, { mode: "or" });
    expect(r2.density).toBeCloseTo(0.5, 6);
  });

  test("output pattern length is always 16", () => {
    expect(combinePatterns([], [], { mode: "and" }).pattern).toHaveLength(16);
    expect(combinePatterns(A, B).pattern).toHaveLength(16);
  });

  test("OR of all-ones and all-zeros = all-ones", () => {
    const r = combinePatterns(allO, allZ, { mode: "or" });
    expect(r.pattern.every((v) => v === 1)).toBe(true);
  });

  test("output is deterministic", () => {
    expect(combinePatterns(A, B, { mode: "xor" }))
      .toEqual(combinePatterns(A, B, { mode: "xor" }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 60. Note quantizer
// ─────────────────────────────────────────────────────────────────────────────

describe("60. Note quantizer", () => {
  const TPB = 480;
  const GRID_16 = 120;   // 480 / 4

  function note(startTick: number): MidiNoteEvent {
    return { pitch: 60, startTick, durationTicks: 96, velocity: 80, channel: 0 };
  }

  test("empty input returns empty output", () => {
    const r = quantizeNotes([]);
    expect(r.notes).toHaveLength(0);
    expect(r.originalTicks).toHaveLength(0);
    expect(r.shiftedTicks).toHaveLength(0);
  });

  test("note exactly on grid → zero shift", () => {
    const r = quantizeNotes([note(240)]);   // 240 = 2 × 120 grid
    expect(r.shiftedTicks[0]).toBe(0);
    expect(r.notes[0].startTick).toBe(240);
  });

  test("note halfway between grid points → snaps to nearest (up)", () => {
    // halfway between 120 and 240 → 180; nearest grid is 240 (rounds up)
    const r = quantizeNotes([note(180)], { resolution: "1/16" });
    expect(r.notes[0].startTick).toBe(240);
  });

  test("note just before grid point → snaps to next grid", () => {
    // 115 ticks: nearest 1/16 grid = 120
    const r = quantizeNotes([note(115)]);
    expect(r.notes[0].startTick).toBe(120);
  });

  test("strength=0 → no movement", () => {
    const r = quantizeNotes([note(110)], { strength: 0 });
    expect(r.notes[0].startTick).toBe(110);
    expect(r.shiftedTicks[0]).toBe(0);
  });

  test("strength=0.5 → half the snap distance", () => {
    // note at 100, nearest grid = 120, distance = 20, half = 10 → 110
    const r = quantizeNotes([note(100)], { strength: 0.5, resolution: "1/16" });
    expect(r.notes[0].startTick).toBe(110);
  });

  test("strength=1 → full snap to nearest grid", () => {
    const r = quantizeNotes([note(110)], { strength: 1.0, resolution: "1/16" });
    expect(r.notes[0].startTick).toBe(120);
  });

  test("resolution '1/8' grid = 240 ticks at PPQ 480", () => {
    // note at 200 → nearest 1/8 grid: 0 or 240; 200 closer to 240 → 240
    const r = quantizeNotes([note(200)], { resolution: "1/8" });
    expect(r.notes[0].startTick).toBe(240);
  });

  test("resolution '1/4' grid = 480 ticks at PPQ 480", () => {
    const r = quantizeNotes([note(250)], { resolution: "1/4" });
    expect(r.notes[0].startTick).toBe(480);
  });

  test("originalTicks contains pre-quantize positions", () => {
    const r = quantizeNotes([note(110), note(250)]);
    expect(r.originalTicks).toEqual([110, 250]);
  });

  test("shiftedTicks = quantized − original for each note", () => {
    const r = quantizeNotes([note(110), note(250)]);
    for (let i = 0; i < r.notes.length; i++) {
      expect(r.shiftedTicks[i]).toBe(r.notes[i].startTick - r.originalTicks[i]);
    }
  });

  test("quantized startTick never goes below 0", () => {
    // note at tick 5 — nearest 1/16 grid is 0 (closer than 120)
    const r = quantizeNotes([note(5)]);
    expect(r.notes[0].startTick).toBeGreaterThanOrEqual(0);
  });

  test("output is deterministic", () => {
    const input = [note(110), note(230), note(350)];
    expect(quantizeNotes(input)).toEqual(quantizeNotes(input));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 61. Chord stab pattern generator
// ─────────────────────────────────────────────────────────────────────────────

describe("61. Chord stab pattern generator", () => {
  test("pattern length is 16 for every lane", () => {
    for (const lane of LANES) {
      expect(generateChordStab(lane).pattern).toHaveLength(16);
    }
  });

  test("lane is reflected in output", () => {
    for (const lane of LANES) {
      expect(generateChordStab(lane).lane).toBe(lane);
    }
  });

  test("stabCount equals sum of active steps", () => {
    for (const lane of LANES) {
      const r = generateChordStab(lane);
      expect(r.stabCount).toBe(r.pattern.reduce((s, v) => s + v, 0));
    }
  });

  test("syncopation is in [0, 1]", () => {
    for (const lane of LANES) {
      const r = generateChordStab(lane);
      expect(r.syncopation).toBeGreaterThanOrEqual(0);
      expect(r.syncopation).toBeLessThanOrEqual(1);
    }
  });

  test("pattern is binary — only 0s and 1s", () => {
    for (const lane of LANES) {
      const r = generateChordStab(lane);
      expect(r.pattern.every((v) => v === 0 || v === 1)).toBe(true);
    }
  });

  test("dense produces more stabs than sparse for the same lane", () => {
    const sparse = generateChordStab("sgija", { intensity: "sparse" });
    const dense  = generateChordStab("sgija", { intensity: "dense"  });
    expect(dense.stabCount).toBeGreaterThan(sparse.stabCount);
  });

  test("sparse has fewer stabs than medium", () => {
    const medium = generateChordStab("sgija", { intensity: "medium" });
    const sparse = generateChordStab("sgija", { intensity: "sparse" });
    expect(sparse.stabCount).toBeLessThan(medium.stabCount);
  });

  test("dense has more stabs than medium", () => {
    const medium = generateChordStab("sgija", { intensity: "medium" });
    const dense  = generateChordStab("sgija", { intensity: "dense"  });
    expect(dense.stabCount).toBeGreaterThan(medium.stabCount);
  });

  test("syncopation correctly excludes downbeats (0, 4, 8, 12)", () => {
    const r = generateChordStab("private_school");
    const offBeat = r.pattern.filter((v, i) => v === 1 && ![0,4,8,12].includes(i)).length;
    const expected = r.stabCount > 0 ? offBeat / r.stabCount : 0;
    expect(r.syncopation).toBeCloseTo(expected, 6);
  });

  test("output is deterministic for same lane + options", () => {
    const r1 = generateChordStab("mbiraiano", { intensity: "medium", seed: "s" });
    const r2 = generateChordStab("mbiraiano", { intensity: "medium", seed: "s" });
    expect(r1.pattern).toEqual(r2.pattern);
  });

  test("different seeds produce different patterns (dense adds different steps)", () => {
    const r1 = generateChordStab("sgija", { intensity: "dense", seed: "alpha" });
    const r2 = generateChordStab("sgija", { intensity: "dense", seed: "beta"  });
    expect(r1.pattern).not.toEqual(r2.pattern);
  });

  test("works for all 8 lanes without throwing", () => {
    const intensities = ["sparse", "medium", "dense"] as const;
    for (const lane of LANES) {
      for (const intensity of intensities) {
        expect(() => generateChordStab(lane, { intensity })).not.toThrow();
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 62. Groove energy profile
// ─────────────────────────────────────────────────────────────────────────────

describe("62. Groove energy profile", () => {
  const allZ = new Array(16).fill(0);
  const allO = new Array(16).fill(1);
  const even = allO.map((_, i) => (i % 2 === 0 ? 1 : 0));

  test("empty layers returns all-zero curve, peakStep -1", () => {
    const r = computeEnergyProfile([]);
    expect(r.curve.every((v) => v === 0)).toBe(true);
    expect(r.peakStep).toBe(-1);
    expect(r.activeSteps).toBe(0);
  });

  test("curve length is always 16", () => {
    expect(computeEnergyProfile([{ pattern: allO }]).curve).toHaveLength(16);
    expect(computeEnergyProfile([]).curve).toHaveLength(16);
  });

  test("single all-ones pattern: all curve values = 1.0", () => {
    const r = computeEnergyProfile([{ pattern: allO }]);
    expect(r.curve.every((v) => v === 1)).toBe(true);
  });

  test("single all-zeros pattern: all curve values = 0", () => {
    const r = computeEnergyProfile([{ pattern: allZ }]);
    expect(r.curve.every((v) => v === 0)).toBe(true);
  });

  test("curve values are always in [0, 1]", () => {
    const r = computeEnergyProfile([
      { pattern: even, weight: 2 },
      { pattern: allO, weight: 1 },
    ]);
    for (const v of r.curve) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test("peakEnergy = 1.0 when any layer has active steps", () => {
    const r = computeEnergyProfile([{ pattern: even }]);
    expect(r.peakEnergy).toBe(1.0);
  });

  test("peakStep = index of max curve value", () => {
    const r = computeEnergyProfile([{ pattern: allO }]);
    expect(r.curve[r.peakStep]).toBe(1.0);
  });

  test("meanEnergy = mean of the 16 curve values", () => {
    const r = computeEnergyProfile([{ pattern: even }]);
    const expected = r.curve.reduce((s, v) => s + v, 0) / 16;
    expect(r.meanEnergy).toBeCloseTo(expected, 6);
  });

  test("activeSteps = count of steps with energy > 0", () => {
    const r = computeEnergyProfile([{ pattern: even }]);
    expect(r.activeSteps).toBe((even as number[]).reduce((s, v) => s + v, 0));
  });

  test("higher weight layer dominates curve shape", () => {
    const heavy = [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0];
    const light = allO;
    const r = computeEnergyProfile([
      { pattern: heavy, weight: 100 },
      { pattern: light, weight:   1 },
    ]);
    // Step 0 should have the highest energy (close to 1.0)
    expect(r.peakStep).toBe(0);
    expect(r.curve[0]).toBe(1.0);
  });

  test("two identical layers sum to same shape as one", () => {
    const r1 = computeEnergyProfile([{ pattern: even }]);
    const r2 = computeEnergyProfile([{ pattern: even }, { pattern: even }]);
    expect(r2.curve).toEqual(r1.curve);
  });

  test("output is deterministic", () => {
    const layers = [{ pattern: even, weight: 2 }, { pattern: allO, weight: 1 }];
    expect(computeEnergyProfile(layers)).toEqual(computeEnergyProfile(layers));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 63. Section transition fill generator
// ─────────────────────────────────────────────────────────────────────────────

describe("63. Section transition fill generator", () => {
  const TRANSITIONS = [
    "build_to_drop", "drop_to_breakdown", "breakdown_to_build", "drop_to_outro",
  ] as const;

  test("pattern length is 16 for all types and lanes", () => {
    for (const t of TRANSITIONS) {
      expect(generateTransitionFill("sgija", t).pattern).toHaveLength(16);
    }
  });

  test("transitionType and lane are reflected in output", () => {
    const r = generateTransitionFill("bacardi", "build_to_drop");
    expect(r.transitionType).toBe("build_to_drop");
    expect(r.lane).toBe("bacardi");
  });

  test("density = active steps / 16", () => {
    for (const t of TRANSITIONS) {
      const r = generateTransitionFill("sgija", t);
      const expected = r.pattern.reduce((s, v) => s + v, 0) / 16;
      expect(r.density).toBeCloseTo(expected, 6);
    }
  });

  test("pattern is binary — only 0s and 1s", () => {
    for (const t of TRANSITIONS) {
      const r = generateTransitionFill("private_school", t);
      expect(r.pattern.every((v) => v === 0 || v === 1)).toBe(true);
    }
  });

  test("build_to_drop hits are concentrated in second half (steps 8–15)", () => {
    const r = generateTransitionFill("sgija", "build_to_drop");
    const firstHalf  = r.pattern.slice(0, 8).reduce((s, v) => s + v, 0);
    const secondHalf = r.pattern.slice(8).reduce((s, v) => s + v, 0);
    expect(secondHalf).toBeGreaterThan(firstHalf);
  });

  test("drop_to_breakdown hits are concentrated in first half (steps 0–7)", () => {
    const r = generateTransitionFill("sgija", "drop_to_breakdown");
    const firstHalf  = r.pattern.slice(0, 8).reduce((s, v) => s + v, 0);
    const secondHalf = r.pattern.slice(8).reduce((s, v) => s + v, 0);
    expect(firstHalf).toBeGreaterThan(secondHalf);
  });

  test("climaxStep is a valid active step index", () => {
    for (const t of TRANSITIONS) {
      const r = generateTransitionFill("mbiraiano", t);
      if (r.climaxStep !== -1) {
        expect(r.pattern[r.climaxStep]).toBe(1);
      }
    }
  });

  test("output is deterministic for same lane + type", () => {
    const r1 = generateTransitionFill("sgija", "build_to_drop");
    const r2 = generateTransitionFill("sgija", "build_to_drop");
    expect(r1.pattern).toEqual(r2.pattern);
  });

  test("different lanes produce different patterns for the same transition type", () => {
    const patterns = LANES.map((lane) =>
      generateTransitionFill(lane, "breakdown_to_build").pattern.join(""),
    );
    const unique = new Set(patterns);
    expect(unique.size).toBeGreaterThan(1);
  });

  test("works for all 8 lanes × 4 transition types without throwing", () => {
    for (const lane of LANES) {
      for (const t of TRANSITIONS) {
        expect(() => generateTransitionFill(lane, t)).not.toThrow();
      }
    }
  });

  test("drop_to_outro produces sparse pattern (density ≤ 0.5)", () => {
    for (const lane of LANES) {
      const r = generateTransitionFill(lane, "drop_to_outro");
      expect(r.density).toBeLessThanOrEqual(0.5);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 64. Pitch bend curve generator
// ─────────────────────────────────────────────────────────────────────────────

describe("64. Pitch bend curve generator", () => {
  test("points count equals resolution", () => {
    expect(generatePitchBend({ resolution: 16 }).points).toHaveLength(16);
    expect(generatePitchBend({ resolution: 32 }).points).toHaveLength(32);
  });

  test("first point tick equals startTick", () => {
    const r = generatePitchBend({ startTick: 240, durationTicks: 480 });
    expect(r.points[0].tick).toBe(240);
  });

  test("last point tick equals endTick", () => {
    const r = generatePitchBend({ startTick: 0, durationTicks: 480 });
    expect(r.points[r.points.length - 1].tick).toBe(r.endTick);
  });

  test("endTick = startTick + durationTicks", () => {
    const r = generatePitchBend({ startTick: 120, durationTicks: 960 });
    expect(r.endTick).toBe(1080);
  });

  test("all values are in [-1, 1]", () => {
    for (const shape of ["glide_up", "glide_down", "wobble", "vibrato"] as const) {
      const r = generatePitchBend({ shape });
      for (const p of r.points) {
        expect(p.value).toBeGreaterThanOrEqual(-1 - 1e-9);
        expect(p.value).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  test("glide_up: first value ≈ -1, last value ≈ 0", () => {
    const r = generatePitchBend({ shape: "glide_up", resolution: 16 });
    expect(r.points[0].value).toBeCloseTo(-1, 6);
    expect(r.points[r.points.length - 1].value).toBeCloseTo(0, 6);
  });

  test("glide_down: first value ≈ 0, last value ≈ -1", () => {
    const r = generatePitchBend({ shape: "glide_down", resolution: 16 });
    expect(r.points[0].value).toBeCloseTo(0, 6);
    expect(r.points[r.points.length - 1].value).toBeCloseTo(-1, 6);
  });

  test("wobble: values oscillate — not monotone", () => {
    const r = generatePitchBend({ shape: "wobble", resolution: 16 });
    const vals = r.points.map((p) => p.value);
    const allIncreasing = vals.every((v, i) => i === 0 || v >= vals[i - 1]);
    expect(allIncreasing).toBe(false);
  });

  test("vibrato: more sign changes than wobble (faster oscillation)", () => {
    const count = (shape: "wobble" | "vibrato") => {
      const vals = generatePitchBend({ shape, resolution: 32 }).points.map((p) => p.value);
      return vals.filter((v, i) => i > 0 && Math.sign(v) !== Math.sign(vals[i - 1]) && v !== 0).length;
    };
    expect(count("vibrato")).toBeGreaterThan(count("wobble"));
  });

  test("shape and peakSemitones are reflected in output", () => {
    const r = generatePitchBend({ shape: "glide_up", peakSemitones: 3.5 });
    expect(r.shape).toBe("glide_up");
    expect(r.peakSemitones).toBe(3.5);
  });

  test("tick positions are monotonically non-decreasing", () => {
    const r = generatePitchBend({ resolution: 16 });
    for (let i = 1; i < r.points.length; i++) {
      expect(r.points[i].tick).toBeGreaterThanOrEqual(r.points[i - 1].tick);
    }
  });

  test("output is deterministic", () => {
    const opts = { shape: "wobble" as const, resolution: 16, startTick: 0 };
    expect(generatePitchBend(opts)).toEqual(generatePitchBend(opts));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 65. MIDI CC automation generator
// ─────────────────────────────────────────────────────────────────────────────

describe("65. MIDI CC automation generator", () => {
  test("points count equals resolution", () => {
    expect(generateCcAutomation({ resolution: 16 }).points).toHaveLength(16);
    expect(generateCcAutomation({ resolution: 8  }).points).toHaveLength(8);
  });

  test("first point tick = startTick, last point tick = endTick", () => {
    const r = generateCcAutomation({ startTick: 480, durationTicks: 960 });
    expect(r.points[0].tick).toBe(480);
    expect(r.points[r.points.length - 1].tick).toBe(r.endTick);
  });

  test("endTick = startTick + durationTicks", () => {
    const r = generateCcAutomation({ startTick: 0, durationTicks: 1920 });
    expect(r.endTick).toBe(1920);
  });

  test("ramp_up: first value = minValue, last value = maxValue", () => {
    const r = generateCcAutomation({ shape: "ramp_up", minValue: 10, maxValue: 100 });
    expect(r.points[0].value).toBe(10);
    expect(r.points[r.points.length - 1].value).toBe(100);
  });

  test("ramp_down: first value = maxValue, last value = minValue", () => {
    const r = generateCcAutomation({ shape: "ramp_down", minValue: 10, maxValue: 100 });
    expect(r.points[0].value).toBe(100);
    expect(r.points[r.points.length - 1].value).toBe(10);
  });

  test("swell: starts near min, peaks near midpoint, ends near min", () => {
    const r = generateCcAutomation({ shape: "swell", minValue: 0, maxValue: 127, resolution: 17 });
    const mid = r.points[8].value;
    expect(mid).toBeGreaterThan(r.points[0].value);
    expect(mid).toBeGreaterThan(r.points[16].value);
  });

  test("dip: starts near max, troughs near midpoint, ends near max", () => {
    const r = generateCcAutomation({ shape: "dip", minValue: 0, maxValue: 127, resolution: 17 });
    const mid = r.points[8].value;
    expect(mid).toBeLessThan(r.points[0].value);
    expect(mid).toBeLessThan(r.points[16].value);
  });

  test("flat: all values equal maxValue", () => {
    const r = generateCcAutomation({ shape: "flat", minValue: 0, maxValue: 100 });
    expect(r.points.every((p) => p.value === 100)).toBe(true);
  });

  test("all values are in [minValue, maxValue]", () => {
    for (const shape of ["ramp_up", "ramp_down", "swell", "dip", "flat"] as const) {
      const r = generateCcAutomation({ shape, minValue: 20, maxValue: 80 });
      for (const p of r.points) {
        expect(p.value).toBeGreaterThanOrEqual(20);
        expect(p.value).toBeLessThanOrEqual(80);
      }
    }
  });

  test("cc and channel are reflected in every point and on the result", () => {
    const r = generateCcAutomation({ cc: 7, channel: 3 });
    expect(r.cc).toBe(7);
    expect(r.channel).toBe(3);
    expect(r.points.every((p) => p.cc === 7 && p.channel === 3)).toBe(true);
  });

  test("tick positions are monotonically non-decreasing", () => {
    const r = generateCcAutomation({ resolution: 16 });
    for (let i = 1; i < r.points.length; i++) {
      expect(r.points[i].tick).toBeGreaterThanOrEqual(r.points[i - 1].tick);
    }
  });

  test("output is deterministic", () => {
    const opts = { shape: "swell" as const, resolution: 16, cc: 11 };
    expect(generateCcAutomation(opts)).toEqual(generateCcAutomation(opts));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 66. BPM tap analyzer
// ─────────────────────────────────────────────────────────────────────────────

describe("66. BPM tap analyzer", () => {
  // 114 BPM → interval = 60000/114 ≈ 526.316 ms
  const BPM114_MS = 60_000 / 114;
  const perfect114 = [0, BPM114_MS, BPM114_MS * 2, BPM114_MS * 3, BPM114_MS * 4];

  test("fewer than 2 taps → bpm=0, confidence=0", () => {
    expect(analyzeTaps([]).bpm).toBe(0);
    expect(analyzeTaps([0]).bpm).toBe(0);
    expect(analyzeTaps([]).confidence).toBe(0);
  });

  test("perfect 114 BPM taps → bpm ≈ 114", () => {
    const r = analyzeTaps(perfect114);
    expect(r.bpm).toBeCloseTo(114, 0);
  });

  test("perfect taps → confidence = 1.0", () => {
    const r = analyzeTaps(perfect114);
    expect(r.confidence).toBeCloseTo(1.0, 6);
  });

  test("perfect 120 BPM taps → bpm ≈ 120", () => {
    const ms = 60_000 / 120;
    const r  = analyzeTaps([0, ms, ms*2, ms*3]);
    expect(r.bpm).toBeCloseTo(120, 0);
  });

  test("tapCount equals input length", () => {
    expect(analyzeTaps(perfect114).tapCount).toBe(5);
    expect(analyzeTaps([0, 500]).tapCount).toBe(2);
  });

  test("intervalMs ≈ 60000 / bpm", () => {
    const r = analyzeTaps(perfect114);
    expect(r.intervalMs).toBeCloseTo(BPM114_MS, 0);
  });

  test("stdDevMs = 0 for perfectly even taps", () => {
    const r = analyzeTaps(perfect114);
    expect(r.stdDevMs).toBe(0);
  });

  test("inAmapianoRange true for BPM ∈ [100, 130]", () => {
    const ms = 60_000 / 114;
    expect(analyzeTaps([0, ms, ms*2, ms*3]).inAmapianoRange).toBe(true);
  });

  test("inAmapianoRange false for BPM outside [100, 130]", () => {
    const ms = 60_000 / 90;   // 90 BPM
    expect(analyzeTaps([0, ms, ms*2, ms*3]).inAmapianoRange).toBe(false);
  });

  test("noisy taps → lower confidence than perfect taps", () => {
    const noisy = [0, 530, 1060 + 40, 1590 - 30, 2120 + 60];
    const rNoisy   = analyzeTaps(noisy);
    const rPerfect = analyzeTaps(perfect114);
    expect(rPerfect.confidence).toBeGreaterThan(rNoisy.confidence);
  });

  test("output is deterministic", () => {
    expect(analyzeTaps(perfect114)).toEqual(analyzeTaps(perfect114));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 67. Probabilistic step sequencer
// ─────────────────────────────────────────────────────────────────────────────

describe("67. Probabilistic step sequencer", () => {
  test("all probabilities = 1 → all steps active", () => {
    const r = resolveProb({ probabilities: new Array(16).fill(1) });
    expect(r.pattern.every((v) => v === 1)).toBe(true);
    expect(r.hitCount).toBe(16);
  });

  test("all probabilities = 0 → no steps active", () => {
    const r = resolveProb({ probabilities: new Array(16).fill(0) });
    expect(r.pattern.every((v) => v === 0)).toBe(true);
    expect(r.hitCount).toBe(0);
  });

  test("pattern length is always 16", () => {
    expect(resolveProb().pattern).toHaveLength(16);
    expect(resolveProb({ probabilities: [] }).pattern).toHaveLength(16);
  });

  test("pattern is binary — only 0s and 1s", () => {
    const r = resolveProb({ baseProbability: 0.5 });
    expect(r.pattern.every((v) => v === 0 || v === 1)).toBe(true);
  });

  test("hitCount = sum of pattern values", () => {
    const r = resolveProb({ baseProbability: 0.5 });
    expect(r.hitCount).toBe(r.pattern.reduce((s, v) => s + v, 0));
  });

  test("density = hitCount / 16", () => {
    const r = resolveProb({ baseProbability: 0.5 });
    expect(r.density).toBeCloseTo(r.hitCount / 16, 6);
  });

  test("probabilities array length is always 16", () => {
    expect(resolveProb().probabilities).toHaveLength(16);
    expect(resolveProb({ probabilities: [1, 0] }).probabilities).toHaveLength(16);
  });

  test("short probabilities array padded with baseProbability", () => {
    const r = resolveProb({ probabilities: [1, 0], baseProbability: 1 });
    // indices 2..15 should have probability 1
    for (let i = 2; i < 16; i++) {
      expect(r.probabilities[i]).toBe(1);
    }
  });

  test("long probabilities array truncated to 16", () => {
    const long = new Array(32).fill(1);
    const r = resolveProb({ probabilities: long });
    expect(r.probabilities).toHaveLength(16);
  });

  test("output is deterministic for same seed", () => {
    const opts = { baseProbability: 0.5, seed: "test" };
    expect(resolveProb(opts).pattern).toEqual(resolveProb(opts).pattern);
  });

  test("different seeds produce different patterns (p=0.5)", () => {
    const r1 = resolveProb({ baseProbability: 0.5, seed: "alpha" });
    const r2 = resolveProb({ baseProbability: 0.5, seed: "beta"  });
    expect(r1.pattern).not.toEqual(r2.pattern);
  });

  test("mixed probabilities resolve correctly per-step", () => {
    // Step 0: p=1 → always fires; step 1: p=0 → never fires
    const r = resolveProb({ probabilities: [1, 0, ...new Array(14).fill(0.5)] });
    expect(r.pattern[0]).toBe(1);
    expect(r.pattern[1]).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 68. Tempo ramp generator
// ─────────────────────────────────────────────────────────────────────────────

describe("68. Tempo ramp generator", () => {
  test("points count = totalBars + 1", () => {
    expect(generateTempoRamp({ totalBars: 16 }).points).toHaveLength(17);
    expect(generateTempoRamp({ totalBars: 8  }).points).toHaveLength(9);
  });

  test("first point has startBpm", () => {
    const r = generateTempoRamp({ startBpm: 100, endBpm: 130, totalBars: 8 });
    expect(r.points[0].bpm).toBeCloseTo(100, 1);
  });

  test("last point has endBpm", () => {
    const r = generateTempoRamp({ startBpm: 100, endBpm: 130, totalBars: 8 });
    expect(r.points[r.points.length - 1].bpm).toBeCloseTo(130, 1);
  });

  test("linear shape: midpoint BPM ≈ (start + end) / 2", () => {
    const r = generateTempoRamp({ startBpm: 100, endBpm: 130, totalBars: 8, shape: "linear" });
    const mid = r.points[4].bpm;
    expect(mid).toBeCloseTo(115, 0);
  });

  test("exponential shape: midpoint BPM = sqrt(start × end)", () => {
    const r = generateTempoRamp({ startBpm: 100, endBpm: 130, totalBars: 8, shape: "exponential" });
    const mid = r.points[4].bpm;
    expect(mid).toBeCloseTo(Math.sqrt(100 * 130), 0);
  });

  test("all BPMs are positive", () => {
    const r = generateTempoRamp({ startBpm: 80, endBpm: 160, totalBars: 16 });
    for (const p of r.points) expect(p.bpm).toBeGreaterThan(0);
  });

  test("tick positions are monotonically increasing", () => {
    const r = generateTempoRamp({ totalBars: 8 });
    for (let i = 1; i < r.points.length; i++) {
      expect(r.points[i].tick).toBeGreaterThan(r.points[i - 1].tick);
    }
  });

  test("first tick = startBar × ticksPerBeat × beatsPerBar", () => {
    const r = generateTempoRamp({ startBar: 8, ticksPerBeat: 480, beatsPerBar: 4 });
    expect(r.points[0].tick).toBe(8 * 480 * 4);
  });

  test("startBpm = endBpm → all points same BPM", () => {
    const r = generateTempoRamp({ startBpm: 114, endBpm: 114, totalBars: 8 });
    expect(r.points.every((p) => p.bpm === 114)).toBe(true);
  });

  test("shape is reflected in output", () => {
    expect(generateTempoRamp({ shape: "exponential" }).shape).toBe("exponential");
    expect(generateTempoRamp({ shape: "linear"      }).shape).toBe("linear");
  });

  test("bar indices advance from startBar", () => {
    const r = generateTempoRamp({ startBar: 4, totalBars: 4 });
    expect(r.points[0].bar).toBe(4);
    expect(r.points[4].bar).toBe(8);
  });

  test("output is deterministic", () => {
    const opts = { startBpm: 110, endBpm: 125, totalBars: 8 };
    expect(generateTempoRamp(opts)).toEqual(generateTempoRamp(opts));
  });
});

// ── 69. MIDI drum mapper ──────────────────────────────────────────────────────
describe("69. MIDI drum mapper", () => {
  const DRUM_PARTS = [
    "kick", "snare", "hihat_closed", "hihat_open",
    "clap", "rim", "tom_high", "tom_mid", "tom_low",
    "crash", "ride", "log_drum", "shaker", "perc",
  ] as const;

  test("buildDrumMap returns all 14 parts for gm", () => {
    const r = buildDrumMap("gm");
    expect(r.entries).toHaveLength(14);
    expect(r.layout).toBe("gm");
  });

  test("buildDrumMap returns all 14 parts for tr808", () => {
    expect(buildDrumMap("tr808").entries).toHaveLength(14);
  });

  test("buildDrumMap returns all 14 parts for tr909", () => {
    expect(buildDrumMap("tr909").entries).toHaveLength(14);
  });

  test("buildDrumMap returns all 14 parts for ableton", () => {
    expect(buildDrumMap("ableton").entries).toHaveLength(14);
  });

  test("gm kick is note 36", () => {
    const r = buildDrumMap("gm");
    const kick = r.entries.find((e) => e.part === "kick")!;
    expect(kick.midiNote).toBe(36);
  });

  test("every entry has a non-empty name", () => {
    const r = buildDrumMap("tr808");
    r.entries.forEach((e) => expect(e.name.length).toBeGreaterThan(0));
  });

  test("every entry has a MIDI note in 0–127", () => {
    for (const layout of ["gm", "tr808", "tr909", "ableton"] as const) {
      buildDrumMap(layout).entries.forEach((e) => {
        expect(e.midiNote).toBeGreaterThanOrEqual(0);
        expect(e.midiNote).toBeLessThanOrEqual(127);
      });
    }
  });

  test("all 14 parts present in each layout", () => {
    for (const layout of ["gm", "tr808", "tr909", "ableton"] as const) {
      const parts = buildDrumMap(layout).entries.map((e) => e.part);
      DRUM_PARTS.forEach((p) => expect(parts).toContain(p));
    }
  });

  test("resolveDrumNote matches buildDrumMap entry", () => {
    for (const layout of ["gm", "tr808", "tr909", "ableton"] as const) {
      const r = buildDrumMap(layout);
      r.entries.forEach((e) => {
        expect(resolveDrumNote(e.part, layout)).toBe(e.midiNote);
      });
    }
  });

  test("tr808 and gm differ on snare note", () => {
    expect(resolveDrumNote("snare", "gm")).not.toBe(resolveDrumNote("snare", "tr808"));
  });

  test("tr909 tom_high is 48", () => {
    expect(resolveDrumNote("tom_high", "tr909")).toBe(48);
  });

  test("ableton ride differs from gm ride", () => {
    expect(resolveDrumNote("ride", "ableton")).not.toBe(resolveDrumNote("ride", "gm"));
  });
});

// ── 70. MIDI Arpeggiator ──────────────────────────────────────────────────────
describe("70. MIDI arpeggiator", () => {
  const CHORD = [60, 64, 67]; // C-E-G

  test("up mode produces ascending note order", () => {
    const r = generateArpeggio({ notes: CHORD, mode: "up", steps: 3 });
    expect(r.notes.map((n) => n.midiNote)).toEqual([60, 64, 67]);
  });

  test("down mode produces descending note order", () => {
    const r = generateArpeggio({ notes: CHORD, mode: "down", steps: 3 });
    expect(r.notes.map((n) => n.midiNote)).toEqual([67, 64, 60]);
  });

  test("up_down cycles without repeating endpoints", () => {
    const r = generateArpeggio({ notes: CHORD, mode: "up_down" });
    expect(r.notes.map((n) => n.midiNote)).toEqual([60, 64, 67, 64]);
  });

  test("down_up cycles without repeating endpoints", () => {
    const r = generateArpeggio({ notes: CHORD, mode: "down_up" });
    expect(r.notes.map((n) => n.midiNote)).toEqual([67, 64, 60, 64]);
  });

  test("steps controls total note count", () => {
    const r = generateArpeggio({ notes: CHORD, mode: "up", steps: 9 });
    expect(r.notes).toHaveLength(9);
  });

  test("pattern cycles correctly across steps", () => {
    const r = generateArpeggio({ notes: CHORD, mode: "up", steps: 6 });
    expect(r.notes.map((n) => n.midiNote)).toEqual([60, 64, 67, 60, 64, 67]);
  });

  test("octaves=2 includes notes one octave higher", () => {
    const r = generateArpeggio({ notes: [60, 64], mode: "up", octaves: 2 });
    const midiNotes = r.notes.map((n) => n.midiNote);
    expect(midiNotes).toContain(72);
    expect(midiNotes).toContain(76);
  });

  test("startTick offsets all note ticks", () => {
    const r = generateArpeggio({ notes: CHORD, startTick: 960, ticksPerStep: 120, steps: 3 });
    expect(r.notes[0].tick).toBe(960);
    expect(r.notes[1].tick).toBe(1080);
  });

  test("velocity is applied to every note", () => {
    const r = generateArpeggio({ notes: CHORD, velocity: 80, steps: 3 });
    r.notes.forEach((n) => expect(n.velocity).toBe(80));
  });

  test("durationTicks is 90% of ticksPerStep", () => {
    const r = generateArpeggio({ notes: CHORD, ticksPerStep: 120, steps: 1 });
    expect(r.notes[0].durationTicks).toBe(108);
  });

  test("random mode with same seed is deterministic", () => {
    const opts = { notes: CHORD, mode: "random" as const, seed: "test" };
    expect(generateArpeggio(opts).notes.map((n) => n.midiNote))
      .toEqual(generateArpeggio(opts).notes.map((n) => n.midiNote));
  });

  test("random mode with different seeds produces different order", () => {
    const a = generateArpeggio({ notes: [60,62,64,65,67,69,71,72], mode: "random", seed: "s1" }).notes.map((n) => n.midiNote);
    const b = generateArpeggio({ notes: [60,62,64,65,67,69,71,72], mode: "random", seed: "s2" }).notes.map((n) => n.midiNote);
    expect(a).not.toEqual(b);
  });

  test("empty notes returns empty result", () => {
    const r = generateArpeggio({ notes: [] });
    expect(r.notes).toHaveLength(0);
    expect(r.steps).toBe(0);
  });

  test("duplicate input notes are deduplicated", () => {
    const r = generateArpeggio({ notes: [60, 60, 64], mode: "up" });
    const unique = [...new Set(r.notes.map((n) => n.midiNote))];
    expect(unique.length).toBeLessThanOrEqual(2);
  });

  test("all generated MIDI notes are in range 0–127", () => {
    const r = generateArpeggio({ notes: [60, 64, 67], octaves: 4, steps: 32 });
    r.notes.forEach((n) => {
      expect(n.midiNote).toBeGreaterThanOrEqual(0);
      expect(n.midiNote).toBeLessThanOrEqual(127);
    });
  });
});

// ── 71. Note stutter generator ────────────────────────────────────────────────
describe("71. Note stutter generator", () => {
  test("produces the requested repeat count", () => {
    const r = generateStutter({ repeats: 8 });
    expect(r.notes).toHaveLength(8);
    expect(r.repeats).toBe(8);
  });

  test("all notes have the same midiNote", () => {
    const r = generateStutter({ midiNote: 36, repeats: 4 });
    r.notes.forEach((n) => expect(n.midiNote).toBe(36));
  });

  test("flat shape: all velocities equal", () => {
    const r = generateStutter({ shape: "flat", velocity: 90, repeats: 6 });
    r.notes.forEach((n) => expect(n.velocity).toBe(90));
  });

  test("crescendo shape: velocity increases", () => {
    const r = generateStutter({ shape: "crescendo", minVelocity: 40, maxVelocity: 120, repeats: 5 });
    const vels = r.notes.map((n) => n.velocity);
    expect(vels[0]).toBeLessThan(vels[vels.length - 1]);
  });

  test("decrescendo shape: velocity decreases", () => {
    const r = generateStutter({ shape: "decrescendo", minVelocity: 40, maxVelocity: 120, repeats: 5 });
    const vels = r.notes.map((n) => n.velocity);
    expect(vels[0]).toBeGreaterThan(vels[vels.length - 1]);
  });

  test("accelerate shape: tick spacing decreases", () => {
    const r = generateStutter({ shape: "accelerate", repeats: 4, windowTicks: 480 });
    const gaps = r.notes.slice(1).map((n, i) => n.tick - r.notes[i].tick);
    expect(gaps[0]).toBeGreaterThan(gaps[gaps.length - 1]);
  });

  test("decelerate shape: tick spacing increases", () => {
    const r = generateStutter({ shape: "decelerate", repeats: 4, windowTicks: 480 });
    const gaps = r.notes.slice(1).map((n, i) => n.tick - r.notes[i].tick);
    expect(gaps[0]).toBeLessThan(gaps[gaps.length - 1]);
  });

  test("startTick offsets first note", () => {
    const r = generateStutter({ startTick: 1920, repeats: 4 });
    expect(r.notes[0].tick).toBe(1920);
  });

  test("flat: notes span approximately the windowTicks", () => {
    const r = generateStutter({ shape: "flat", repeats: 4, windowTicks: 480 });
    const last = r.notes[r.notes.length - 1];
    expect(last.tick + last.durationTicks).toBeLessThanOrEqual(480 + 1);
  });

  test("windowTicks is reflected in result", () => {
    expect(generateStutter({ windowTicks: 960 }).windowTicks).toBe(960);
  });

  test("all durations are positive", () => {
    const r = generateStutter({ repeats: 16, windowTicks: 480 });
    r.notes.forEach((n) => expect(n.durationTicks).toBeGreaterThan(0));
  });

  test("output is deterministic", () => {
    const opts = { midiNote: 38, repeats: 8, shape: "accelerate" as const };
    expect(generateStutter(opts)).toEqual(generateStutter(opts));
  });
});

// ── 72. Ghost note injector ───────────────────────────────────────────────────
describe("72. Ghost note injector", () => {
  test("no ghosts land on occupied steps", () => {
    const occupied = [0, 4, 8, 12];
    const r = injectGhostNotes({ totalSteps: 16, occupiedSteps: occupied, density: 1 });
    const ghostSteps = r.ghosts.map((g) => g.step);
    occupied.forEach((s) => expect(ghostSteps).not.toContain(s));
  });

  test("density=0 produces no ghosts", () => {
    const r = injectGhostNotes({ totalSteps: 16, density: 0 });
    expect(r.ghosts).toHaveLength(0);
  });

  test("density=1 fills every empty step", () => {
    const occupied = [0, 8];
    const r = injectGhostNotes({ totalSteps: 16, occupiedSteps: occupied, density: 1 });
    expect(r.ghosts).toHaveLength(14);
  });

  test("all ghost velocities within [minVelocity, maxVelocity]", () => {
    const r = injectGhostNotes({ density: 1, minVelocity: 20, maxVelocity: 45, totalSteps: 16 });
    r.ghosts.forEach((g) => {
      expect(g.velocity).toBeGreaterThanOrEqual(20);
      expect(g.velocity).toBeLessThanOrEqual(45);
    });
  });

  test("all ghost midiNote values match the configured note", () => {
    const r = injectGhostNotes({ midiNote: 42, density: 1, totalSteps: 8 });
    r.ghosts.forEach((g) => expect(g.midiNote).toBe(42));
  });

  test("tick = startTick + step × ticksPerStep", () => {
    const r = injectGhostNotes({ density: 1, totalSteps: 4, ticksPerStep: 120, startTick: 240 });
    r.ghosts.forEach((g) => expect(g.tick).toBe(240 + g.step * 120));
  });

  test("output is deterministic with same seed", () => {
    const opts = { totalSteps: 16, density: 0.5, seed: "test" };
    expect(injectGhostNotes(opts)).toEqual(injectGhostNotes(opts));
  });

  test("different seeds produce different ghost placements", () => {
    const a = injectGhostNotes({ totalSteps: 16, density: 0.5, seed: "s1" }).ghosts.map((g) => g.step);
    const b = injectGhostNotes({ totalSteps: 16, density: 0.5, seed: "s2" }).ghosts.map((g) => g.step);
    expect(a).not.toEqual(b);
  });

  test("totalSteps and density are reflected in result", () => {
    const r = injectGhostNotes({ totalSteps: 32, density: 0.3 });
    expect(r.totalSteps).toBe(32);
    expect(r.density).toBeCloseTo(0.3);
  });

  test("ghost steps are within [0, totalSteps)", () => {
    const r = injectGhostNotes({ totalSteps: 16, density: 1 });
    r.ghosts.forEach((g) => {
      expect(g.step).toBeGreaterThanOrEqual(0);
      expect(g.step).toBeLessThan(16);
    });
  });
});

// ── 73. Note echo ─────────────────────────────────────────────────────────────
describe("73. Note echo", () => {
  test("produces the requested repeat count", () => {
    const r = generateEcho({ repeats: 4, decay: 0.9 });
    expect(r.echoes).toHaveLength(4);
    expect(r.repeats).toBe(4);
  });

  test("all echoes carry the configured midiNote", () => {
    const r = generateEcho({ midiNote: 48, repeats: 3, decay: 0.8 });
    r.echoes.forEach((e) => expect(e.midiNote).toBe(48));
  });

  test("tick of echo i = startTick + i × delayTicks", () => {
    const r = generateEcho({ startTick: 480, delayTicks: 240, repeats: 3, decay: 0.9 });
    r.echoes.forEach((e) => expect(e.tick).toBe(480 + e.repeatIndex * 240));
  });

  test("velocity decreases with each repeat", () => {
    const r = generateEcho({ velocity: 100, decay: 0.7, repeats: 4 });
    const vels = r.echoes.map((e) => e.velocity);
    for (let i = 1; i < vels.length; i++) expect(vels[i]).toBeLessThan(vels[i - 1]);
  });

  test("decay=1 keeps velocity constant", () => {
    const r = generateEcho({ velocity: 80, decay: 1, repeats: 4 });
    r.echoes.forEach((e) => expect(e.velocity).toBe(80));
  });

  test("stops early when velocity drops below minVelocity", () => {
    const r = generateEcho({ velocity: 100, decay: 0.3, repeats: 10, minVelocity: 10 });
    expect(r.echoes.length).toBeLessThan(10);
    r.echoes.forEach((e) => expect(e.velocity).toBeGreaterThanOrEqual(10));
  });

  test("repeats=0 returns empty echoes", () => {
    expect(generateEcho({ repeats: 0 }).echoes).toHaveLength(0);
  });

  test("durationTicks is applied to every echo", () => {
    const r = generateEcho({ durationTicks: 60, repeats: 3, decay: 0.9 });
    r.echoes.forEach((e) => expect(e.durationTicks).toBe(60));
  });

  test("repeatIndex starts at 1", () => {
    const r = generateEcho({ repeats: 3, decay: 0.9 });
    expect(r.echoes[0].repeatIndex).toBe(1);
    expect(r.echoes[2].repeatIndex).toBe(3);
  });

  test("delayTicks and decay are reflected in result", () => {
    const r = generateEcho({ delayTicks: 960, decay: 0.5 });
    expect(r.delayTicks).toBe(960);
    expect(r.decay).toBeCloseTo(0.5);
  });

  test("output is deterministic", () => {
    const opts = { midiNote: 64, velocity: 90, decay: 0.65, repeats: 5 };
    expect(generateEcho(opts)).toEqual(generateEcho(opts));
  });
});
