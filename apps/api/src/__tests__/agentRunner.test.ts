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

const mockSingle   = jest.fn();
const mockEq       = jest.fn();
const mockSelect   = jest.fn();
const mockInsert   = jest.fn();
const mockUpdate   = jest.fn();
const mockFrom     = jest.fn();

jest.mock("../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// ─── Mock @aura-x/ac-ami ─────────────────────────────────────────────────────

jest.mock("@aura-x/ac-ami", () => ({
  applyHarmonyPlan:        jest.fn().mockImplementation((ctl: unknown) => ctl),
  applyGroovePlan:         jest.fn().mockImplementation((ctl: unknown) => ctl),
  applyInstrumentationPlan: jest.fn().mockImplementation((ctl: unknown) => ctl),
  validateAll:             jest.fn().mockReturnValue({ passed: true, issues: [] }),
  recommendMutations:      jest.fn().mockReturnValue([]),
  applyMutations:          jest.fn().mockImplementation((ctl: unknown) => ({ ctl, log: [] })),
  repairCTL:               jest.fn(),
  conditionForMode2:       jest.fn(),
}));

// ─── Mock @aura-x/suno-exporter ──────────────────────────────────────────────

jest.mock("@aura-x/suno-exporter", () => ({
  exportForSuno: jest.fn().mockReturnValue({
    style_prompt:  "Amapiano private school 112 BPM F#m",
    lyrics_prompt: "[VERSE]\nTest lyrics",
    warnings: [],
  }),
}));

// ─── Mock revisionLoop ────────────────────────────────────────────────────────

const MOCK_REVISION_RESULT = {
  track_id: "track-001",
  final_ctl: { global: { bpm: 112, key: "F#m" }, evaluation_targets: {} },
  final_passed: true,
  iterations_run: 1,
  iterations: [{ iteration: 1, validation_passed: true, issue_count: 0,
                 mutations_applied: [], generation_id: "gen-001", composite_score: 1.0 }],
  final_generation_id: "gen-001",
  total_mutations_applied: 0,
};

jest.mock("../agent/revisionLoop", () => ({
  runRevisionLoop: jest.fn().mockResolvedValue(MOCK_REVISION_RESULT),
}));

// ─── Mock resultsStore ────────────────────────────────────────────────────────

jest.mock("../agent/resultsStore", () => ({
  storeResult:  jest.fn().mockResolvedValue("result-uuid-001"),
  queryResults: jest.fn().mockResolvedValue([]),
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

// ─── Express app setup ───────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import agentRouter from "../routes/agent";

const app = express();
app.use(express.json());
app.use("/api/agent", agentRouter);

// ─────────────────────────────────────────────────────────────────────────────

describe("Agent Runner — POST /api/agent/run", () => {

  beforeEach(() => {
    jest.clearAllMocks();

    // Default supabase mock: track insert succeeds, everything else is a no-op
    mockSingle.mockResolvedValue({ data: { id: "track-uuid-001" }, error: null });
    mockSelect.mockReturnValue({ single: mockSingle });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockEq.mockResolvedValue({ data: {}, error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });

    // Route mockFrom based on table name
    mockFrom.mockImplementation((table: string) => {
      if (table === "generations") {
        // For the suno bundle fetch — return no data
        const s = jest.fn().mockResolvedValue({ data: null, error: null });
        const e = jest.fn().mockReturnValue({ single: s });
        const sel = jest.fn().mockReturnValue({ eq: e });
        return { select: sel };
      }
      return { insert: mockInsert, update: mockUpdate, select: mockSelect };
    });

    // Re-apply revision result (cleared by clearAllMocks)
    const { runRevisionLoop } = require("../agent/revisionLoop");
    (runRevisionLoop as jest.Mock).mockResolvedValue(MOCK_REVISION_RESULT);

    const { storeResult } = require("../agent/resultsStore");
    (storeResult as jest.Mock).mockResolvedValue("result-uuid-001");
  });

  // ─── Input validation ─────────────────────────────────────────────────────

  it("1. Missing title → 400", async () => {
    const res = await request(app)
      .post("/api/agent/run")
      .send({ subgenre: "private_school", created_by: "test" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("2. Missing subgenre → 400", async () => {
    const res = await request(app)
      .post("/api/agent/run")
      .send({ title: "Night Drive", created_by: "test" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("3. Missing created_by → 400", async () => {
    const res = await request(app)
      .post("/api/agent/run")
      .send({ title: "Night Drive", subgenre: "private_school" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  // ─── Successful run ───────────────────────────────────────────────────────

  it("4. Valid goal → 200", async () => {
    const res = await request(app)
      .post("/api/agent/run")
      .send({ title: "Night Drive", subgenre: "private_school", created_by: "okovanggo_ai" });
    expect(res.status).toBe(200);
  });

  it("5. Response has status field ('complete' or 'partial')", async () => {
    const res = await request(app)
      .post("/api/agent/run")
      .send({ title: "Night Drive", subgenre: "private_school", created_by: "okovanggo_ai" });
    expect(res.status).toBe(200);
    expect(["complete", "partial"]).toContain(res.body.status);
  });

  it("6. Response has track_id (non-empty string)", async () => {
    const res = await request(app)
      .post("/api/agent/run")
      .send({ title: "Night Drive", subgenre: "private_school", created_by: "okovanggo_ai" });
    expect(res.status).toBe(200);
    expect(typeof res.body.track_id).toBe("string");
    expect(res.body.track_id.length).toBeGreaterThan(0);
  });

  it("7. Response has ctl object", async () => {
    const res = await request(app)
      .post("/api/agent/run")
      .send({ title: "Night Drive", subgenre: "private_school", created_by: "okovanggo_ai" });
    expect(res.status).toBe(200);
    expect(res.body.ctl).toBeDefined();
    expect(typeof res.body.ctl).toBe("object");
  });

  it("8. Response has validation_passed boolean", async () => {
    const res = await request(app)
      .post("/api/agent/run")
      .send({ title: "Night Drive", subgenre: "private_school", created_by: "okovanggo_ai" });
    expect(res.status).toBe(200);
    expect(typeof res.body.validation_passed).toBe("boolean");
  });

  it("9. Response has agent_log array with entries", async () => {
    const res = await request(app)
      .post("/api/agent/run")
      .send({ title: "Night Drive", subgenre: "private_school", created_by: "okovanggo_ai" });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.agent_log)).toBe(true);
    expect(res.body.agent_log.length).toBeGreaterThan(0);
  });

  it("10. agent_log contains '[agent] ✓ Complete'", async () => {
    const res = await request(app)
      .post("/api/agent/run")
      .send({ title: "Night Drive", subgenre: "private_school", created_by: "okovanggo_ai" });
    expect(res.status).toBe(200);
    expect(res.body.agent_log).toContain("[agent] ✓ Complete");
  });

});
