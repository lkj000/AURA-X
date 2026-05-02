import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ─── Mock the metrics collector singleton ─────────────────────────────────────

const mockSnapshot = jest.fn();
const mockReset    = jest.fn();

jest.mock("../lib/metricsCollector", () => ({
  metricsCollector: {
    snapshot: (...args: unknown[]) => mockSnapshot(...args),
    reset:    (...args: unknown[]) => mockReset(...args),
    record:   jest.fn(),
    size:     0,
  },
}));

// ─── Mock @aura-x/engine (metricsCollector.ts imports createMetricsCollector) ─

jest.mock("@aura-x/engine", () => ({
  createMetricsCollector: jest.fn(() => ({
    snapshot: jest.fn(),
    reset:    jest.fn(),
    record:   jest.fn(),
    size:     0,
  })),
}));

// ─── Build a minimal Express app with just the engine router ─────────────────

import express from "express";
import request from "supertest";
import engineRouter from "../routes/engine";

const app = express();
app.use(express.json());
app.use("/api/engine", engineRouter);

// ─── Defaults ────────────────────────────────────────────────────────────────

const emptySnapshot = {
  totalRuns:    0,
  passed:       0,
  failed:       0,
  avgDurationMs: 0,
  avgQuality:   0,
  recentRuns:   [],
};

const populatedSnapshot = {
  totalRuns:    3,
  passed:       2,
  failed:       1,
  avgDurationMs: 45.0,
  avgQuality:   0.77,
  recentRuns:   [
    { runId: "run-0", timestamp: 1000, durationMs: 40, qualityScore: 0.80, passed: true,  lane: "private_school" },
    { runId: "run-1", timestamp: 900,  durationMs: 55, qualityScore: 0.60, passed: false, lane: "deep_house" },
    { runId: "run-2", timestamp: 800,  durationMs: 40, qualityScore: 0.91, passed: true,  lane: "private_school" },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/engine/metrics", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockSnapshot.mockReturnValue(emptySnapshot);
  });

  it("1. Returns 200 with snapshot shape", async () => {
    const res = await request(app).get("/api/engine/metrics");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalRuns:    expect.any(Number),
      passed:       expect.any(Number),
      failed:       expect.any(Number),
      avgDurationMs: expect.any(Number),
      avgQuality:   expect.any(Number),
      recentRuns:   expect.any(Array),
    });
  });

  it("2. Calls snapshot with default limit 10", async () => {
    await request(app).get("/api/engine/metrics");
    expect(mockSnapshot).toHaveBeenCalledWith(10);
  });

  it("3. Accepts ?limit=25 query param", async () => {
    await request(app).get("/api/engine/metrics?limit=25");
    expect(mockSnapshot).toHaveBeenCalledWith(25);
  });

  it("4. Clamps limit to max 100", async () => {
    await request(app).get("/api/engine/metrics?limit=9999");
    expect(mockSnapshot).toHaveBeenCalledWith(100);
  });

  it("5. Clamps limit to min 1", async () => {
    await request(app).get("/api/engine/metrics?limit=0");
    expect(mockSnapshot).toHaveBeenCalledWith(1);
  });

  it("6. Non-numeric limit falls back to 10", async () => {
    await request(app).get("/api/engine/metrics?limit=abc");
    expect(mockSnapshot).toHaveBeenCalledWith(10);
  });

  it("7. Returns populated snapshot fields correctly", async () => {
    mockSnapshot.mockReturnValue(populatedSnapshot);
    const res = await request(app).get("/api/engine/metrics");
    expect(res.body.totalRuns).toBe(3);
    expect(res.body.passed).toBe(2);
    expect(res.body.failed).toBe(1);
    expect(res.body.avgDurationMs).toBe(45.0);
    expect(res.body.recentRuns).toHaveLength(3);
  });

  it("8. recentRuns items have expected shape", async () => {
    mockSnapshot.mockReturnValue(populatedSnapshot);
    const res = await request(app).get("/api/engine/metrics");
    const run = res.body.recentRuns[0];
    expect(run).toMatchObject({
      runId:        expect.any(String),
      timestamp:    expect.any(Number),
      durationMs:   expect.any(Number),
      qualityScore: expect.any(Number),
      passed:       expect.any(Boolean),
    });
  });

  it("9. avgQuality is present as a number", async () => {
    mockSnapshot.mockReturnValue({ ...emptySnapshot, avgQuality: 0.82 });
    const res = await request(app).get("/api/engine/metrics");
    expect(res.body.avgQuality).toBe(0.82);
  });

  it("10. Empty state — totalRuns 0, recentRuns empty array", async () => {
    mockSnapshot.mockReturnValue(emptySnapshot);
    const res = await request(app).get("/api/engine/metrics");
    expect(res.body.totalRuns).toBe(0);
    expect(res.body.recentRuns).toEqual([]);
  });
});

describe("POST /api/engine/metrics/reset", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockReset.mockReturnValue(undefined);
    mockSnapshot.mockReturnValue(emptySnapshot);
  });

  it("11. Returns 204 No Content", async () => {
    const res = await request(app).post("/api/engine/metrics/reset");
    expect(res.status).toBe(204);
  });

  it("12. Calls metricsCollector.reset() exactly once", async () => {
    await request(app).post("/api/engine/metrics/reset");
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it("13. Body is empty on 204", async () => {
    const res = await request(app).post("/api/engine/metrics/reset");
    expect(res.text).toBe("");
  });

  it("14. GET /metrics after reset reflects zero state", async () => {
    await request(app).post("/api/engine/metrics/reset");
    mockSnapshot.mockReturnValue(emptySnapshot);
    const res = await request(app).get("/api/engine/metrics");
    expect(res.body.totalRuns).toBe(0);
    expect(res.body.failed).toBe(0);
  });
});
