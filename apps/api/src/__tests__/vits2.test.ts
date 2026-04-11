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
    on: jest.fn(), quit: jest.fn().mockResolvedValue("OK"), status: "ready",
  }))
);

// ─── Mock Supabase ────────────────────────────────────────────────────────────

jest.mock("../lib/supabase", () => ({
  supabase: { from: jest.fn().mockReturnValue({ insert: jest.fn(), select: jest.fn() }) },
}));

// ─── Mock route dependencies ──────────────────────────────────────────────────

jest.mock("@aura-x/ac-ami", () => ({
  applyHarmonyPlan:         jest.fn().mockImplementation((c: unknown) => c),
  applyGroovePlan:          jest.fn().mockImplementation((c: unknown) => c),
  applyInstrumentationPlan: jest.fn().mockImplementation((c: unknown) => c),
  validateAll:              jest.fn().mockReturnValue({ passed: true, issues: [] }),
  recommendMutations:       jest.fn().mockReturnValue([]),
  applyMutations:           jest.fn().mockImplementation((c: unknown) => ({ ctl: c, log: [] })),
  repairCTL:                jest.fn(),
  conditionForMode2:        jest.fn(),
  evaluateSignal:           jest.fn().mockReturnValue({ signal_composite_score: 0.82, passed_signal_gate: true, signal_notes: [] }),
}));

jest.mock("@aura-x/suno-exporter", () => ({
  exportForSuno: jest.fn().mockReturnValue({ style_prompt: "test", lyrics_prompt: "test", warnings: [] }),
}));

jest.mock("../agent/datasetPipeline", () => ({
  exportDataset:      jest.fn().mockResolvedValue({ version: "1.0", record_count: 0, records: [] }),
  getDatasetStats:    jest.fn().mockResolvedValue({ total: 0, ready_for_training: false, training_threshold: 100 }),
  writeDatasetRecord: jest.fn().mockResolvedValue("ds-001"),
}));

jest.mock("../agent/finetuneRunner", () => ({
  triggerFinetune: jest.fn().mockResolvedValue({ run_id: "ft-001", status: "queued", message: "ok" }),
}));

jest.mock("../agent/ablationRunner", () => ({
  runAblationStudy: jest.fn().mockResolvedValue({
    subgenre: "private_school", winner: "full_stack", ac_ami_lift: 0.1,
    conclusion: "AC-AMI outperforms.", conditions: {}, samples: [],
    samples_per_condition: 3,
  }),
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

const app = express();
app.use(express.json());
app.use("/api/agent", agentRouter);

// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/agent/synthesize — VITS2 isiZulu", () => {

  it("1. Missing text → 400", async () => {
    const res = await request(app)
      .post("/api/agent/synthesize")
      .send({ patch_class: "male_percussive_chant" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("2. Valid text → 200", async () => {
    const res = await request(app)
      .post("/api/agent/synthesize")
      .send({ text: "ngiyabonga" });
    expect(res.status).toBe(200);
  });

  it("3. Response has ipa_transcription field", async () => {
    const res = await request(app)
      .post("/api/agent/synthesize")
      .send({ text: "ngiyabonga" });
    expect(res.status).toBe(200);
    expect(res.body.ipa_transcription).toBeDefined();
    expect(typeof res.body.ipa_transcription).toBe("string");
  });

  it("4. Response has original_text matching input", async () => {
    const res = await request(app)
      .post("/api/agent/synthesize")
      .send({ text: "ngiyabonga" });
    expect(res.status).toBe(200);
    expect(res.body.original_text).toBe("ngiyabonga");
  });

  it("5. Response has patch_class field", async () => {
    const res = await request(app)
      .post("/api/agent/synthesize")
      .send({ text: "ngiyabonga", patch_class: "female_melodic" });
    expect(res.status).toBe(200);
    expect(res.body.patch_class).toBe("female_melodic");
  });

  it("6. IPA transcription: 'amapiano' contains 'a' vowels", async () => {
    const res = await request(app)
      .post("/api/agent/synthesize")
      .send({ text: "amapiano" });
    expect(res.status).toBe(200);
    // 'a' maps to 'a' — vowels preserved
    expect(res.body.ipa_transcription).toContain("a");
  });

  it("7. Click consonant 'c' → contains ǀ in IPA", async () => {
    const res = await request(app)
      .post("/api/agent/synthesize")
      .send({ text: "cela" });
    expect(res.status).toBe(200);
    // 'c' (dental click) → 'ǀ'
    expect(res.body.ipa_transcription).toContain("ǀ");
  });

  it("8. Response has model_status: 'awaiting_training'", async () => {
    const res = await request(app)
      .post("/api/agent/synthesize")
      .send({ text: "ngiyabonga" });
    expect(res.status).toBe(200);
    expect(res.body.model_status).toBe("awaiting_training");
  });

});
