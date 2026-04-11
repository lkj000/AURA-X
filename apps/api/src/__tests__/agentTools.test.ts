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

// ─── Mock Supabase ────────────────────────────────────────────────────────────

const mockSingle       = jest.fn().mockResolvedValue({ data: { id: "result-uuid-001" }, error: null });
const mockSelectInsert = jest.fn().mockReturnValue({ single: mockSingle });
const mockInsert       = jest.fn().mockReturnValue({ select: mockSelectInsert });
// query chain: select → eq → (gte?) → order → limit (awaited)
const mockLimit        = jest.fn().mockResolvedValue({ data: [], error: null });
const mockOrder        = jest.fn().mockReturnValue({ limit: mockLimit });
const mockGte          = jest.fn().mockReturnValue({ order: mockOrder });
const mockEqFetch      = jest.fn().mockReturnValue({ order: mockOrder, gte: mockGte });
const mockSelectFetch  = jest.fn().mockReturnValue({ eq: mockEqFetch });
const mockFrom         = jest.fn().mockImplementation(() => ({
  insert: mockInsert,
  select: mockSelectFetch,
}));

jest.mock("../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// ─── Mock @aura-x/ac-ami ─────────────────────────────────────────────────────

jest.mock("@aura-x/ac-ami", () => ({
  validateAll:        jest.fn().mockReturnValue({ passed: true, issues: [] }),
  recommendMutations: jest.fn().mockReturnValue([]),
  applyMutations:     jest.fn().mockImplementation((ctl: unknown) => ({ ctl, log: [] })),
  repairCTL:          jest.fn(),
  conditionForMode2:  jest.fn(),
}));

// ─── Mock @aura-x/suno-exporter ──────────────────────────────────────────────

jest.mock("@aura-x/suno-exporter", () => ({
  exportForSuno: jest.fn().mockReturnValue({
    style_prompt:  "Amapiano private school 112 BPM F#m",
    lyrics_prompt: "[VERSE]\nTest lyrics",
    warnings: [],
  }),
}));

// ─── Mock generationAgent ────────────────────────────────────────────────────

jest.mock("../generation/generationAgent", () => ({
  runGeneration: jest.fn().mockResolvedValue({
    generation_id: "gen-001",
    track_id: "track-001",
    mode: "mode_1_suno",
    status: "complete",
  }),
}));

// ─── App + direct imports ────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import agentRouter from "../routes/agent";
import { storeResult, queryResults } from "../agent/resultsStore";
import { tuneWeightsForSubgenre } from "../agent/weightTuner";
import { createCTL } from "@aura-x/ctl";

const app = express();
app.use(express.json());
app.use("/api/agent", agentRouter);

const VALID_CTL = createCTL({
  global: { title: "Test Track", bpm: 112, key: "F#m", subgenre: "private_school", created_by: "test" },
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Agent Tools — Results Store + Weight Tuner + Dataset Builder", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockImplementation(() => ({ insert: mockInsert, select: mockSelectFetch }));
    mockInsert.mockReturnValue({ select: mockSelectInsert });
    mockSelectInsert.mockReturnValue({ single: mockSingle });
    mockSingle.mockResolvedValue({ data: { id: "result-uuid-001" }, error: null });
    mockSelectFetch.mockReturnValue({ eq: mockEqFetch });
    mockEqFetch.mockReturnValue({ order: mockOrder, gte: mockGte });
    mockGte.mockReturnValue({ order: mockOrder });
    mockOrder.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue({ data: [], error: null });
  });

  // ─── resultsStore ─────────────────────────────────────────────────────────

  it("1. storeResult writes to evaluations table", async () => {
    await storeResult({
      track_id: "t-001", generation_id: "g-001",
      ctl_snapshot: VALID_CTL, composite_score: 0.9,
      passed: true, subgenre: "private_school",
      bpm: 112, key: "F#m",
      mutations_applied: [], iterations_run: 1,
    });
    expect(mockFrom).toHaveBeenCalledWith("evaluations");
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("2. storeResult returns a string ID", async () => {
    const id = await storeResult({
      track_id: "t-001", generation_id: "g-001",
      ctl_snapshot: VALID_CTL, composite_score: 0.9,
      passed: true, subgenre: "private_school",
      bpm: 112, key: "F#m",
      mutations_applied: [], iterations_run: 1,
    });
    expect(typeof id).toBe("string");
    expect(id).toBe("result-uuid-001");
  });

  it("3. queryResults calls supabase with correct params", async () => {
    await queryResults("private_school", 0.75, 20);
    expect(mockFrom).toHaveBeenCalledWith("evaluations");
    expect(mockEqFetch).toHaveBeenCalledWith("evaluator", "experiment");
  });

  // ─── weightTuner ──────────────────────────────────────────────────────────

  it("4. tuneWeightsForSubgenre with 0 results → confidence: 0", async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });
    const rec = await tuneWeightsForSubgenre("private_school", 0.75);
    expect(rec.confidence).toBe(0);
  });

  it("5. tuneWeightsForSubgenre with 0 results → sample_size: 0", async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });
    const rec = await tuneWeightsForSubgenre("private_school", 0.75);
    expect(rec.sample_size).toBe(0);
  });

  it("6. tuneWeightsForSubgenre recommendation has subgenre field", async () => {
    const rec = await tuneWeightsForSubgenre("sgija", 0.75);
    expect(rec.subgenre).toBe("sgija");
  });

  // ─── POST /api/agent/tune ─────────────────────────────────────────────────

  it("7. POST /api/agent/tune — missing subgenre → 400", async () => {
    const res = await request(app).post("/api/agent/tune").send({ min_score: 0.8 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("8. POST /api/agent/tune — valid subgenre → 200 with recommendation", async () => {
    const res = await request(app)
      .post("/api/agent/tune")
      .send({ subgenre: "private_school" });
    expect(res.status).toBe(200);
    expect(res.body.subgenre).toBe("private_school");
  });

  it("9. POST /api/agent/tune — response has confidence field", async () => {
    const res = await request(app)
      .post("/api/agent/tune")
      .send({ subgenre: "private_school" });
    expect(res.status).toBe(200);
    expect(typeof res.body.confidence).toBe("number");
    expect(res.body.confidence).toBeGreaterThanOrEqual(0);
    expect(res.body.confidence).toBeLessThanOrEqual(1);
  });

  it("10. POST /api/agent/tune — response has lineage_adjustments object", async () => {
    const res = await request(app)
      .post("/api/agent/tune")
      .send({ subgenre: "bacardi" });
    expect(res.status).toBe(200);
    expect(res.body.lineage_adjustments).toBeDefined();
    expect(typeof res.body.lineage_adjustments).toBe("object");
  });

  // ─── GET /api/agent/dataset ───────────────────────────────────────────────

  it("11. GET /api/agent/dataset → returns { records, count, min_score }", async () => {
    const res = await request(app).get("/api/agent/dataset");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("records");
    expect(res.body).toHaveProperty("count");
    expect(res.body).toHaveProperty("min_score");
    expect(Array.isArray(res.body.records)).toBe(true);
  });

  it("12. GET /api/agent/dataset — min_score defaults to 0.80", async () => {
    const res = await request(app).get("/api/agent/dataset");
    expect(res.status).toBe(200);
    expect(res.body.min_score).toBe(0.80);
  });

});
