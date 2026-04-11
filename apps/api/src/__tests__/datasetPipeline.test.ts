import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ─── Mock @aura-x/suno-exporter ──────────────────────────────────────────────

jest.mock("@aura-x/suno-exporter", () => ({
  exportForSuno: jest.fn().mockReturnValue({
    style_prompt:  "Amapiano private_school 112 BPM F#m",
    lyrics_prompt: "[VERSE]\nTest lyrics",
    warnings:      [],
  }),
}));

// ─── Mock @aura-x/ctl (CTLv1Schema) ──────────────────────────────────────────

jest.mock("@aura-x/ctl", () => ({
  CTLv1Schema: {
    safeParse: jest.fn().mockReturnValue({ success: false }),
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

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockSingle  = jest.fn();
const mockLimit   = jest.fn();
const mockOrder   = jest.fn();
const mockGte     = jest.fn();
const mockEq      = jest.fn();
const mockSelect  = jest.fn();
const mockInsert  = jest.fn();
const mockUpdate  = jest.fn();
const mockFrom    = jest.fn();
const mockStorage = {
  from: jest.fn().mockReturnValue({
    createSignedUrl: jest.fn().mockResolvedValue({ data: { signedUrl: "https://signed.url/audio.wav" } }),
  }),
};

jest.mock("../lib/supabase", () => ({
  supabase: {
    from:    (...args: unknown[]) => mockFrom(...args),
    storage: mockStorage,
  },
}));

import { exportDataset, writeDatasetRecord, getDatasetStats } from "../agent/datasetPipeline";
import express from "express";
import request from "supertest";

// ─── Express app setup (for stats endpoint test) ──────────────────────────────

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

jest.mock("../temporal/client", () => ({
  getTemporalClient: jest.fn().mockResolvedValue({
    workflow: { start: jest.fn(), getHandle: jest.fn() },
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
  storeResult: jest.fn().mockResolvedValue("r-001"),
  queryResults: jest.fn().mockResolvedValue([]),
}));

jest.mock("../generation/generationAgent", () => ({
  runGeneration: jest.fn().mockResolvedValue({ generation_id: "g-001" }),
}));

import agentRouter from "../routes/agent";

const app = express();
app.use(express.json());
app.use("/api/agent", agentRouter);

// ─────────────────────────────────────────────────────────────────────────────

describe("exportDataset", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: empty dataset_records
    mockLimit.mockResolvedValue({ data: [], error: null });
    mockOrder.mockReturnValue({ limit: mockLimit });
    mockGte.mockReturnValue({ order: mockOrder, eq: mockEq });
    mockEq.mockReturnValue({ order: mockOrder, eq: mockEq, limit: mockLimit });
    mockSelect.mockReturnValue({ gte: mockGte, eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect, insert: mockInsert, update: mockUpdate });
  });

  it("1. Returns DatasetExport shape with required fields", async () => {
    const result = await exportDataset();
    expect(result).toHaveProperty("version");
    expect(result).toHaveProperty("exported_at");
    expect(result).toHaveProperty("record_count");
    expect(result).toHaveProperty("subgenre_distribution");
    expect(result).toHaveProperty("source_distribution");
    expect(result).toHaveProperty("split_distribution");
    expect(result).toHaveProperty("mean_composite_score");
    expect(result).toHaveProperty("records");
    expect(Array.isArray(result.records)).toBe(true);
  });

  it("2. record_count is 0 when no records in DB", async () => {
    const result = await exportDataset();
    expect(result.record_count).toBe(0);
    expect(result.records).toHaveLength(0);
  });

  it("3. Returns version: '1.0'", async () => {
    const result = await exportDataset();
    expect(result.version).toBe("1.0");
  });

  it("4. exported_at is a valid ISO string", async () => {
    const result = await exportDataset();
    expect(() => new Date(result.exported_at)).not.toThrow();
    expect(new Date(result.exported_at).toISOString()).toBe(result.exported_at);
  });

});

describe("writeDatasetRecord", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockSingle.mockResolvedValue({ data: { id: "ds-record-001" }, error: null });
    mockSelect.mockReturnValue({ single: mockSingle });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockFrom.mockReturnValue({ insert: mockInsert });
  });

  it("5. Inserts to dataset_records table", async () => {
    await writeDatasetRecord({
      track_id: "track-001",
      bpm: 112,
      key: "F#m",
      subgenre: "private_school",
      authenticity_score: 0.85,
      composite_score: 0.82,
      source: "human",
    });
    expect(mockFrom).toHaveBeenCalledWith("dataset_records");
    expect(mockInsert).toHaveBeenCalled();
  });

  it("6. Returns a string ID", async () => {
    const id = await writeDatasetRecord({
      track_id: "track-001",
      bpm: 112,
      key: "F#m",
      subgenre: "private_school",
      authenticity_score: 0.85,
      composite_score: 0.82,
      source: "human",
    });
    expect(typeof id).toBe("string");
    expect(id).toBe("ds-record-001");
  });

  it("7. Auto-assigns split (train/val/test)", async () => {
    await writeDatasetRecord({
      track_id: "track-001",
      bpm: 112,
      key: "F#m",
      subgenre: "private_school",
      authenticity_score: 0.85,
      composite_score: 0.82,
      source: "human",
    });
    const insertCall = mockInsert.mock.calls[0][0];
    expect(["train", "val", "test"]).toContain(insertCall.split);
  });

  it("8. Throws on Supabase error", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "DB error" } });
    await expect(
      writeDatasetRecord({
        track_id: "track-001",
        bpm: 112,
        key: "F#m",
        subgenre: "private_school",
        authenticity_score: 0.85,
        composite_score: 0.82,
        source: "human",
      })
    ).rejects.toThrow("writeDatasetRecord");
  });

});

describe("getDatasetStats", () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("9. Returns total: 0 when table is empty", async () => {
    mockSelect.mockReturnValue({ data: [], error: null });
    mockFrom.mockReturnValue({ select: mockSelect });
    const stats = await getDatasetStats();
    expect(stats.total).toBe(0);
  });

  it("10. ready_for_training is false when total < 100", async () => {
    const fakeRows = Array.from({ length: 50 }, () => ({
      subgenre: "private_school",
      source: "human",
      split: "train",
      composite_score: 0.75,
    }));
    mockSelect.mockReturnValue({ data: fakeRows, error: null });
    mockFrom.mockReturnValue({ select: mockSelect });
    const stats = await getDatasetStats();
    expect(stats.ready_for_training).toBe(false);
  });

  it("11. training_threshold is 100", async () => {
    mockSelect.mockReturnValue({ data: [], error: null });
    mockFrom.mockReturnValue({ select: mockSelect });
    const stats = await getDatasetStats();
    expect(stats.training_threshold).toBe(100);
  });

});

describe("GET /api/agent/dataset/stats", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockSelect.mockReturnValue({ data: [], error: null });
    mockFrom.mockReturnValue({ select: mockSelect, insert: mockInsert, update: mockUpdate });
  });

  it("12. Returns 200 with total, ready_for_training, training_threshold", async () => {
    const res = await request(app).get("/api/agent/dataset/stats");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("ready_for_training");
    expect(res.body).toHaveProperty("training_threshold");
    expect(res.body.training_threshold).toBe(100);
  });

});
