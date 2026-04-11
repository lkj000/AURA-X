import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ─── Mock BullMQ + ioredis ────────────────────────────────────────────────────

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation((name: string) => ({
    name,
    add: jest.fn().mockResolvedValue({ id: "job-1" }),
    getWaitingCount:   jest.fn().mockResolvedValue(0),
    getActiveCount:    jest.fn().mockResolvedValue(0),
    getFailedCount:    jest.fn().mockResolvedValue(0),
    getCompletedCount: jest.fn().mockResolvedValue(0),
  })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
}));

jest.mock("ioredis", () =>
  jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue("OK"),
    status: "ready",
  }))
);

// ─── Mock axios ───────────────────────────────────────────────────────────────

const mockAxiosPost = jest.fn();
const mockAxiosGet  = jest.fn();

jest.mock("axios", () => ({
  post: (...args: unknown[]) => mockAxiosPost(...args),
  get:  (...args: unknown[]) => mockAxiosGet(...args),
  isAxiosError: jest.fn((err: unknown) => (err as Record<string, unknown>)?._isAxiosError === true),
}));

// ─── Express app setup ───────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import audioRouter from "../routes/audio";

const app = express();
app.use(express.json());
app.use("/api/audio", audioRouter);

// ─────────────────────────────────────────────────────────────────────────────

const STATUS_RESPONSE = {
  librosa_available: true,
  pipeline_stages: [
    "analyze", "separate", "groove_inject",
    "log_drum_synthesis", "harmonic_anchor",
    "reconstruct", "blend",
  ],
  supported_source_characters: [
    "amapiano_adjacent", "deep_house", "electronic",
    "rnb_soul", "afrobeats", "hip_hop", "other",
  ],
};

const GROOVES_RESPONSE = {
  grooves: [
    { subgenre: "private_school", swing: 0.54, log_drum_positions: [4, 12] },
    { subgenre: "sgija",          swing: 0.58, log_drum_positions: [4, 11] },
    { subgenre: "bacardi",        swing: 0.50, log_drum_positions: [4, 12] },
    { subgenre: "stixx_sgija",    swing: 0.60, log_drum_positions: [4, 12] },
  ],
};

const TRANSFORM_RESPONSE = {
  status: "complete",
  track_id: "track-001",
  source_analysis: {
    bpm: 124.0,
    key: "F#m",
    source_character: "deep_house",
    amapiano_difficulty: "moderate",
  },
  transformation: {
    target_subgenre: "private_school",
    target_bpm: 110.0,
  },
  artifacts: {
    stems: { drums: "stem-d", bass: "stem-b", vocals: "stem-v", other: "stem-o" },
    rhythm_transplant: "tp-001",
    harmonic_anchor: "ha-001",
    mix: "mix-001",
    master: "master-001",
  },
  pipeline_log: [
    "Source: deep_house, BPM=124.0, Key=F#m, Difficulty=moderate",
    "Target: subgenre=private_school, BPM=110.0",
  ],
};

describe("Amapianorize — Full Pipeline", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosGet.mockImplementation((url: string) => {
      if (url.includes("/grooves")) return Promise.resolve({ data: GROOVES_RESPONSE });
      return Promise.resolve({ data: STATUS_RESPONSE });
    });
    mockAxiosPost.mockResolvedValue({ data: TRANSFORM_RESPONSE });
  });

  // ─── Live Python service (via mocked axios) ───────────────────────────────

  it("1. GET /amapianorize/status → pipeline_stages[0] is 'analyze'", async () => {
    const res = await request(app).get("/api/audio/amapianorize/status");
    expect(res.status).toBe(200);
    expect(res.body.pipeline_stages[0]).toBe("analyze");
  });

  it("2. GET /amapianorize/grooves → grooves count is 4", async () => {
    const res = await request(app).get("/api/audio/amapianorize/grooves");
    expect(res.status).toBe(200);
    expect(res.body.grooves).toHaveLength(4);
  });

  it("3. GET /amapianorize/status → supported_source_characters has 7 items", async () => {
    const res = await request(app).get("/api/audio/amapianorize/status");
    expect(res.body.supported_source_characters).toHaveLength(7);
  });

  // ─── Proxy tests (mocked) ─────────────────────────────────────────────────

  it("4. POST /api/audio/amapianorize/transform → proxies to /transform", async () => {
    const body = { audio_file_id: "af-001", track_id: "track-001" };
    await request(app).post("/api/audio/amapianorize/transform").send(body);

    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.stringContaining("/amapianorize/transform"),
      expect.objectContaining({ audio_file_id: "af-001" }),
      expect.objectContaining({ timeout: 600000 })
    );
  });

  it("5. Response has source_analysis object", async () => {
    const res = await request(app)
      .post("/api/audio/amapianorize/transform")
      .send({ audio_file_id: "af-001", track_id: "track-001" });

    expect(res.status).toBe(200);
    expect(res.body.source_analysis).toBeDefined();
    expect(typeof res.body.source_analysis).toBe("object");
  });

  it("6. source_analysis has bpm, key, source_character fields", async () => {
    const res = await request(app)
      .post("/api/audio/amapianorize/transform")
      .send({ audio_file_id: "af-001", track_id: "track-001" });

    const sa = res.body.source_analysis;
    expect(sa).toHaveProperty("bpm");
    expect(sa).toHaveProperty("key");
    expect(sa).toHaveProperty("source_character");
  });

  it("7. Response has transformation object", async () => {
    const res = await request(app)
      .post("/api/audio/amapianorize/transform")
      .send({ audio_file_id: "af-001", track_id: "track-001" });

    expect(res.body.transformation).toBeDefined();
    expect(typeof res.body.transformation).toBe("object");
  });

  it("8. transformation has target_subgenre field", async () => {
    const res = await request(app)
      .post("/api/audio/amapianorize/transform")
      .send({ audio_file_id: "af-001", track_id: "track-001" });

    expect(res.body.transformation).toHaveProperty("target_subgenre");
    expect(typeof res.body.transformation.target_subgenre).toBe("string");
  });

  it("9. Response has artifacts object with stems, mix, master", async () => {
    const res = await request(app)
      .post("/api/audio/amapianorize/transform")
      .send({ audio_file_id: "af-001", track_id: "track-001" });

    const art = res.body.artifacts;
    expect(art).toBeDefined();
    expect(art).toHaveProperty("stems");
    expect(art).toHaveProperty("mix");
    expect(art).toHaveProperty("master");
  });

  it("10. Audio service 500 → forwarded to client", async () => {
    const axiosErr = Object.assign(new Error("Pipeline failed"), {
      _isAxiosError: true,
      response: { status: 500, data: { detail: "Analysis failed: librosa not installed" } },
    });
    mockAxiosPost.mockRejectedValueOnce(axiosErr);

    const res = await request(app)
      .post("/api/audio/amapianorize/transform")
      .send({ audio_file_id: "bad-id", track_id: "track-001" });

    expect(res.status).toBe(500);
  });

});
