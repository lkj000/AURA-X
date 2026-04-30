import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ─── Mocks BEFORE any imports ─────────────────────────────────────────────────

const mockQueueAdd = jest.fn().mockResolvedValue({ id: "job-1" });

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation((name: string) => ({
    name,
    add: mockQueueAdd,
    getWaitingCount:   jest.fn().mockResolvedValue(0),
    getActiveCount:    jest.fn().mockResolvedValue(0),
    getFailedCount:    jest.fn().mockResolvedValue(0),
    getCompletedCount: jest.fn().mockResolvedValue(0),
  })),
  Worker: jest.fn().mockImplementation((_name: string, processor: unknown) => ({
    processor,   // expose so we can call it directly
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

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockStorageUpload = jest.fn().mockResolvedValue({ data: { path: "test/path.wav" }, error: null });
const mockStorageFrom   = jest.fn().mockReturnValue({ upload: mockStorageUpload });
const mockEq            = jest.fn().mockResolvedValue({ data: {}, error: null });
const mockInsert        = jest.fn().mockResolvedValue({ data: {}, error: null });
const mockUpdate        = jest.fn().mockReturnValue({ eq: mockEq });
const mockFrom          = jest.fn().mockReturnValue({ insert: mockInsert, update: mockUpdate });

jest.mock("../lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: { from: (...args: unknown[]) => mockStorageFrom(...args) },
  },
}));

// ─── Replicate client mock ────────────────────────────────────────────────────

const mockGetPrediction = jest.fn();

jest.mock("@aura-x/replicate-client", () => ({
  createReplicateClient: jest.fn().mockReturnValue({
    getPrediction: mockGetPrediction,
  }),
}));

// ─── axios mock ──────────────────────────────────────────────────────────────

// Default post response: bpm=110, energy=0.75, onset=4.0
// contrastScore = 0.50*1.0 + 0.30*0.75 + 0.20*1.0 = 0.925 → passes Gate 2
jest.mock("axios", () => ({
  get: jest.fn().mockResolvedValue({
    data: Buffer.from("fake-audio-data"),
  }),
  post: jest.fn().mockResolvedValue({
    data: { bpm: 110, energy_mean: 0.75, onset_density: 4.0 },
  }),
  default: { get: jest.fn() },
  isAxiosError: jest.fn().mockReturnValue(false),
}));

// ─── uuid mock ───────────────────────────────────────────────────────────────

jest.mock("uuid", () => ({ v4: jest.fn().mockReturnValue("mock-uuid-file-id") }));

// ─── queue/index mock — provide truthy connection so workers.ts doesn't bail ──

jest.mock("../queue/index", () => ({
  connection: { status: "ready" },
  enqueueAudioAnalysis: jest.fn().mockResolvedValue({ id: "job-1" }),
  enqueueMode2Generation: jest.fn().mockResolvedValue({ id: "job-1" }),
  enqueueAudioStems: jest.fn().mockResolvedValue({ id: "job-1" }),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { Worker } from "bullmq";
import axios from "axios";

// ─── Extract processor from the mocked generationWorker ─────────────────────
// Workers.ts constructs Worker(name, processor, opts) — we capture processor via mock

let workerProcessor: (job: { data: Record<string, unknown> }) => Promise<unknown>;

// Import workers.ts which instantiates the Worker mock, capturing the processor
const { Worker: MockWorker } = jest.requireMock("bullmq");

// We need to import workers after mocks are set up to capture the processor
import("../queue/workers").then(() => {
  // The generationWorker is the second Worker instantiation (after audioWorker)
  const calls = (MockWorker as jest.Mock).mock.calls;
  const genCall = calls.find((c: unknown[]) => c[0] === "generation");
  if (genCall) workerProcessor = genCall[1];
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data: {
      type: "generation.mode2",
      generation_id: "gen-001",
      track_id: "track-001",
      prediction_id: "pred-abc",
      ...overrides,
    },
  };
}

function makePrediction(status: string, output?: string[] | null, error?: string | null) {
  return {
    id: "pred-abc",
    status,
    input: {},
    output: output ?? null,
    error: error ?? null,
    created_at: "2026-04-10T00:00:00Z",
    completed_at: status === "succeeded" ? "2026-04-10T00:01:00Z" : null,
    urls: { get: "", cancel: "" },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("Generation Worker", () => {

  beforeAll(async () => {
    // Ensure workers.ts is imported and processor captured
    await import("../queue/workers");
    const calls = (MockWorker as jest.Mock).mock.calls;
    const genCall = calls.find((c: unknown[]) => c[0] === "generation");
    if (genCall) workerProcessor = genCall[1];
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply mock defaults after clearAllMocks
    mockGetPrediction.mockResolvedValue(makePrediction("succeeded", ["https://r2.example.com/audio.wav"]));
    mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdate });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockEq.mockResolvedValue({ data: {}, error: null });
    mockInsert.mockResolvedValue({ data: {}, error: null });
    mockStorageFrom.mockReturnValue({ upload: mockStorageUpload });
    mockStorageUpload.mockResolvedValue({ data: { path: "test/path.wav" }, error: null });
    (axios.get as jest.Mock).mockResolvedValue({ data: Buffer.from("fake-audio-data") });
    // Default: passing quality gate (contrastScore ≈ 0.925)
    (axios.post as jest.Mock).mockResolvedValue({
      data: { bpm: 110, energy_mean: 0.75, onset_density: 4.0 },
    });
    mockQueueAdd.mockResolvedValue({ id: "job-1" });
  });

  // ─── Status polling ────────────────────────────────────────────────────────

  it("1. Prediction status 'processing' → throws (triggers BullMQ retry)", async () => {
    mockGetPrediction.mockResolvedValue(makePrediction("processing"));
    await expect(workerProcessor(makeJob())).rejects.toThrow("will retry");
  });

  it("2. Prediction status 'starting' → throws (triggers BullMQ retry)", async () => {
    mockGetPrediction.mockResolvedValue(makePrediction("starting"));
    await expect(workerProcessor(makeJob())).rejects.toThrow("will retry");
  });

  it("3. Prediction status 'failed' → updates generation to 'failed', returns { status: 'failed' }", async () => {
    mockGetPrediction.mockResolvedValue(makePrediction("failed", null, "Model crashed"));
    const result = await workerProcessor(makeJob()) as Record<string, unknown>;
    expect(result.status).toBe("failed");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" })
    );
  });

  it("4. Prediction status 'canceled' → updates generation to 'failed'", async () => {
    mockGetPrediction.mockResolvedValue(makePrediction("canceled"));
    const result = await workerProcessor(makeJob()) as Record<string, unknown>;
    expect(result.status).toBe("failed");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" })
    );
  });

  // ─── Happy path ────────────────────────────────────────────────────────────

  it("5. Prediction succeeded → axios.get called with the audio URL", async () => {
    mockGetPrediction.mockResolvedValue(
      makePrediction("succeeded", ["https://r2.example.com/generation.wav"])
    );
    await workerProcessor(makeJob());
    expect(axios.get).toHaveBeenCalledWith(
      "https://r2.example.com/generation.wav",
      expect.objectContaining({ responseType: "arraybuffer" })
    );
  });

  it("6. Audio downloaded → supabase.storage.upload called with bucket 'aura-x-audio'", async () => {
    await workerProcessor(makeJob());
    expect(mockStorageFrom).toHaveBeenCalledWith("aura-x-audio");
    expect(mockStorageUpload).toHaveBeenCalled();
  });

  it("7. audio_files.insert called with correct track_id", async () => {
    await workerProcessor(makeJob());
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ track_id: "track-001" })
    );
  });

  it("8. audio_files.insert called with file_type 'raw_generation'", async () => {
    await workerProcessor(makeJob());
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ file_type: "raw_generation" })
    );
  });

  it("9. generations.update called with status 'complete'", async () => {
    await workerProcessor(makeJob());
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "complete" })
    );
  });

  it("10. enqueueAudioAnalysis called with correct audio_file_id", async () => {
    const { enqueueAudioAnalysis } = jest.requireMock("../queue/index");
    await workerProcessor(makeJob());
    expect(enqueueAudioAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ audio_file_id: "mock-uuid-file-id" })
    );
  });

  // ─── Quality gates (Gate 2: Contrast Score, Gate 3: Subgenre) ────────────

  it("11. Contrast score below threshold → status: degraded", async () => {
    // bpm=80: bpmScore=0, energy=0.2, onset=1 → score≈0.11 (below 0.6)
    (axios.post as jest.Mock).mockResolvedValue({
      data: { bpm: 80, energy_mean: 0.2, onset_density: 1.0 },
    });
    const result = await workerProcessor(makeJob()) as Record<string, unknown>;
    expect(result.status).toBe("degraded");
  });

  it("12. Contrast score below threshold → contrast_score field in result", async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: { bpm: 80, energy_mean: 0.2, onset_density: 1.0 },
    });
    const result = await workerProcessor(makeJob()) as Record<string, unknown>;
    expect(typeof result.contrast_score).toBe("number");
    expect(result.contrast_score as number).toBeLessThan(0.6);
  });

  it("13. Contrast score above threshold → status: complete (Gate 2 passes)", async () => {
    // Default mock: bpm=110, energy=0.75, onset=4 → score≈0.925
    const result = await workerProcessor(makeJob()) as Record<string, unknown>;
    expect(result.status).toBe("complete");
    expect(result.contrast_score as number).toBeGreaterThanOrEqual(0.6);
  });

  it("14. Audio analysis service throws → graceful fallback, status: complete", async () => {
    (axios.post as jest.Mock).mockRejectedValue(new Error("Audio service down"));
    const result = await workerProcessor(makeJob()) as Record<string, unknown>;
    expect(result.status).toBe("complete");
  });

  it("15. Detected BPM in Amapiano range → subgenre_match true", async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: { bpm: 112, energy_mean: 0.75, onset_density: 4.0 },
    });
    const result = await workerProcessor(makeJob()) as Record<string, unknown>;
    expect(result.subgenre_match).toBe(true);
  });

  it("16. Detected BPM outside Amapiano range → subgenre_match false", async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: { bpm: 130, energy_mean: 0.75, onset_density: 4.0 },
    });
    const result = await workerProcessor(makeJob()) as Record<string, unknown>;
    expect(result.subgenre_match).toBe(false);
  });

});
