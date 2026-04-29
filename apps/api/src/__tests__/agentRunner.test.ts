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

// ─── Mock Temporal client (POST /run now starts AutonomousGenerationWorkflow) ─

const mockAgentWorkflowHandle = {
  workflowId: "agent-run-okovanggo-ai-1234567890",
  firstExecutionRunId: "run-agent-001",
};

const mockAgentWorkflowStart = jest.fn().mockResolvedValue(mockAgentWorkflowHandle);
const mockAgentWorkflowGetHandle = jest.fn().mockReturnValue(mockAgentWorkflowHandle);

const mockTemporalClient = {
  workflow: {
    start:     mockAgentWorkflowStart,
    getHandle: mockAgentWorkflowGetHandle,
  },
};

jest.mock("../temporal/client", () => ({
  getTemporalClient: jest.fn().mockResolvedValue(mockTemporalClient),
}));

jest.mock("@temporalio/client", () => ({
  WorkflowNotFoundError: class WorkflowNotFoundError extends Error {
    constructor(msg?: string) { super(msg); this.name = "WorkflowNotFoundError"; }
  },
}));

// ─── Express app setup ───────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import agentRouter from "../routes/agent";

const app = express();
app.use(express.json());
app.use("/api/agent", agentRouter);

// ─────────────────────────────────────────────────────────────────────────────

describe("Agent Runner — POST /api/agent/run (T13: Temporal AutonomousGenerationWorkflow)", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockAgentWorkflowStart.mockResolvedValue(mockAgentWorkflowHandle);
  });

  // ─── Input validation (unchanged) ────────────────────────────────────────

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

  // ─── T13: non-blocking 202 + workflowId ──────────────────────────────────

  it("4. Valid goal → 202 (non-blocking — Temporal workflow started)", async () => {
    const res = await request(app)
      .post("/api/agent/run")
      .send({ title: "Night Drive", subgenre: "private_school", created_by: "okovanggo_ai" });
    expect(res.status).toBe(202);
  });

  it("5. Response has workflow_id string", async () => {
    const res = await request(app)
      .post("/api/agent/run")
      .send({ title: "Night Drive", subgenre: "private_school", created_by: "okovanggo_ai" });
    expect(res.status).toBe(202);
    expect(typeof res.body.workflow_id).toBe("string");
    expect(res.body.workflow_id.length).toBeGreaterThan(0);
  });

  it("6. Response has run_id string", async () => {
    const res = await request(app)
      .post("/api/agent/run")
      .send({ title: "Night Drive", subgenre: "private_school", created_by: "okovanggo_ai" });
    expect(res.status).toBe(202);
    expect(typeof res.body.run_id).toBe("string");
  });

  it("7. Response status field is 'started'", async () => {
    const res = await request(app)
      .post("/api/agent/run")
      .send({ title: "Night Drive", subgenre: "private_school", created_by: "okovanggo_ai" });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe("started");
  });

  it("8. Temporal workflow started with AutonomousGenerationWorkflow name", async () => {
    await request(app)
      .post("/api/agent/run")
      .send({ title: "Night Drive", subgenre: "private_school", created_by: "okovanggo_ai" });
    expect(mockAgentWorkflowStart).toHaveBeenCalledWith(
      "AutonomousGenerationWorkflow",
      expect.any(Object),
    );
  });

  it("9. Workflow args contain goal with title, subgenre, created_by", async () => {
    await request(app)
      .post("/api/agent/run")
      .send({ title: "Night Drive", subgenre: "sgija", created_by: "test-producer" });
    expect(mockAgentWorkflowStart).toHaveBeenCalledWith(
      "AutonomousGenerationWorkflow",
      expect.objectContaining({
        args: [expect.objectContaining({
          goal: expect.objectContaining({
            title:      "Night Drive",
            subgenre:   "sgija",
            created_by: "test-producer",
          }),
        })],
      }),
    );
  });

  it("10. Temporal client failure → 500 with error message", async () => {
    mockAgentWorkflowStart.mockRejectedValueOnce(new Error("Temporal unavailable"));
    const res = await request(app)
      .post("/api/agent/run")
      .send({ title: "Night Drive", subgenre: "private_school", created_by: "okovanggo_ai" });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Temporal unavailable/);
  });

});
