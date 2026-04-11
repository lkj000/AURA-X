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

const ANALYZE_RESPONSE = {
  status: "complete",
  audio_file_id: "af-001",
  track_id: "track-001",
  bpm: 110.0,
  key: "Am",
  mode: "minor",
  source_character: "amapiano_adjacent",
  recommended_subgenre: "private_school",
  amapiano_difficulty: "easy",
};

describe("Amapianorize — Source Analyzer", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosGet.mockResolvedValue({ data: STATUS_RESPONSE });
    mockAxiosPost.mockResolvedValue({ data: ANALYZE_RESPONSE });
  });

  // ─── Live Python service (via mocked axios) ───────────────────────────────

  it("1. GET /amapianorize/status → 200", async () => {
    const res = await request(app).get("/api/audio/amapianorize/status");
    expect(res.status).toBe(200);
  });

  it("2. pipeline_stages has 7 items", async () => {
    const res = await request(app).get("/api/audio/amapianorize/status");
    expect(res.body.pipeline_stages).toHaveLength(7);
  });

  it("3. pipeline_stages[0] is 'analyze'", async () => {
    const res = await request(app).get("/api/audio/amapianorize/status");
    expect(res.body.pipeline_stages[0]).toBe("analyze");
  });

  it("4. supported_source_characters includes 'amapiano_adjacent'", async () => {
    const res = await request(app).get("/api/audio/amapianorize/status");
    expect(res.body.supported_source_characters).toContain("amapiano_adjacent");
  });

  // ─── Proxy tests (mocked) ─────────────────────────────────────────────────

  it("5. POST /api/audio/amapianorize/analyze → proxies correctly", async () => {
    const body = { audio_file_id: "af-001", track_id: "track-001" };
    await request(app).post("/api/audio/amapianorize/analyze").send(body);

    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.stringContaining("/amapianorize/analyze"),
      expect.objectContaining({ audio_file_id: "af-001" }),
      expect.objectContaining({ timeout: 120000 })
    );
  });

  it("6. GET /api/audio/amapianorize/status → proxies correctly", async () => {
    await request(app).get("/api/audio/amapianorize/status");
    expect(mockAxiosGet).toHaveBeenCalledWith(
      expect.stringContaining("/amapianorize/status")
    );
  });

  it("7. Successful response has source_character field", async () => {
    const res = await request(app)
      .post("/api/audio/amapianorize/analyze")
      .send({ audio_file_id: "af-001", track_id: "track-001" });

    expect(res.status).toBe(200);
    expect(res.body.source_character).toBeDefined();
    expect(typeof res.body.source_character).toBe("string");
  });

  it("8. Successful response has recommended_subgenre field", async () => {
    const res = await request(app)
      .post("/api/audio/amapianorize/analyze")
      .send({ audio_file_id: "af-001", track_id: "track-001" });

    expect(res.status).toBe(200);
    expect(res.body.recommended_subgenre).toBeDefined();
    expect(typeof res.body.recommended_subgenre).toBe("string");
  });

});
