import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ─── Mock BullMQ + ioredis BEFORE any imports ────────────────────────────────

const mockQueueAdd = jest.fn().mockResolvedValue({ id: "queue-job-1" });

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation((name: string) => ({
    name,
    add: mockQueueAdd,
    getWaitingCount:    jest.fn().mockResolvedValue(0),
    getActiveCount:     jest.fn().mockResolvedValue(0),
    getFailedCount:     jest.fn().mockResolvedValue(0),
    getCompletedCount:  jest.fn().mockResolvedValue(0),
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

const mockEq       = jest.fn().mockResolvedValue({ data: {}, error: null });
const mockSingle   = jest.fn().mockResolvedValue({ data: { id: "gen-test-id-001" }, error: null });
const mockSelectForInsert = jest.fn().mockReturnValue({ single: mockSingle });
const mockInsert   = jest.fn().mockReturnValue({ select: mockSelectForInsert });
const mockUpdate   = jest.fn().mockReturnValue({ eq: mockEq });
const mockFrom     = jest.fn().mockReturnValue({ insert: mockInsert, update: mockUpdate });

jest.mock("../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// ─── Mock @aura-x/suno-exporter ──────────────────────────────────────────────

jest.mock("@aura-x/suno-exporter", () => ({
  exportForSuno: jest.fn().mockReturnValue({
    style_prompt: "Amapiano private school, deep house influenced, 112 BPM",
    lyrics_prompt: "[VERSE]\nTest lyrics\n[CHORUS]\nChorus here",
    warnings: [],
    style_prompt_length: 50,
    generation_mode: "mode_1_suno",
  }),
}));

// ─── Mock @aura-x/ac-ami ─────────────────────────────────────────────────────

jest.mock("@aura-x/ac-ami", () => ({
  conditionForMode2: jest.fn().mockReturnValue({
    input: {
      prompt: "Amapiano private school 112 BPM",
      duration: 30,
      temperature: 0.85,
      classifier_free_guidance: 3.5,
      model_version: "stereo_melody",
    },
    prompt: "Amapiano private school 112 BPM",
    duration: 30,
    notes: [],
  }),
}));

// ─── Mock @aura-x/replicate-client ───────────────────────────────────────────

const mockCreatePrediction = jest.fn().mockResolvedValue({
  id: "replicate-pred-abc123",
  status: "starting",
  input: {},
  output: null,
  error: null,
  created_at: "2026-04-10T00:00:00Z",
  completed_at: null,
  urls: { get: "https://api.replicate.com/v1/predictions/replicate-pred-abc123", cancel: "" },
});

jest.mock("@aura-x/replicate-client", () => ({
  createReplicateClient: jest.fn().mockReturnValue({
    createPrediction: mockCreatePrediction,
  }),
}));

// ─── Now import everything ────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import generateRouter from "../routes/generate";
import { privateSchoolPreset } from "@aura-x/ctl";
import { exportForSuno } from "@aura-x/suno-exporter";
import { conditionForMode2 } from "@aura-x/ac-ami";

// ─── Build mini express app ───────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use("/api/generate", generateRouter);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeBody(modeOverride: string) {
  return {
    track_id: "track-001",
    ctl_id: "ctl-001",
    mode_override: modeOverride,
    ctl: { ...privateSchoolPreset, global: { ...privateSchoolPreset.global, generation_mode: modeOverride } },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("Generation Agent", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply defaults after clearAllMocks
    mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdate });
    mockInsert.mockReturnValue({ select: mockSelectForInsert });
    mockSelectForInsert.mockReturnValue({ single: mockSingle });
    mockSingle.mockResolvedValue({ data: { id: "gen-test-id-001" }, error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockEq.mockResolvedValue({ data: {}, error: null });
    mockQueueAdd.mockResolvedValue({ id: "queue-job-1" });
    mockCreatePrediction.mockResolvedValue({
      id: "replicate-pred-abc123",
      status: "starting",
      input: {}, output: null, error: null,
      created_at: "2026-04-10T00:00:00Z", completed_at: null,
      urls: { get: "", cancel: "" },
    });
    (exportForSuno as jest.Mock).mockReturnValue({
      style_prompt: "Amapiano private school, deep house influenced, 112 BPM",
      lyrics_prompt: "[VERSE]\nTest lyrics",
      warnings: [],
      style_prompt_length: 50,
      generation_mode: "mode_1_suno",
    });
    (conditionForMode2 as jest.Mock).mockReturnValue({
      input: { prompt: "Amapiano 112 BPM", duration: 30, temperature: 0.85 },
      prompt: "Amapiano 112 BPM",
      duration: 30,
      notes: [],
    });
  });

  // ─── Mode 1 ────────────────────────────────────────────────────────────────

  it("1. POST /api/generate with mode_1_suno → 200", async () => {
    const res = await request(app).post("/api/generate").send(makeBody("mode_1_suno"));
    expect(res.status).toBe(200);
  });

  it("2. Response contains suno_bundle with style_prompt", async () => {
    const res = await request(app).post("/api/generate").send(makeBody("mode_1_suno"));
    expect(res.body.suno_bundle).toBeDefined();
    expect(res.body.suno_bundle.style_prompt).toBeDefined();
    expect(res.body.suno_bundle.style_prompt.length).toBeGreaterThan(0);
  });

  it("3. Response generation_id is a non-empty string", async () => {
    const res = await request(app).post("/api/generate").send(makeBody("mode_1_suno"));
    expect(typeof res.body.generation_id).toBe("string");
    expect(res.body.generation_id.length).toBeGreaterThan(0);
  });

  it("4. Response status is 'complete' for Mode 1", async () => {
    const res = await request(app).post("/api/generate").send(makeBody("mode_1_suno"));
    expect(res.body.status).toBe("complete");
  });

  it("5. Supabase generations.insert called once", async () => {
    await request(app).post("/api/generate").send(makeBody("mode_1_suno"));
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ track_id: "track-001", mode: "mode_1_suno" })
    );
  });

  it("6. Supabase generations.update called with status 'complete'", async () => {
    await request(app).post("/api/generate").send(makeBody("mode_1_suno"));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "complete" })
    );
  });

  // ─── Mode 2 ────────────────────────────────────────────────────────────────

  it("7. POST /api/generate with mode_2_musicgen → 200", async () => {
    const res = await request(app).post("/api/generate").send(makeBody("mode_2_musicgen"));
    expect(res.status).toBe(200);
  });

  it("8. Response status is 'queued' for Mode 2", async () => {
    const res = await request(app).post("/api/generate").send(makeBody("mode_2_musicgen"));
    expect(res.body.status).toBe("queued");
  });

  it("9. Response contains replicate_prediction_id for Mode 2", async () => {
    const res = await request(app).post("/api/generate").send(makeBody("mode_2_musicgen"));
    expect(res.body.replicate_prediction_id).toBe("replicate-pred-abc123");
  });

  it("10. conditionForMode2 was called with the CTL for Mode 2", async () => {
    await request(app).post("/api/generate").send(makeBody("mode_2_musicgen"));
    expect(conditionForMode2).toHaveBeenCalledTimes(1);
  });

  // ─── Mode 2 quality gates (Gate 1 — BPM validation) ──────────────────────

  it("13. Mode 2 with BPM 130 → 422 with status: incompatible", async () => {
    const body = makeBody("mode_2_musicgen");
    body.ctl.global.bpm = 130;
    const res = await request(app).post("/api/generate").send(body);
    expect(res.status).toBe(422);
    expect(res.body.status).toBe("incompatible");
  });

  it("14. Mode 2 with BPM 130 → Replicate NOT called", async () => {
    const body = makeBody("mode_2_musicgen");
    body.ctl.global.bpm = 130;
    await request(app).post("/api/generate").send(body);
    expect(mockCreatePrediction).not.toHaveBeenCalled();
  });

  it("15. Mode 2 with BPM 112 → Replicate IS called (valid Amapiano BPM)", async () => {
    const body = makeBody("mode_2_musicgen");
    body.ctl.global.bpm = 112;
    const res = await request(app).post("/api/generate").send(body);
    expect(res.body.status).toBe("queued");
    expect(mockCreatePrediction).toHaveBeenCalledTimes(1);
  });

  it("16. Mode 2 with BPM 117 → incompatible (just above Amapiano max 116)", async () => {
    const body = makeBody("mode_2_musicgen");
    body.ctl.global.bpm = 117;
    const res = await request(app).post("/api/generate").send(body);
    expect(res.status).toBe(422);
    expect(res.body.status).toBe("incompatible");
    expect(mockCreatePrediction).not.toHaveBeenCalled();
  });

  it("17. Mode 2 incompatible BPM → supabase update called with error_message containing BPM", async () => {
    const body = makeBody("mode_2_musicgen");
    body.ctl.global.bpm = 130;
    await request(app).post("/api/generate").send(body);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error_message: expect.stringContaining("130") })
    );
  });

  // ─── Mode 3 ────────────────────────────────────────────────────────────────

  it("11. POST /api/generate with mode_3_suno_api → 500", async () => {
    const res = await request(app).post("/api/generate").send(makeBody("mode_3_suno_api"));
    expect(res.status).toBe(500);
  });

  it("12. Response message mentions 'reserved' or 'official API'", async () => {
    const res = await request(app).post("/api/generate").send(makeBody("mode_3_suno_api"));
    const text = JSON.stringify(res.body).toLowerCase();
    expect(text.match(/reserved|official api/)).toBeTruthy();
  });

});
