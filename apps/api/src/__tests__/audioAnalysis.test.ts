// Tests for the native TypeScript Amapiano audio analysis library
// and the POST /api/amapianorize route.

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import express from "express";
import request from "supertest";
import amapianorizeRouter from "../routes/amapianorize";
import {
  parseWavMono,
  extractAudioFeatures,
  scoreLanes,
  evaluateAmapiano,
  buildEnhancement,
  AMAPIANO_THRESHOLD,
  type AudioFeatures,
} from "../lib/audio-analysis";

const app = express();
app.use("/api/amapianorize", amapianorizeRouter);

// ── Synthetic WAV factory ─────────────────────────────────────────────────────

function buildWav(opts: {
  sampleRate?: number;
  bpm?: number;
  durationSec?: number;
  amplitude?: number;
}): Buffer {
  const { sampleRate = 44100, bpm = 112, durationSec = 12, amplitude = 0.45 } = opts;
  const totalSamples   = Math.floor(sampleRate * durationSec);
  const samplesPerBeat = (sampleRate * 60) / bpm;

  const pcm = new Int16Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    const phase   = i % samplesPerBeat;
    const env     = phase < samplesPerBeat * 0.08 ? 1.0 : 0.30;
    const logDrum = Math.sin((2 * Math.PI * 110 * i) / sampleRate);
    const hat     = Math.sin((2 * Math.PI * 1200 * i) / sampleRate) * 0.2;
    pcm[i] = Math.round(env * (logDrum + hat) * amplitude * 32000);
  }

  const dataSize = totalSamples * 2;
  const hdr      = Buffer.alloc(44);
  hdr.write("RIFF",  0);
  hdr.writeUInt32LE(36 + dataSize, 4);
  hdr.write("WAVE",  8);
  hdr.write("fmt ", 12);
  hdr.writeUInt32LE(16, 16);
  hdr.writeUInt16LE(1,  20);          // PCM
  hdr.writeUInt16LE(1,  22);          // mono
  hdr.writeUInt32LE(sampleRate, 24);
  hdr.writeUInt32LE(sampleRate * 2, 28);
  hdr.writeUInt16LE(2,  32);
  hdr.writeUInt16LE(16, 34);
  hdr.write("data", 36);
  hdr.writeUInt32LE(dataSize, 40);

  return Buffer.concat([hdr, Buffer.from(pcm.buffer)]);
}

// ── parseWavMono ──────────────────────────────────────────────────────────────

describe("parseWavMono", () => {
  it("1. Parses valid WAV and returns correct sample count", () => {
    const buf = buildWav({ sampleRate: 44100, durationSec: 5 });
    const { samples, sampleRate, durationSec } = parseWavMono(buf);
    expect(sampleRate).toBe(44100);
    expect(Math.abs(durationSec - 5)).toBeLessThan(0.1);
    expect(samples.length).toBe(44100 * 5);
  });

  it("2. Throws on non-WAV buffer", () => {
    expect(() => parseWavMono(Buffer.from("this is not a wav file"))).toThrow(/WAV|RIFF|valid/i);
  });

  it("3. Throws on too-small buffer", () => {
    expect(() => parseWavMono(Buffer.alloc(10))).toThrow();
  });

  it("4. Samples are normalised to [-1, 1]", () => {
    const buf     = buildWav({ amplitude: 1.0 });
    const { samples } = parseWavMono(buf);
    let maxAbs = 0;
    for (const s of samples) { const a = Math.abs(s); if (a > maxAbs) maxAbs = a; }
    expect(maxAbs).toBeLessThanOrEqual(1.001);
  });
});

// ── extractAudioFeatures ──────────────────────────────────────────────────────

describe("extractAudioFeatures", () => {
  it("5. Returns all required fields", () => {
    const feat = extractAudioFeatures(buildWav({ bpm: 112 }));
    expect(typeof feat.bpm).toBe("number");
    expect(typeof feat.energyRms).toBe("number");
    expect(typeof feat.spectralCentroid).toBe("number");
    expect(typeof feat.swingRatio).toBe("number");
    expect(typeof feat.syncopationIndex).toBe("number");
    expect(typeof feat.durationSec).toBe("number");
    expect(typeof feat.sampleRate).toBe("number");
  });

  it("6. BPM estimate is in Amapiano range for 112-BPM input", () => {
    const feat = extractAudioFeatures(buildWav({ bpm: 112, durationSec: 15 }));
    expect(feat.bpm).toBeGreaterThan(95);
    expect(feat.bpm).toBeLessThan(135);
  });

  it("7. Higher amplitude → higher energyRms", () => {
    const low  = extractAudioFeatures(buildWav({ amplitude: 0.10, durationSec: 5 }));
    const high = extractAudioFeatures(buildWav({ amplitude: 0.90, durationSec: 5 }));
    expect(high.energyRms).toBeGreaterThan(low.energyRms);
  });

  it("8. Duration matches input within 0.1 s", () => {
    const feat = extractAudioFeatures(buildWav({ durationSec: 8 }));
    expect(Math.abs(feat.durationSec - 8)).toBeLessThan(0.1);
  });
});

// ── scoreLanes ────────────────────────────────────────────────────────────────

describe("scoreLanes", () => {
  const psFeatures: AudioFeatures = {
    bpm: 112, energyRms: 0.45, spectralCentroid: 1375,
    swingRatio: 0.50, syncopationIndex: 0.25, durationSec: 30, sampleRate: 44100,
  };
  const sgFeatures: AudioFeatures = {
    bpm: 114, energyRms: 0.80, spectralCentroid: 1525,
    swingRatio: 0.50, syncopationIndex: 0.50, durationSec: 30, sampleRate: 44100,
  };

  it("9. Returns 4 lanes sorted score-descending", () => {
    const lanes = scoreLanes(psFeatures);
    expect(lanes).toHaveLength(4);
    for (let i = 1; i < lanes.length; i++) {
      expect(lanes[i - 1].score).toBeGreaterThanOrEqual(lanes[i].score);
    }
  });

  it("10. Probabilities sum to 1 (±0.001)", () => {
    const sum = scoreLanes(psFeatures).reduce((s, l) => s + l.probability, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(0.001);
  });

  it("11. private_school features → private_school ranked first", () => {
    expect(scoreLanes(psFeatures)[0].lane).toBe("private_school");
  });

  it("12. sgija features → sgija ranked first", () => {
    expect(scoreLanes(sgFeatures)[0].lane).toBe("sgija");
  });
});

// ── evaluateAmapiano ──────────────────────────────────────────────────────────

describe("evaluateAmapiano", () => {
  const goodFeatures: AudioFeatures = {
    bpm: 112, energyRms: 0.45, spectralCentroid: 1375,
    swingRatio: 0.50, syncopationIndex: 0.25, durationSec: 30, sampleRate: 44100,
  };
  const badFeatures: AudioFeatures = {
    bpm: 145, energyRms: 0.05, spectralCentroid: 5000,
    swingRatio: 0.50, syncopationIndex: 0.80, durationSec: 30, sampleRate: 44100,
  };

  it("13. passesThreshold true for authentic Amapiano features", () => {
    const ev = evaluateAmapiano(goodFeatures);
    expect(ev.passesThreshold).toBe(true);
    expect(ev.authenticityScore).toBeGreaterThanOrEqual(AMAPIANO_THRESHOLD);
  });

  it("14. passesThreshold false for non-Amapiano features", () => {
    expect(evaluateAmapiano(badFeatures).passesThreshold).toBe(false);
  });

  it("15. threshold field equals AMAPIANO_THRESHOLD constant", () => {
    expect(evaluateAmapiano(goodFeatures).threshold).toBe(AMAPIANO_THRESHOLD);
  });

  it("16. No BPM issue for on-target features", () => {
    const issues = evaluateAmapiano(goodFeatures).issues.filter((i) => i.includes("BPM"));
    expect(issues).toHaveLength(0);
  });

  it("17. BPM issue raised when BPM is off by > 6", () => {
    const ev = evaluateAmapiano({ ...goodFeatures, bpm: 90 });
    expect(ev.issues.some((i) => i.includes("BPM"))).toBe(true);
  });

  it("18. isHybrid is a boolean", () => {
    expect(typeof evaluateAmapiano(goodFeatures).isHybrid).toBe("boolean");
  });
});

// ── buildEnhancement ──────────────────────────────────────────────────────────

describe("buildEnhancement", () => {
  const passedEval = evaluateAmapiano({
    bpm: 112, energyRms: 0.45, spectralCentroid: 1375,
    swingRatio: 0.50, syncopationIndex: 0.25, durationSec: 30, sampleRate: 44100,
  });
  const failedEval = evaluateAmapiano({
    bpm: 145, energyRms: 0.05, spectralCentroid: 5000,
    swingRatio: 0.50, syncopationIndex: 0.80, durationSec: 30, sampleRate: 44100,
  });

  it("19. recommendedCtl has global, amapiano, mix, suno_generation keys", () => {
    const enh = buildEnhancement(passedEval);
    expect(enh.recommendedCtl).toHaveProperty("global");
    expect(enh.recommendedCtl).toHaveProperty("amapiano");
    expect(enh.recommendedCtl).toHaveProperty("mix");
    expect(enh.recommendedCtl).toHaveProperty("suno_generation");
  });

  it("20. global.key is Am", () => {
    const g = buildEnhancement(passedEval).recommendedCtl.global as Record<string, unknown>;
    expect(g.key).toBe("Am");
  });

  it("21. canAutoEnhance true when below threshold", () => {
    expect(buildEnhancement(failedEval).canAutoEnhance).toBe(true);
  });

  it("22. canAutoEnhance false when already passing", () => {
    expect(buildEnhancement(passedEval).canAutoEnhance).toBe(false);
  });

  it("23. suggestions is a non-empty string array", () => {
    const enh = buildEnhancement(passedEval);
    expect(Array.isArray(enh.suggestions)).toBe(true);
    expect(enh.suggestions.length).toBeGreaterThan(0);
    expect(typeof enh.suggestions[0]).toBe("string");
  });
});

// ── POST /api/amapianorize ────────────────────────────────────────────────────

describe("POST /api/amapianorize", () => {
  it("24. 400 when no file attached", async () => {
    const res = await request(app).post("/api/amapianorize");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/audio file required/i);
  });

  it("25. 400 for non-audio MIME type", async () => {
    const res = await request(app)
      .post("/api/amapianorize")
      .attach("audio", Buffer.from("fake data"), { filename: "image.png", contentType: "image/png" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/audio file/i);
  });

  it("26. 422 for random bytes with audio MIME", async () => {
    const res = await request(app)
      .post("/api/amapianorize")
      .attach("audio", Buffer.from("this is not a wav file at all"), { filename: "bad.wav", contentType: "audio/wav" });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/WAV|RIFF|valid/i);
  });

  it("27. 200 with valid WAV", async () => {
    const wav = buildWav({ bpm: 112, durationSec: 12 });
    const res = await request(app)
      .post("/api/amapianorize")
      .attach("audio", wav, { filename: "track.wav", contentType: "audio/wav" });
    expect(res.status).toBe(200);
    expect(res.body.evaluation).toBeDefined();
    expect(res.body.enhancement).toBeDefined();
  });

  it("28. evaluation has features.bpm, passesThreshold, laneScores with 4 lanes", async () => {
    const wav = buildWav({ bpm: 112, durationSec: 12 });
    const res = await request(app)
      .post("/api/amapianorize")
      .attach("audio", wav, { filename: "track.wav", contentType: "audio/wav" });
    const ev = res.body.evaluation;
    expect(typeof ev.features.bpm).toBe("number");
    expect(typeof ev.passesThreshold).toBe("boolean");
    expect(typeof ev.laneScores.overallAuthenticity).toBe("number");
    expect(ev.laneScores.laneScores).toHaveLength(4);
  });

  it("29. enhancement.recommendedCtl.lane is a valid Amapiano lane", async () => {
    const wav  = buildWav({ bpm: 112, durationSec: 12 });
    const res  = await request(app)
      .post("/api/amapianorize")
      .attach("audio", wav, { filename: "track.wav", contentType: "audio/wav" });
    const lane = res.body.enhancement.recommendedCtl.lane;
    expect(["private_school", "sgija", "bacardi", "commercial"]).toContain(lane);
  });

  it("30. application/octet-stream accepted as audio", async () => {
    const wav = buildWav({ bpm: 112, durationSec: 12 });
    const res = await request(app)
      .post("/api/amapianorize")
      .attach("audio", wav, { filename: "track.wav", contentType: "application/octet-stream" });
    expect(res.status).toBe(200);
  });
});
