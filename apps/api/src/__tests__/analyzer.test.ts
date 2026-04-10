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
  features: ["bpm", "key", "mode", "energy", "onset_density"],
  key_algorithm: "krumhansl_schmuckler",
};

const ANALYSIS_RESPONSE = {
  status: "complete",
  analysis_id: "analysis-001",
  bpm: 112.0,
  bpm_confidence: 0.85,
  key: "F#m",
  key_confidence: 0.74,
  mode: "minor",
  energy_mean: 0.62,
  energy_peak: 0.031,
  onset_density: 4.2,
  duration_sec: 180.0,
  sample_rate: 44100,
};

describe("Analyzer", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosGet.mockResolvedValue({ data: STATUS_RESPONSE });
    mockAxiosPost.mockResolvedValue({ data: ANALYSIS_RESPONSE });
  });

  // ─── Live Python service (via mocked axios) ───────────────────────────────

  it("1. GET /analysis/status → 200", async () => {
    const res = await request(app).get("/api/audio/analysis/status");
    expect(res.status).toBe(200);
  });

  it("2. librosa_available is true", async () => {
    const res = await request(app).get("/api/audio/analysis/status");
    expect(res.body.librosa_available).toBe(true);
  });

  it("3. features array contains 'bpm' and 'key'", async () => {
    const res = await request(app).get("/api/audio/analysis/status");
    expect(res.body.features).toContain("bpm");
    expect(res.body.features).toContain("key");
  });

  it("4. key_algorithm is 'krumhansl_schmuckler'", async () => {
    const res = await request(app).get("/api/audio/analysis/status");
    expect(res.body.key_algorithm).toBe("krumhansl_schmuckler");
  });

  // ─── Proxy tests (mocked) ─────────────────────────────────────────────────

  it("5. POST /api/audio/analysis/analyze → proxies correctly", async () => {
    await request(app)
      .post("/api/audio/analysis/analyze")
      .send({ audio_file_id: "af-001", track_id: "track-001" });

    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.stringContaining("/analysis/analyze"),
      expect.objectContaining({ audio_file_id: "af-001", track_id: "track-001" }),
      expect.objectContaining({ timeout: 120000 })
    );
  });

  it("6. GET /api/audio/analysis/status → proxies correctly", async () => {
    await request(app).get("/api/audio/analysis/status");
    expect(mockAxiosGet).toHaveBeenCalledWith(
      expect.stringContaining("/analysis/status")
    );
  });

  it("7. Response has bpm, key, mode fields", async () => {
    const res = await request(app)
      .post("/api/audio/analysis/analyze")
      .send({ audio_file_id: "af-001", track_id: "track-001" });

    expect(res.body).toHaveProperty("bpm");
    expect(res.body).toHaveProperty("key");
    expect(res.body).toHaveProperty("mode");
  });

  it("8. Response bpm is a number", async () => {
    const res = await request(app)
      .post("/api/audio/analysis/analyze")
      .send({ audio_file_id: "af-001", track_id: "track-001" });

    expect(typeof res.body.bpm).toBe("number");
  });

  it("9. Response key is a string", async () => {
    const res = await request(app)
      .post("/api/audio/analysis/analyze")
      .send({ audio_file_id: "af-001", track_id: "track-001" });

    expect(typeof res.body.key).toBe("string");
  });

  it("10. Audio service error → forwarded to client", async () => {
    const axiosErr = Object.assign(new Error("Not Found"), {
      _isAxiosError: true,
      response: { status: 500, data: { detail: "Audio file not found" } },
    });
    mockAxiosPost.mockRejectedValueOnce(axiosErr);

    const res = await request(app)
      .post("/api/audio/analysis/analyze")
      .send({ audio_file_id: "bad-id", track_id: "track-001" });

    expect(res.status).toBe(500);
  });

});
