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

const mockInsert = jest.fn().mockResolvedValue({ data: {}, error: null });
const mockFrom   = jest.fn().mockReturnValue({ insert: mockInsert });

jest.mock("../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// ─── Mock @aura-x/ac-ami ─────────────────────────────────────────────────────

const mockValidateAll        = jest.fn();
const mockRecommendMutations = jest.fn();
const mockApplyMutations     = jest.fn();

jest.mock("@aura-x/ac-ami", () => ({
  validateAll:        (...args: unknown[]) => mockValidateAll(...args),
  recommendMutations: (...args: unknown[]) => mockRecommendMutations(...args),
  applyMutations:     (...args: unknown[]) => mockApplyMutations(...args),
  repairCTL:          jest.fn(),
  conditionForMode2:  jest.fn(),
}));

// ─── Mock generationAgent ─────────────────────────────────────────────────────

const mockRunGeneration = jest.fn();

jest.mock("../generation/generationAgent", () => ({
  runGeneration: (...args: unknown[]) => mockRunGeneration(...args),
}));

// ─── Express app setup ───────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import agentRouter from "../routes/agent";
import { createCTL } from "@aura-x/ctl";

const app = express();
app.use(express.json());
app.use("/api/agent", agentRouter);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_CTL = createCTL({
  global: { title: "Test Track", bpm: 112, key: "F#m", subgenre: "private_school", created_by: "test" },
});

const PASSED_VALIDATION   = { passed: true,  issues: [] };
const FAILED_VALIDATION   = { passed: false, issues: [{ code: "LINEAGE_SUM", severity: "error", message: "sum > 1" }] };

// ─────────────────────────────────────────────────────────────────────────────

describe("Revision Loop", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockReturnValue({ insert: mockInsert });
    mockInsert.mockResolvedValue({ data: {}, error: null });
    mockRunGeneration.mockResolvedValue({
      generation_id: "gen-001",
      track_id: "track-001",
      mode: "mode_1_suno",
      status: "complete",
    });
    mockValidateAll.mockReturnValue(PASSED_VALIDATION);
    mockRecommendMutations.mockReturnValue([]);
    mockApplyMutations.mockImplementation((ctl: unknown) => ({ ctl, log: [] }));
  });

  // ─── GET /api/agent/status ────────────────────────────────────────────────

  it("1. GET /api/agent/status → 200", async () => {
    const res = await request(app).get("/api/agent/status");
    expect(res.status).toBe(200);
  });

  it("2. Response has agent: 'AURA X'", async () => {
    const res = await request(app).get("/api/agent/status");
    expect(res.body.agent).toBe("AURA X");
  });

  it("3. Response has level: 5", async () => {
    const res = await request(app).get("/api/agent/status");
    expect(res.body.level).toBe(5);
  });

  it("4. capabilities includes 'evaluate' and 'revise'", async () => {
    const res = await request(app).get("/api/agent/status");
    expect(res.body.capabilities).toContain("evaluate");
    expect(res.body.capabilities).toContain("revise");
  });

  // ─── POST /api/agent/revise ───────────────────────────────────────────────

  it("5. Missing track_id → 400", async () => {
    const res = await request(app)
      .post("/api/agent/revise")
      .send({ ctl_id: "ctl-001", ctl: VALID_CTL });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("6. Invalid CTL → 400", async () => {
    const res = await request(app)
      .post("/api/agent/revise")
      .send({ track_id: "t-001", ctl_id: "ctl-001", ctl: { invalid: true } });
    expect(res.status).toBe(400);
    expect(res.body.issues).toBeDefined();
  });

  it("7. Valid CTL passing on first try → iterations_run: 1, final_passed: true", async () => {
    mockValidateAll.mockReturnValue(PASSED_VALIDATION);

    const res = await request(app)
      .post("/api/agent/revise")
      .send({ track_id: "t-001", ctl_id: "ctl-001", ctl: VALID_CTL });

    expect(res.status).toBe(200);
    expect(res.body.final_passed).toBe(true);
    expect(res.body.iterations_run).toBe(1);
    expect(res.body.iterations[0].validation_passed).toBe(true);
  });

  it("8. CTL fails then passes → iterations_run: 2, mutations in iteration 1", async () => {
    // First call: validateAll for the failing iteration
    // Second call: validateAll inside loop after applying mutations (passes) → generates
    // Third call: final validateAll at the end
    mockValidateAll
      .mockReturnValueOnce(FAILED_VALIDATION)   // iteration 1: fails
      .mockReturnValueOnce(PASSED_VALIDATION)   // iteration 2: passes
      .mockReturnValue(PASSED_VALIDATION);       // final check

    mockRecommendMutations.mockReturnValue(["fix_lineage_sum"]);
    mockApplyMutations.mockReturnValue({ ctl: VALID_CTL, log: [{ reason: "Fixed lineage sum", applied: true }] });

    const res = await request(app)
      .post("/api/agent/revise")
      .send({ track_id: "t-001", ctl_id: "ctl-001", ctl: VALID_CTL });

    expect(res.status).toBe(200);
    expect(res.body.iterations_run).toBe(2);
    expect(res.body.iterations[0].mutations_applied).toContain("fix_lineage_sum");
    expect(res.body.iterations[1].validation_passed).toBe(true);
  });

  it("9. Response has final_ctl object", async () => {
    const res = await request(app)
      .post("/api/agent/revise")
      .send({ track_id: "t-001", ctl_id: "ctl-001", ctl: VALID_CTL });

    expect(res.status).toBe(200);
    expect(res.body.final_ctl).toBeDefined();
    expect(typeof res.body.final_ctl).toBe("object");
  });

  it("10. total_mutations_applied is a non-negative integer", async () => {
    const res = await request(app)
      .post("/api/agent/revise")
      .send({ track_id: "t-001", ctl_id: "ctl-001", ctl: VALID_CTL });

    expect(res.status).toBe(200);
    expect(typeof res.body.total_mutations_applied).toBe("number");
    expect(res.body.total_mutations_applied).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(res.body.total_mutations_applied)).toBe(true);
  });

});
