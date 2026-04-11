import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ─── Mock Temporal client ─────────────────────────────────────────────────────

const mockWorkflowHandle = {
  workflowId: "dataset-ingest-track-001-gen-001",
  firstExecutionRunId: "run-001",
  result: jest.fn().mockResolvedValue({
    dataset_record_id: "ds-001",
    track_id: "track-001",
    signal_composite_score: 0.82,
    activities_completed: [
      "analyzeAudio", "separateStems", "extractLogDrum", "alignToCtl", "writeDatasetRecord",
    ],
  }),
  describe: jest.fn().mockResolvedValue({
    runId: "run-001",
    status: { name: "COMPLETED" },
  }),
};

const mockWorkflowStart = jest.fn().mockResolvedValue(mockWorkflowHandle);
const mockWorkflowGetHandle = jest.fn().mockReturnValue(mockWorkflowHandle);

const mockTemporalClient = {
  workflow: {
    start:     mockWorkflowStart,
    getHandle: mockWorkflowGetHandle,
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

jest.mock("../lib/supabase", () => ({
  supabase: { from: jest.fn() },
}));

// ─── Mock agent dependencies ──────────────────────────────────────────────────

jest.mock("@aura-x/ac-ami", () => ({
  applyHarmonyPlan:        jest.fn().mockImplementation((c: unknown) => c),
  applyGroovePlan:         jest.fn().mockImplementation((c: unknown) => c),
  applyInstrumentationPlan: jest.fn().mockImplementation((c: unknown) => c),
  validateAll:             jest.fn().mockReturnValue({ passed: true, issues: [] }),
  recommendMutations:      jest.fn().mockReturnValue([]),
  applyMutations:          jest.fn().mockImplementation((c: unknown) => ({ ctl: c, log: [] })),
  repairCTL:               jest.fn(),
  conditionForMode2:       jest.fn(),
  evaluateSignal:          jest.fn().mockReturnValue({
    signal_composite_score: 0.82,
    passed_signal_gate: true,
    signal_notes: [],
    bpm_accuracy: 1.0, key_accuracy: 1.0, energy_accuracy: 1.0,
    groove_density_score: 1.0, cultural_signal_score: 1.0,
    bpm_gap: 0, key_match: true, energy_gap: 0,
  }),
}));

jest.mock("@aura-x/suno-exporter", () => ({
  exportForSuno: jest.fn().mockReturnValue({
    style_prompt: "test", lyrics_prompt: "test", warnings: [],
  }),
}));

jest.mock("../agent/revisionLoop", () => ({
  runRevisionLoop: jest.fn().mockResolvedValue({
    track_id: "track-001",
    final_ctl: { global: { bpm: 112, key: "F#m" }, evaluation_targets: {} },
    final_passed: true,
    iterations_run: 1,
    iterations: [{ iteration: 1, validation_passed: true, issue_count: 0,
                   mutations_applied: [], generation_id: "gen-001", composite_score: 1.0 }],
    final_generation_id: "gen-001",
    total_mutations_applied: 0,
  }),
}));

jest.mock("../agent/resultsStore", () => ({
  storeResult:  jest.fn().mockResolvedValue("result-uuid-001"),
  queryResults: jest.fn().mockResolvedValue([]),
}));

jest.mock("../generation/generationAgent", () => ({
  runGeneration: jest.fn().mockResolvedValue({
    generation_id: "gen-001", track_id: "track-001",
    mode: "mode_1_suno", status: "complete",
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

describe("Temporal — POST /api/agent/ingest", () => {

  beforeEach(() => jest.clearAllMocks());

  it("1. Missing track_id → 400", async () => {
    const res = await request(app)
      .post("/api/agent/ingest")
      .send({ generation_id: "gen-001", audio_url: "s3://bucket/audio.wav" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("2. Missing generation_id → 400", async () => {
    const res = await request(app)
      .post("/api/agent/ingest")
      .send({ track_id: "track-001", audio_url: "s3://bucket/audio.wav" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("3. Missing audio_url → 400", async () => {
    const res = await request(app)
      .post("/api/agent/ingest")
      .send({ track_id: "track-001", generation_id: "gen-001" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("4. Invalid source value → 400", async () => {
    const res = await request(app)
      .post("/api/agent/ingest")
      .send({ track_id: "track-001", generation_id: "gen-001",
              audio_url: "s3://bucket/audio.wav", source: "suno" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/source/);
  });

  it("5. Valid ingest request → 202 with workflow_id", async () => {
    const res = await request(app)
      .post("/api/agent/ingest")
      .send({ track_id: "track-001", generation_id: "gen-001",
              audio_url: "s3://bucket/audio.wav", source: "human" });
    expect(res.status).toBe(202);
    expect(res.body.workflow_id).toBeDefined();
    expect(res.body.status).toBe("started");
  });

  it("6. Source defaults to 'human' when not provided", async () => {
    const res = await request(app)
      .post("/api/agent/ingest")
      .send({ track_id: "track-001", generation_id: "gen-001",
              audio_url: "s3://bucket/audio.wav" });
    expect(res.status).toBe(202);
    expect(mockWorkflowStart).toHaveBeenCalledWith(
      "DatasetIngestionWorkflow",
      expect.objectContaining({
        args: [expect.objectContaining({ source: "human" })],
      }),
    );
  });

  it("7. Workflow ID passed to Temporal includes track_id and generation_id", async () => {
    await request(app)
      .post("/api/agent/ingest")
      .send({ track_id: "track-abc", generation_id: "gen-xyz",
              audio_url: "s3://bucket/audio.wav" });
    expect(mockWorkflowStart).toHaveBeenCalledWith(
      "DatasetIngestionWorkflow",
      expect.objectContaining({
        workflowId: expect.stringContaining("track-abc"),
      }),
    );
    expect(mockWorkflowStart).toHaveBeenCalledWith(
      "DatasetIngestionWorkflow",
      expect.objectContaining({
        workflowId: expect.stringContaining("gen-xyz"),
      }),
    );
  });

});

describe("Temporal — GET /api/agent/workflow/:workflowId", () => {

  it("8. Completed workflow returns result", async () => {
    mockWorkflowHandle.describe.mockResolvedValue({
      runId: "run-001",
      status: { name: "COMPLETED" },
    });
    const res = await request(app).get("/api/agent/workflow/dataset-ingest-track-001-gen-001");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
    expect(res.body.result).toBeDefined();
    expect(res.body.result.signal_composite_score).toBe(0.82);
  });

  it("9. Running workflow returns running status (no result)", async () => {
    mockWorkflowHandle.describe.mockResolvedValue({
      runId: "run-001",
      status: { name: "RUNNING" },
    });
    const res = await request(app).get("/api/agent/workflow/dataset-ingest-track-001-gen-001");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("running");
    expect(res.body.result).toBeUndefined();
  });

  it("10. Unknown workflow → 404", async () => {
    const { WorkflowNotFoundError } = require("@temporalio/client");
    mockWorkflowHandle.describe.mockRejectedValue(new WorkflowNotFoundError("not found"));
    const res = await request(app).get("/api/agent/workflow/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.status).toBe("not_found");
  });

});
