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

const TARGETS_RESPONSE = {
  targets: {
    private_school:       -10.0,
    bacardi:              -9.0,
    sgija:                -9.5,
    stixx_sgija:          -9.0,
    mbiraiano:            -11.0,
    three_step:           -9.5,
    gqom_fusion:          -9.0,
    hybrid_rnb_amapiano:  -10.0,
  },
  default: -10.0,
  pedalboard_available: true,
};

const MASTER_SUCCESS = {
  status: "complete",
  master_file_id: "master-file-001",
  storage_path: "track-001/master/master-file-001.wav",
  target_lufs: -10.0,
  subgenre: "private_school",
  file_size_bytes: 132300,
};

describe("Master Chain", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosGet.mockResolvedValue({ data: TARGETS_RESPONSE });
    mockAxiosPost.mockResolvedValue({ data: MASTER_SUCCESS });
  });

  // ─── Live Python service (via mocked axios) ───────────────────────────────

  it("1. GET /master/targets → 200", async () => {
    const res = await request(app).get("/api/audio/master/targets");
    expect(res.status).toBe(200);
  });

  it("2. Response has targets object with 8 subgenres", async () => {
    const res = await request(app).get("/api/audio/master/targets");
    expect(res.body).toHaveProperty("targets");
    expect(Object.keys(res.body.targets)).toHaveLength(8);
  });

  it("3. bacardi target > private_school target (louder)", async () => {
    const res = await request(app).get("/api/audio/master/targets");
    const { targets } = res.body as { targets: Record<string, number> };
    expect(targets.bacardi).toBeGreaterThan(targets.private_school);
  });

  it("4. mbiraiano target is the lowest (most dynamic)", async () => {
    const res = await request(app).get("/api/audio/master/targets");
    const { targets } = res.body as { targets: Record<string, number> };
    const min = Math.min(...Object.values(targets));
    expect(targets.mbiraiano).toBe(min);
  });

  // ─── Proxy tests (mocked) ─────────────────────────────────────────────────

  it("5. POST /api/audio/master/render → proxies to /master/render", async () => {
    const body = {
      mix_file_id: "mix-001",
      track_id: "track-001",
      subgenre: "private_school",
    };
    await request(app).post("/api/audio/master/render").send(body);

    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.stringContaining("/master/render"),
      expect.objectContaining({ mix_file_id: "mix-001", subgenre: "private_school" }),
      expect.objectContaining({ timeout: 300000 })
    );
  });

  it("6. GET /api/audio/master/targets → proxies to /master/targets", async () => {
    await request(app).get("/api/audio/master/targets");
    expect(mockAxiosGet).toHaveBeenCalledWith(
      expect.stringContaining("/master/targets")
    );
  });

  it("7. Successful render response → returns master_file_id", async () => {
    const res = await request(app)
      .post("/api/audio/master/render")
      .send({ mix_file_id: "mix-001", track_id: "track-001", subgenre: "private_school" });

    expect(res.status).toBe(200);
    expect(res.body.master_file_id).toBeDefined();
    expect(res.body.status).toBe("complete");
    expect(typeof res.body.target_lufs).toBe("number");
  });

  it("8. Audio service 500 → forwarded to client", async () => {
    const axiosErr = Object.assign(new Error("Internal Server Error"), {
      _isAxiosError: true,
      response: { status: 500, data: { detail: "Mix file not found" } },
    });
    mockAxiosPost.mockRejectedValueOnce(axiosErr);

    const res = await request(app)
      .post("/api/audio/master/render")
      .send({ mix_file_id: "bad-id", track_id: "track-001", subgenre: "private_school" });

    expect(res.status).toBe(500);
  });

});
