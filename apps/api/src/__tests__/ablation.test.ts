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
    on:     jest.fn(),
    quit:   jest.fn().mockResolvedValue("OK"),
    status: "ready",
  }))
);

// ─── Mock Supabase ────────────────────────────────────────────────────────────

const mockInsert = jest.fn().mockResolvedValue({ data: null, error: null });
const mockFrom   = jest.fn().mockReturnValue({ insert: mockInsert });

jest.mock("../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// ─── Mock @aura-x/ac-ami ─────────────────────────────────────────────────────

jest.mock("@aura-x/ac-ami", () => ({
  applyHarmonyPlan:         jest.fn().mockImplementation((c: unknown) => c),
  applyGroovePlan:          jest.fn().mockImplementation((c: unknown) => c),
  applyInstrumentationPlan: jest.fn().mockImplementation((c: unknown) => c),
  validateAll:              jest.fn().mockReturnValue({ passed: true, issues: [] }),
  recommendMutations:       jest.fn().mockReturnValue([]),
  applyMutations:           jest.fn().mockImplementation((c: unknown) => ({ ctl: c, log: [] })),
  repairCTL:                jest.fn(),
  conditionForMode2:        jest.fn(),
  evaluateSignal:           jest.fn().mockReturnValue({
    signal_composite_score: 0.82, passed_signal_gate: true, signal_notes: [],
  }),
}));

// ─── Mock @aura-x/suno-exporter ──────────────────────────────────────────────

jest.mock("@aura-x/suno-exporter", () => ({
  exportForSuno: jest.fn().mockImplementation((ctl: { global?: { subgenre?: string; bpm?: number; key?: string } }) => ({
    style_prompt:  `Amapiano ${ctl?.global?.subgenre ?? "private_school"} ${ctl?.global?.bpm ?? 112} BPM ${ctl?.global?.key ?? "F#m"} log drum piano pads shakers culturally grounded deep house lineage`,
    lyrics_prompt: "[VERSE]\nTest lyrics",
    warnings:      [],
  })),
}));

// ─── Mock route dependencies ──────────────────────────────────────────────────

jest.mock("../agent/datasetPipeline", () => ({
  exportDataset:      jest.fn().mockResolvedValue({ version: "1.0", record_count: 0, records: [] }),
  getDatasetStats:    jest.fn().mockResolvedValue({ total: 0, ready_for_training: false, training_threshold: 100 }),
  writeDatasetRecord: jest.fn().mockResolvedValue("ds-001"),
}));

jest.mock("../agent/finetuneRunner", () => ({
  triggerFinetune: jest.fn().mockResolvedValue({ run_id: "ft-001", status: "queued", message: "ok" }),
}));

jest.mock("../temporal/client", () => ({
  getTemporalClient: jest.fn().mockResolvedValue({
    workflow: {
      start:     jest.fn().mockResolvedValue({ workflowId: "wf-001", firstExecutionRunId: "run-001" }),
      getHandle: jest.fn(),
    },
  }),
}));

jest.mock("@temporalio/client", () => ({
  WorkflowNotFoundError: class extends Error {},
}));

jest.mock("../agent/revisionLoop", () => ({
  runRevisionLoop: jest.fn().mockResolvedValue({
    track_id: "t-001", final_ctl: {}, final_passed: true,
    iterations_run: 1, iterations: [], final_generation_id: "g-001",
    total_mutations_applied: 0,
  }),
}));

jest.mock("../agent/resultsStore", () => ({
  storeResult:  jest.fn().mockResolvedValue("r-001"),
  queryResults: jest.fn().mockResolvedValue([]),
}));

jest.mock("../generation/generationAgent", () => ({
  runGeneration: jest.fn().mockResolvedValue({ generation_id: "g-001" }),
}));

// ─── Express app setup ───────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import agentRouter from "../routes/agent";
import { runAblationStudy } from "../agent/ablationRunner";

const app = express();
app.use(express.json());
app.use("/api/agent", agentRouter);

// ─────────────────────────────────────────────────────────────────────────────

describe("runAblationStudy (unit)", () => {

  beforeEach(() => jest.clearAllMocks());

  it("1. Returns AblationResult shape with required fields", async () => {
    const result = await runAblationStudy("private_school", 2);
    expect(result).toHaveProperty("subgenre");
    expect(result).toHaveProperty("samples_per_condition");
    expect(result).toHaveProperty("conditions");
    expect(result).toHaveProperty("winner");
    expect(result).toHaveProperty("ac_ami_lift");
    expect(result).toHaveProperty("samples");
    expect(result).toHaveProperty("conclusion");
  });

  it("2. conditions object has all 3 keys", async () => {
    const result = await runAblationStudy("private_school", 2);
    expect(result.conditions).toHaveProperty("prompt_only");
    expect(result.conditions).toHaveProperty("ctl_no_lineage");
    expect(result.conditions).toHaveProperty("full_stack");
  });

  it("3. samples array has samplesPerCondition * 3 items", async () => {
    const n = 3;
    const result = await runAblationStudy("private_school", n);
    expect(result.samples).toHaveLength(n * 3);
  });

  it("4. full_stack samples have longer prompts than prompt_only (AC-AMI enriches)", async () => {
    const result = await runAblationStudy("private_school", 3);
    const fullStackLen  = result.conditions.full_stack.mean_prompt_length;
    const promptOnlyLen = result.conditions.prompt_only.mean_prompt_length;
    expect(fullStackLen).toBeGreaterThan(promptOnlyLen);
  });

  it("5. full_stack mean_composite_score >= prompt_only score", async () => {
    const result = await runAblationStudy("private_school", 3);
    expect(result.conditions.full_stack.mean_composite_score)
      .toBeGreaterThanOrEqual(result.conditions.prompt_only.mean_composite_score);
  });

  it("6. ac_ami_lift is a number", async () => {
    const result = await runAblationStudy("private_school", 2);
    expect(typeof result.ac_ami_lift).toBe("number");
    expect(isNaN(result.ac_ami_lift)).toBe(false);
  });

  it("7. winner is one of the three conditions", async () => {
    const result = await runAblationStudy("private_school", 2);
    expect(["prompt_only", "ctl_no_lineage", "full_stack"]).toContain(result.winner);
  });

  it("8. conclusion is a non-empty string", async () => {
    const result = await runAblationStudy("private_school", 2);
    expect(typeof result.conclusion).toBe("string");
    expect(result.conclusion.length).toBeGreaterThan(0);
  });

});

describe("POST /api/agent/ablation", () => {

  beforeEach(() => jest.clearAllMocks());

  it("9. Missing subgenre → 400", async () => {
    const res = await request(app)
      .post("/api/agent/ablation")
      .send({ samples_per_condition: 3 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("10. Valid subgenre → 200 with conditions object", async () => {
    const res = await request(app)
      .post("/api/agent/ablation")
      .send({ subgenre: "private_school", samples_per_condition: 2 });
    expect(res.status).toBe(200);
    expect(res.body.conditions).toBeDefined();
    expect(res.body.conditions).toHaveProperty("prompt_only");
    expect(res.body.conditions).toHaveProperty("full_stack");
  });

});
