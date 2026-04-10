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

const SUCCESS_RESPONSE = {
  status: "complete",
  track_id: "track-001",
  log_drum_file_id: "ld-file-001",
  onset_count: 32,
  freq_range_hz: [60, 300],
  model: "spectral_bandpass_onset_gate",
  sample_rate: 44100,
};

describe("Log Drum Extractor", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosPost.mockResolvedValue({ data: SUCCESS_RESPONSE });
  });

  // ─── Route validation ─────────────────────────────────────────────────────

  it("1. POST /api/audio/log-drum/extract → 200 with log drum data", async () => {
    const res = await request(app)
      .post("/api/audio/log-drum/extract")
      .send({ audio_file_id: "audio-001", track_id: "track-001" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("complete");
    expect(res.body.log_drum_file_id).toBeDefined();
  });

  it("2. Missing audio_file_id → 400", async () => {
    const res = await request(app)
      .post("/api/audio/log-drum/extract")
      .send({ track_id: "track-001" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/audio_file_id/);
  });

  it("3. Missing track_id → 400", async () => {
    const res = await request(app)
      .post("/api/audio/log-drum/extract")
      .send({ audio_file_id: "audio-001" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/track_id/);
  });

  // ─── Proxy behaviour ──────────────────────────────────────────────────────

  it("4. Proxies POST to /log-drum/extract on the audio service", async () => {
    await request(app)
      .post("/api/audio/log-drum/extract")
      .send({ audio_file_id: "audio-001", track_id: "track-001" });

    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.stringContaining("/log-drum/extract"),
      expect.objectContaining({ audio_file_id: "audio-001", track_id: "track-001" }),
      expect.objectContaining({ timeout: 120000 })
    );
  });

  it("5. Forwards optional generation_id to audio service", async () => {
    await request(app)
      .post("/api/audio/log-drum/extract")
      .send({ audio_file_id: "audio-001", track_id: "track-001", generation_id: "gen-007" });

    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ generation_id: "gen-007" }),
      expect.any(Object)
    );
  });

  it("6. Response contains freq_range_hz [60, 300]", async () => {
    const res = await request(app)
      .post("/api/audio/log-drum/extract")
      .send({ audio_file_id: "audio-001", track_id: "track-001" });

    expect(res.body.freq_range_hz).toEqual([60, 300]);
  });

  it("7. Response contains model = spectral_bandpass_onset_gate", async () => {
    const res = await request(app)
      .post("/api/audio/log-drum/extract")
      .send({ audio_file_id: "audio-001", track_id: "track-001" });

    expect(res.body.model).toBe("spectral_bandpass_onset_gate");
  });

  it("8. Audio service 500 → route returns 500 with error", async () => {
    const axiosErr = Object.assign(new Error("Internal Server Error"), {
      _isAxiosError: true,
      response: { status: 500, data: { detail: "Demucs failed" } },
    });
    mockAxiosPost.mockRejectedValueOnce(axiosErr);

    const res = await request(app)
      .post("/api/audio/log-drum/extract")
      .send({ audio_file_id: "audio-001", track_id: "track-001" });

    expect(res.status).toBe(500);
  });

});
