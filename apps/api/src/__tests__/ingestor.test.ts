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

const mockOrder    = jest.fn();
const mockEq       = jest.fn();
const mockSingle   = jest.fn();
const mockSelectFn = jest.fn();
const mockFrom     = jest.fn();

jest.mock("../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// ─── Import app ───────────────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import generateRouter from "../routes/generate";
import { getGenerationStatus, getGenerationsByTrack } from "../generation/generationStatus";

const app = express();
app.use(express.json());
app.use("/api/generate", generateRouter);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeGen(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "gen-001",
    track_id: "track-001",
    mode: "mode_1_suno",
    status: "complete",
    prompt_style: "Amapiano private school",
    prompt_lyrics: "[VERSE]\nTest",
    replicate_id: null,
    error_message: null,
    created_at: "2026-04-10T00:00:00Z",
    completed_at: "2026-04-10T00:01:00Z",
    ...overrides,
  };
}

function makeAudioFile() {
  return { id: "file-001", file_type: "raw_generation", storage_path: "track-001/raw/file-001.wav", format: "wav" };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("Ingestor", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset chain defaults
    mockOrder.mockResolvedValue({ data: [], error: null });
    mockEq.mockReturnValue({ single: mockSingle, order: mockOrder });
    mockSingle.mockResolvedValue({ data: null, error: { message: "Not found" } });
    mockSelectFn.mockReturnValue({ eq: mockEq, order: mockOrder });
    mockFrom.mockReturnValue({ select: mockSelectFn });
  });

  // ─── getGenerationStatus ───────────────────────────────────────────────────

  it("1. getGenerationStatus returns null when generation not found", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "Not found" } });
    const result = await getGenerationStatus("nonexistent-id");
    expect(result).toBeNull();
  });

  it("2. getGenerationStatus returns generation object with correct fields when found", async () => {
    const gen = makeGen();
    mockSingle.mockResolvedValue({ data: gen, error: null });
    // For the non-complete status path (no audio_files query), use pending status
    const pendingGen = makeGen({ status: "pending" });
    mockSingle.mockResolvedValue({ data: pendingGen, error: null });
    const result = await getGenerationStatus("gen-001");
    expect(result).not.toBeNull();
    expect(result!.generation_id).toBe("gen-001");
    expect(result!.track_id).toBe("track-001");
    expect(result!.mode).toBe("mode_1_suno");
    expect(result!.status).toBe("pending");
  });

  it("3. getGenerationStatus includes audio_files when status is 'complete'", async () => {
    const gen = makeGen({ status: "complete" });
    mockSingle.mockResolvedValue({ data: gen, error: null });
    // Second .from() call for audio_files
    mockFrom
      .mockReturnValueOnce({ select: mockSelectFn })   // generations query
      .mockReturnValueOnce({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ data: [makeAudioFile()], error: null }) }) });
    const result = await getGenerationStatus("gen-001");
    expect(result!.audio_files).toBeDefined();
    expect(Array.isArray(result!.audio_files)).toBe(true);
  });

  it("4. getGenerationStatus audio_files is empty array when status is 'pending'", async () => {
    mockSingle.mockResolvedValue({ data: makeGen({ status: "pending" }), error: null });
    const result = await getGenerationStatus("gen-001");
    expect(result!.audio_files).toEqual([]);
  });

  // ─── getGenerationsByTrack ─────────────────────────────────────────────────

  it("5. getGenerationsByTrack returns empty array when no generations found", async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });
    const result = await getGenerationsByTrack("track-with-no-gens");
    expect(result).toEqual([]);
  });

  it("6. getGenerationsByTrack returns array ordered by created_at desc", async () => {
    const gens = [makeGen({ id: "gen-002", created_at: "2026-04-10T02:00:00Z" }), makeGen({ id: "gen-001", created_at: "2026-04-10T01:00:00Z" })];
    mockOrder.mockResolvedValue({ data: gens, error: null });
    const result = await getGenerationsByTrack("track-001");
    expect(result).toHaveLength(2);
    // First item should be the more recent one
    expect(result[0].generation_id).toBe("gen-002");
  });

  it("7. Each item from getGenerationsByTrack has generation_id, track_id, mode, status", async () => {
    mockOrder.mockResolvedValue({ data: [makeGen()], error: null });
    const result = await getGenerationsByTrack("track-001");
    expect(result[0].generation_id).toBeDefined();
    expect(result[0].track_id).toBeDefined();
    expect(result[0].mode).toBeDefined();
    expect(result[0].status).toBeDefined();
  });

  // ─── Route ────────────────────────────────────────────────────────────────

  it("8. GET /api/generate/track/:trackId → 200 with { track_id, generations, count }", async () => {
    mockOrder.mockResolvedValue({ data: [makeGen(), makeGen({ id: "gen-002" })], error: null });
    const res = await request(app).get("/api/generate/track/track-001");
    expect(res.status).toBe(200);
    expect(res.body.track_id).toBe("track-001");
    expect(Array.isArray(res.body.generations)).toBe(true);
    expect(typeof res.body.count).toBe("number");
  });

});
