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

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockInsert  = jest.fn();
const mockFrom    = jest.fn();

let mockTrainCount = 50; // default: enough data

jest.mock("../lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// ─── Mock dependencies pulled in via routes ───────────────────────────────────

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
import { triggerFinetune } from "../agent/finetuneRunner";

// ─── Auth for the guarded agent routes ───────────────────────────────────────
//
// /run, /finetune, /revise, /tune and /ingest now require a session. The router was previously mounted
// with no authentication at all, and /run took `created_by` from the REQUEST BODY — so an anonymous
// caller could start real workflow runs and attribute them to any name they typed. These suites test
// route MECHANICS, so they present a valid token; that the routes refuse without one is asserted in
// agentAuthorization.test.ts.
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-aura-x-agent";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AGENT_TEST_TOKEN = (require("jsonwebtoken") as typeof import("jsonwebtoken")).sign(
  { artist_id: "artist-test-agent", email: "agent@test.local" },
  process.env.JWT_SECRET,
  { expiresIn: "1h" },
);

const app = express();
app.use(express.json());
app.use("/api/agent", agentRouter);

// ─── Mock factory ─────────────────────────────────────────────────────────────

function setupMocks(trainCount: number) {
  mockTrainCount = trainCount;

  // count query chain: from → select → eq → gte → resolves { count }
  const mockGte    = jest.fn().mockResolvedValue({ count: trainCount, error: null });
  const mockEq     = jest.fn().mockReturnValue({ gte: mockGte });
  const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
  const mockInsertInner = jest.fn().mockResolvedValue({ data: null, error: null });

  mockFrom.mockImplementation((table: string) => {
    if (table === "dataset_records") return { select: mockSelect };
    return { insert: mockInsertInner };
  });
  mockInsert.mockReturnValue({ data: null, error: null });
}

// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/agent/finetune", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks(50);
  });

  it("1. identity comes from the session, so an absent triggered_by is not an error", async () => {
    // WAS "Missing triggered_by → 400", which required the CALLER to supply their own identity in the
    // request body — on a route that was mounted with no authentication at all and starts model
    // training. A missing field was rejected; a fabricated one was accepted.
    //
    // `triggered_by` now comes from the verified token, so its absence from the body is unremarkable.
    const res = await request(app)
      .post("/api/agent/finetune")
      .set("Authorization", `Bearer ${AGENT_TEST_TOKEN}`)
      .send({ subgenre: "private_school" });
    expect(res.status).toBe(202);
  });

  it("1b. a triggered_by supplied in the body does not override the session", async () => {
    // The whole point: the field is still accepted so the existing client keeps working, and ignored
    // so it cannot be used to attribute a training run to somebody else.
    const res = await request(app)
      .post("/api/agent/finetune")
      .set("Authorization", `Bearer ${AGENT_TEST_TOKEN}`)
      .send({ subgenre: "private_school", triggered_by: "somebody-else-entirely" });
    expect(res.status).toBe(202);
    expect(JSON.stringify(res.body)).not.toContain("somebody-else-entirely");
  });

  it("2. Insufficient data (< 10 records) → 422", async () => {
    setupMocks(3);
    const res = await request(app)
      .post("/api/agent/finetune")
      .set("Authorization", `Bearer ${AGENT_TEST_TOKEN}`)
      .send({ triggered_by: "test_user" });
    expect(res.status).toBe(422);
    expect(res.body.status).toBe("rejected");
  });

  it("3. Sufficient data → 202", async () => {
    const res = await request(app)
      .post("/api/agent/finetune")
      .set("Authorization", `Bearer ${AGENT_TEST_TOKEN}`)
      .send({ triggered_by: "test_user" });
    expect(res.status).toBe(202);
  });

  it("4. Response has run_id field", async () => {
    const res = await request(app)
      .post("/api/agent/finetune")
      .set("Authorization", `Bearer ${AGENT_TEST_TOKEN}`)
      .send({ triggered_by: "test_user" });
    expect(res.status).toBe(202);
    expect(res.body.run_id).toBeDefined();
    expect(typeof res.body.run_id).toBe("string");
  });

  it("5. Response has status field", async () => {
    const res = await request(app)
      .post("/api/agent/finetune")
      .set("Authorization", `Bearer ${AGENT_TEST_TOKEN}`)
      .send({ triggered_by: "test_user" });
    expect(res.status).toBe(202);
    expect(res.body.status).toBeDefined();
  });

  it("6. Response has message string", async () => {
    const res = await request(app)
      .post("/api/agent/finetune")
      .set("Authorization", `Bearer ${AGENT_TEST_TOKEN}`)
      .send({ triggered_by: "test_user" });
    expect(res.status).toBe(202);
    expect(typeof res.body.message).toBe("string");
    expect(res.body.message.length).toBeGreaterThan(0);
  });

  it("7. run_id contains 'finetune-'", async () => {
    const res = await request(app)
      .post("/api/agent/finetune")
      .set("Authorization", `Bearer ${AGENT_TEST_TOKEN}`)
      .send({ triggered_by: "test_user" });
    expect(res.status).toBe(202);
    expect(res.body.run_id).toContain("finetune-");
  });

  it("8. run_id contains subgenre when provided", async () => {
    const res = await request(app)
      .post("/api/agent/finetune")
      .set("Authorization", `Bearer ${AGENT_TEST_TOKEN}`)
      .send({ triggered_by: "test_user", subgenre: "sgija" });
    expect(res.status).toBe(202);
    expect(res.body.run_id).toContain("sgija");
  });

});

describe("triggerFinetune (unit)", () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("9. Returns rejected when trainCount < 10", async () => {
    setupMocks(5);
    const result = await triggerFinetune({ triggered_by: "test" });
    expect(result.status).toBe("rejected");
    expect(result.message).toContain("5 records");
  });

  it("10. Returns queued when trainCount >= 10", async () => {
    setupMocks(100);
    const result = await triggerFinetune({
      triggered_by:   "test",
      subgenre:       "private_school",
      training_steps: 500,
    });
    expect(result.status).toBe("queued");
    expect(result.run_id).toContain("finetune-");
  });

});
