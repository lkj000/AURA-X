import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ─── Mock BullMQ and ioredis BEFORE any queue imports ────────────────────────
const mockJobId = "mock-job-001";

const mockAdd = jest.fn().mockResolvedValue({
  id: mockJobId,
  name: "audio.analyze",
  data: {},
});

const mockGetWaitingCount  = jest.fn().mockResolvedValue(2);
const mockGetActiveCount   = jest.fn().mockResolvedValue(1);
const mockGetFailedCount   = jest.fn().mockResolvedValue(0);
const mockGetCompletedCount = jest.fn().mockResolvedValue(10);
const mockDrain            = jest.fn().mockResolvedValue(undefined);

const queueInstances: Record<string, unknown> = {};

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation((name: string) => {
    const inst = {
      name,
      add: mockAdd,
      getWaitingCount:   mockGetWaitingCount,
      getActiveCount:    mockGetActiveCount,
      getFailedCount:    mockGetFailedCount,
      getCompletedCount: mockGetCompletedCount,
      drain:             mockDrain,
    };
    queueInstances[name] = inst;
    return inst;
  }),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn(),
  })),
}));

jest.mock("ioredis", () =>
  jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue("OK"),
    status: "ready",
  }))
);

// ─── Now safe to import queue module ─────────────────────────────────────────
import {
  audioQueue,
  generationQueue,
  enqueueAudioAnalysis,
  enqueueMode2Generation,
} from "../queue";
import express from "express";
import request from "supertest";
import queueRouter from "../routes/queue";

// ─── Test app for HTTP tests ──────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/api/queue", queueRouter);

afterEach(() => jest.clearAllMocks());

describe("BullMQ Queue", () => {
  it("1. audioQueue is instantiated with name 'audio-processing'", () => {
    expect(audioQueue).toBeDefined();
    expect((audioQueue as unknown as { name: string }).name).toBe("audio-processing");
  });

  it("2. generationQueue is instantiated with name 'generation'", () => {
    expect(generationQueue).toBeDefined();
    expect((generationQueue as unknown as { name: string }).name).toBe("generation");
  });

  it("3. enqueueAudioAnalysis() returns a job with an id", async () => {
    const job = await enqueueAudioAnalysis({
      audio_file_id: "af-111",
      track_id: "tr-222",
      storage_path: "aura-x-audio/raw/test.wav",
      format: "wav",
    });
    expect(job.id).toBe(mockJobId);
  });

  it("4. enqueued audio job has name 'audio.analyze'", async () => {
    await enqueueAudioAnalysis({
      audio_file_id: "af-111",
      track_id: "tr-222",
      storage_path: "aura-x-audio/raw/test.wav",
      format: "wav",
    });
    expect(mockAdd).toHaveBeenCalledWith(
      "audio.analyze",
      expect.objectContaining({ type: "audio.analyze", audio_file_id: "af-111" }),
      expect.objectContaining({ attempts: 3 })
    );
  });

  it("5. enqueued audio job data has correct type field", async () => {
    await enqueueAudioAnalysis({
      audio_file_id: "af-333",
      track_id: "tr-444",
      storage_path: "aura-x-audio/raw/test2.wav",
      format: "wav",
    });
    const callArgs = mockAdd.mock.calls[0];
    expect(callArgs[1]).toMatchObject({ type: "audio.analyze" });
  });

  it("6. enqueueMode2Generation() adds a job to the generation queue", async () => {
    const job = await enqueueMode2Generation({
      track_id: "tr-001",
      ctl_id: "ctl-002",
      generation_id: "gen-003",
    });
    expect(job.id).toBe(mockJobId);
    expect(mockAdd).toHaveBeenCalledWith(
      "generation.mode2",
      expect.objectContaining({ type: "generation.mode2", generation_id: "gen-003" }),
      expect.objectContaining({ attempts: 3 })
    );
  });

  it("7. GET /api/queue/status → 200 with both queue names", async () => {
    const res = await request(app).get("/api/queue/status");
    expect(res.status).toBe(200);
    expect(res.body.queues).toHaveProperty("audio-processing");
    expect(res.body.queues).toHaveProperty("generation");
    expect(res.body.timestamp).toBeDefined();
  });

  it("8. GET /api/queue/status → waiting count ≥ 1 after enqueue", async () => {
    // mockGetWaitingCount is set to return 2 (simulating 1 job enqueued above)
    const res = await request(app).get("/api/queue/status");
    expect(res.status).toBe(200);
    expect(res.body.queues["audio-processing"].waiting).toBeGreaterThanOrEqual(1);
  });
});
