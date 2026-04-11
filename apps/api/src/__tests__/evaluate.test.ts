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

const mockSingle      = jest.fn().mockResolvedValue({ data: { id: "eval-uuid-001" }, error: null });
const mockSelectInsert = jest.fn().mockReturnValue({ single: mockSingle });
const mockInsert      = jest.fn().mockReturnValue({ select: mockSelectInsert });
const mockOrder       = jest.fn().mockResolvedValue({ data: [], error: null });
const mockEqFetch     = jest.fn().mockReturnValue({ order: mockOrder });
const mockSelectFetch = jest.fn().mockReturnValue({ eq: mockEqFetch });
const mockFrom        = jest.fn().mockImplementation(() => ({
  insert: mockInsert,
  select: mockSelectFetch,
}));

jest.mock("../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// ─── App setup ────────────────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import evaluateRouter from "../routes/evaluate";
import { createCTL } from "@aura-x/ctl";

const app = express();
app.use(express.json());
app.use("/api/evaluate", evaluateRouter);

// ─── CTL fixtures ─────────────────────────────────────────────────────────────

const VALID_CTL = createCTL({
  global: { title: "Test Track", bpm: 112, key: "F#m", subgenre: "private_school", created_by: "test" },
});

// CTL with inflated lineage weights to trigger validator warnings/errors
const CTL_BAD_LINEAGE = {
  ...VALID_CTL,
  cultural_lineage: {
    ...VALID_CTL.cultural_lineage,
    deep_house:          { weight: 0.99, influences: ["harmonic_pacing"], must_not: [] },
    kwaito:              { weight: 0.99, influences: [], must_not: [] },
    jazz:                { weight: 0.99, influences: [], must_not: [] },
    lounge:              { weight: 0.99, influences: [], must_not: [] },
    bacardi:             { weight: 0.99, influences: [], must_not: [] },
    dibacardi:           { weight: 0.99, influences: [], must_not: [] },
    log_drum_innovation: { weight: 0.99, influences: [], must_not: [] },
  },
};

// ─────────────────────────────────────────────────────────────────────────────

describe("Evaluation API", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockImplementation(() => ({ insert: mockInsert, select: mockSelectFetch }));
    mockInsert.mockReturnValue({ select: mockSelectInsert });
    mockSelectInsert.mockReturnValue({ single: mockSingle });
    mockSingle.mockResolvedValue({ data: { id: "eval-uuid-001" }, error: null });
    mockSelectFetch.mockReturnValue({ eq: mockEqFetch });
    mockEqFetch.mockReturnValue({ order: mockOrder });
    mockOrder.mockResolvedValue({ data: [], error: null });
  });

  // ─── Input validation ─────────────────────────────────────────────────────

  it("1. Missing generation_id → 400", async () => {
    const res = await request(app)
      .post("/api/evaluate")
      .send({ track_id: "track-001", ctl: VALID_CTL });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("2. Missing track_id → 400", async () => {
    const res = await request(app)
      .post("/api/evaluate")
      .send({ generation_id: "gen-001", ctl: VALID_CTL });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("3. Invalid CTL → 400 with issues array", async () => {
    const res = await request(app)
      .post("/api/evaluate")
      .send({ generation_id: "gen-001", track_id: "track-001", ctl: { bad: "data" } });
    expect(res.status).toBe(400);
    expect(res.body.issues).toBeDefined();
    expect(Array.isArray(res.body.issues)).toBe(true);
  });

  // ─── Successful evaluation ────────────────────────────────────────────────

  it("4. Valid CTL (passing) → 200 with passed: true", async () => {
    const res = await request(app)
      .post("/api/evaluate")
      .send({ generation_id: "gen-001", track_id: "track-001", ctl: VALID_CTL });
    expect(res.status).toBe(200);
    expect(res.body.passed).toBe(true);
  });

  it("5. Valid CTL → composite_score is a number between 0 and 1", async () => {
    const res = await request(app)
      .post("/api/evaluate")
      .send({ generation_id: "gen-001", track_id: "track-001", ctl: VALID_CTL });
    expect(res.status).toBe(200);
    expect(typeof res.body.composite_score).toBe("number");
    expect(res.body.composite_score).toBeGreaterThanOrEqual(0);
    expect(res.body.composite_score).toBeLessThanOrEqual(1);
  });

  it("6. CTL with bad lineage weights → validation finds issues", async () => {
    const res = await request(app)
      .post("/api/evaluate")
      .send({ generation_id: "gen-001", track_id: "track-001", ctl: CTL_BAD_LINEAGE });
    expect(res.status).toBe(200);
    expect(res.body.issue_count).toBeGreaterThan(0);
  });

  it("7. Response has evaluation_id (string)", async () => {
    const res = await request(app)
      .post("/api/evaluate")
      .send({ generation_id: "gen-001", track_id: "track-001", ctl: VALID_CTL });
    expect(res.status).toBe(200);
    expect(res.body.evaluation_id).toBeDefined();
    expect(typeof res.body.evaluation_id).toBe("string");
  });

  it("8. Response has recommended_mutations array", async () => {
    const res = await request(app)
      .post("/api/evaluate")
      .send({ generation_id: "gen-001", track_id: "track-001", ctl: VALID_CTL });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.recommended_mutations)).toBe(true);
  });

  it("9. Supabase evaluations.insert called once", async () => {
    await request(app)
      .post("/api/evaluate")
      .send({ generation_id: "gen-001", track_id: "track-001", ctl: VALID_CTL });
    expect(mockFrom).toHaveBeenCalledWith("evaluations");
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  // ─── GET evaluation history ───────────────────────────────────────────────

  it("10. GET /api/evaluate/:generationId → 200 with evaluations array", async () => {
    const res = await request(app).get("/api/evaluate/gen-001");
    expect(res.status).toBe(200);
    expect(res.body.generation_id).toBe("gen-001");
    expect(Array.isArray(res.body.evaluations)).toBe(true);
    expect(typeof res.body.count).toBe("number");
  });

});
