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
  ready: true,
  librosa_available: true,
  capabilities: ["crossfade", "log_drum_sync", "filter_fade", "hard_cut"],
  amapiano_energy_arc: ["entry", "build", "peak", "plateau", "exhale"],
};

const RENDER_RESPONSE = {
  status: "complete",
  dj_mix_file_id: "djmix-001",
  storage_path: "track-001/dj_mix/djmix-001.wav",
  duration_sec: 2700.0,
  duration_min: 45.0,
  track_count: 12,
  set_title: "AURA X DJ Set",
};

describe("DJ Renderer", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosGet.mockResolvedValue({ data: STATUS_RESPONSE });
    mockAxiosPost.mockResolvedValue({ data: RENDER_RESPONSE });
  });

  // ─── Live Python service (via mocked axios) ───────────────────────────────

  it("1. GET /dj/status → 200", async () => {
    const res = await request(app).get("/api/audio/dj/status");
    expect(res.status).toBe(200);
  });

  it("2. Response has ready field", async () => {
    const res = await request(app).get("/api/audio/dj/status");
    expect(res.body).toHaveProperty("ready");
    expect(typeof res.body.ready).toBe("boolean");
  });

  it("3. capabilities includes 'crossfade'", async () => {
    const res = await request(app).get("/api/audio/dj/status");
    expect(res.body.capabilities).toContain("crossfade");
  });

  it("4. capabilities includes 'log_drum_sync'", async () => {
    const res = await request(app).get("/api/audio/dj/status");
    expect(res.body.capabilities).toContain("log_drum_sync");
  });

  it("5. amapiano_energy_arc has 5 phases", async () => {
    const res = await request(app).get("/api/audio/dj/status");
    expect(res.body.amapiano_energy_arc).toHaveLength(5);
  });

  it("6. First phase is 'entry', last is 'exhale'", async () => {
    const res = await request(app).get("/api/audio/dj/status");
    const arc = res.body.amapiano_energy_arc as string[];
    expect(arc[0]).toBe("entry");
    expect(arc[arc.length - 1]).toBe("exhale");
  });

  // ─── Proxy tests (mocked) ─────────────────────────────────────────────────

  it("7. POST /api/audio/dj/render → proxies to /dj/render", async () => {
    const body = {
      track_id: "dj-track-001",
      set_plan: { title: "Test Set", tracks: [], transitions: [] },
    };
    await request(app).post("/api/audio/dj/render").send(body);

    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.stringContaining("/dj/render"),
      expect.objectContaining({ track_id: "dj-track-001" }),
      expect.objectContaining({ timeout: 600000 })
    );
  });

  it("8. GET /api/audio/dj/status → proxies correctly", async () => {
    await request(app).get("/api/audio/dj/status");
    expect(mockAxiosGet).toHaveBeenCalledWith(
      expect.stringContaining("/dj/status")
    );
  });

  it("9. Successful response → has dj_mix_file_id", async () => {
    const res = await request(app)
      .post("/api/audio/dj/render")
      .send({ track_id: "dj-001", set_plan: { tracks: [], transitions: [] } });

    expect(res.status).toBe(200);
    expect(res.body.dj_mix_file_id).toBeDefined();
    expect(res.body.status).toBe("complete");
  });

  it("10. Empty set_plan → 500 forwarded", async () => {
    const axiosErr = Object.assign(new Error("No tracks in set plan"), {
      _isAxiosError: true,
      response: { status: 500, data: { detail: "No tracks in set plan" } },
    });
    mockAxiosPost.mockRejectedValueOnce(axiosErr);

    const res = await request(app)
      .post("/api/audio/dj/render")
      .send({ track_id: "dj-001", set_plan: { tracks: [], transitions: [] } });

    expect(res.status).toBe(500);
  });

});
