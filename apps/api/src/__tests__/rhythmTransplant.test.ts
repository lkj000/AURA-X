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

const GROOVES_RESPONSE = {
  grooves: [
    { subgenre: "private_school", swing: 0.54, log_drum_positions: [4, 12] },
    { subgenre: "sgija",          swing: 0.58, log_drum_positions: [4, 11] },
    { subgenre: "bacardi",        swing: 0.50, log_drum_positions: [4, 12] },
    { subgenre: "stixx_sgija",    swing: 0.60, log_drum_positions: [4, 12] },
  ],
};

const TRANSPLANT_RESPONSE = {
  status: "complete",
  transplant_file_id: "tp-001",
  storage_path: "track-001/groove_transplant/tp-001.wav",
  source_bpm: 95.0,
  target_bpm: 110.0,
  target_subgenre: "private_school",
};

describe("Amapianorize — Rhythm Transplant", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosGet.mockResolvedValue({ data: GROOVES_RESPONSE });
    mockAxiosPost.mockResolvedValue({ data: TRANSPLANT_RESPONSE });
  });

  // ─── Live Python service (via mocked axios) ───────────────────────────────

  it("1. GET /amapianorize/grooves → 200", async () => {
    const res = await request(app).get("/api/audio/amapianorize/grooves");
    expect(res.status).toBe(200);
  });

  it("2. Response has grooves array", async () => {
    const res = await request(app).get("/api/audio/amapianorize/grooves");
    expect(res.body).toHaveProperty("grooves");
    expect(Array.isArray(res.body.grooves)).toBe(true);
  });

  it("3. grooves array has 4 items", async () => {
    const res = await request(app).get("/api/audio/amapianorize/grooves");
    expect(res.body.grooves).toHaveLength(4);
  });

  it("4. Each groove has subgenre, swing, log_drum_positions", async () => {
    const res = await request(app).get("/api/audio/amapianorize/grooves");
    for (const groove of res.body.grooves) {
      expect(groove).toHaveProperty("subgenre");
      expect(groove).toHaveProperty("swing");
      expect(groove).toHaveProperty("log_drum_positions");
    }
  });

  // ─── Proxy tests (mocked) ─────────────────────────────────────────────────

  it("5. POST /api/audio/amapianorize/rhythm-transplant → proxies", async () => {
    const body = {
      audio_file_id: "af-001",
      track_id: "track-001",
      target_subgenre: "private_school",
    };
    await request(app).post("/api/audio/amapianorize/rhythm-transplant").send(body);

    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.stringContaining("/amapianorize/rhythm-transplant"),
      expect.objectContaining({ audio_file_id: "af-001" }),
      expect.objectContaining({ timeout: 180000 })
    );
  });

  it("6. GET /api/audio/amapianorize/grooves → proxies", async () => {
    await request(app).get("/api/audio/amapianorize/grooves");
    expect(mockAxiosGet).toHaveBeenCalledWith(
      expect.stringContaining("/amapianorize/grooves")
    );
  });

  it("7. Successful response has transplant_file_id", async () => {
    const res = await request(app)
      .post("/api/audio/amapianorize/rhythm-transplant")
      .send({ audio_file_id: "af-001", track_id: "track-001" });

    expect(res.status).toBe(200);
    expect(res.body.transplant_file_id).toBeDefined();
    expect(res.body.status).toBe("complete");
  });

  it("8. Successful response has source_bpm and target_bpm", async () => {
    const res = await request(app)
      .post("/api/audio/amapianorize/rhythm-transplant")
      .send({ audio_file_id: "af-001", track_id: "track-001" });

    expect(res.status).toBe(200);
    expect(res.body.source_bpm).toBeDefined();
    expect(res.body.target_bpm).toBeDefined();
    expect(typeof res.body.source_bpm).toBe("number");
    expect(typeof res.body.target_bpm).toBe("number");
  });

});
