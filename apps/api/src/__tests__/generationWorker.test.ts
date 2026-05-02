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
    processor,
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

// ─── @aura-x/engine mock ─────────────────────────────────────────────────────

const mockEvaluateBuffer  = jest.fn();
const mockRunQualityGates = jest.fn();

jest.mock("@aura-x/engine", () => ({
  evaluateBuffer:        (...args: unknown[]) => mockEvaluateBuffer(...args),
  runQualityGates:       (...args: unknown[]) => mockRunQualityGates(...args),
  createMetricsCollector: jest.fn(() => ({
    record: jest.fn(),
    snapshot: jest.fn(),
    reset: jest.fn(),
    size: 0,
  })),
}));

// ─── metricsCollector singleton mock ─────────────────────────────────────────

jest.mock("../lib/metricsCollector", () => ({
  metricsCollector: { record: jest.fn(), snapshot: jest.fn(), reset: jest.fn(), size: 0 },
}));

// ─── axios mock ──────────────────────────────────────────────────────────────

jest.mock("axios", () => ({
  get: jest.fn().mockResolvedValue({
    data: Buffer.from("fake-audio-data"),
  }),
  post: jest.fn().mockResolvedValue({ data: {} }),
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
  enqueueWebhook: jest.fn().mockResolvedValue({ id: "wh-1" }),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { Worker } from "bullmq";
import axios from "axios";

// ─── Extract processor from the mocked generationWorker ─────────────────────

let workerProcessor: (job: { data: Record<string, unknown> }) => Promise<unknown>;

const { Worker: MockWorker } = jest.requireMock("bullmq");

import("../queue/workers").then(() => {
  const calls = (MockWorker as jest.Mock).mock.calls;
  const genCall = calls.find((c: unknown[]) => c[0] === "generation");
  if (genCall) workerProcessor = genCall[1];
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function makePassingGateReport() {
  return {
    lane: "private_school",
    gates: [
      { name: "authenticity",  passes: true, score: 0.82, threshold: 0.60, weight: 0.30, reasons: ["ok"] },
      { name: "perception",    passes: true, score: 1.00, threshold: 1.00, weight: 0.25, reasons: ["ok"] },
      { name: "cultural",      passes: true, score: 0.72, threshold: 0.35, weight: 0.20, reasons: ["ok"] },
      { name: "quality",       passes: true, score: 0.65, threshold: 0.50, weight: 0.15, reasons: ["ok"] },
      { name: "stem_balance",  passes: true, score: 0.55, threshold: 0.40, weight: 0.10, reasons: ["ok"] },
    ],
    allPass: true,
    passCount: 5,
    overallScore: 0.83,
    grade: "A",
    readyForRelease: true,
    summary: "Grade A — private_school passes all gates, strong release candidate.",
  };
}

function makeFailingGateReport() {
  return {
    lane: "private_school",
    gates: [
      { name: "authenticity",  passes: false, score: 0.30, threshold: 0.60, weight: 0.30, reasons: ["Low authenticity"] },
      { name: "perception",    passes: false, score: 0.50, threshold: 1.00, weight: 0.25, reasons: ["O.211 violation"] },
      { name: "cultural",      passes: true,  score: 0.60, threshold: 0.35, weight: 0.20, reasons: ["ok"] },
      { name: "quality",       passes: false, score: 0.40, threshold: 0.50, weight: 0.15, reasons: ["Low producer score"] },
      { name: "stem_balance",  passes: true,  score: 0.45, threshold: 0.40, weight: 0.10, reasons: ["ok"] },
    ],
    allPass: false,
    passCount: 2,
    overallScore: 0.48,
    grade: "F",
    readyForRelease: false,
    summary: "Grade F — private_school fails 3 critical gate(s), not ready for release.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("Generation Worker", () => {

  beforeAll(async () => {
    await import("../queue/workers");
    const calls = (MockWorker as jest.Mock).mock.calls;
    const genCall = calls.find((c: unknown[]) => c[0] === "generation");
    if (genCall) workerProcessor = genCall[1];
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPrediction.mockResolvedValue(makePrediction("succeeded", ["https://r2.example.com/audio.wav"]));
    mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdate });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockEq.mockResolvedValue({ data: {}, error: null });
    mockInsert.mockResolvedValue({ data: {}, error: null });
    mockStorageFrom.mockReturnValue({ upload: mockStorageUpload });
    mockStorageUpload.mockResolvedValue({ data: { path: "test/path.wav" }, error: null });
    (axios.get as jest.Mock).mockResolvedValue({ data: Buffer.from("fake-audio-data") });
    mockQueueAdd.mockResolvedValue({ id: "job-1" });
    // Default: passing engine quality gate
    mockEvaluateBuffer.mockReturnValue({ features: {}, laneScores: {}, quality: {}, groove: {}, perception: {}, stems: {}, cultural: {}, issues: [] });
    mockRunQualityGates.mockReturnValue(makePassingGateReport());
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

  // ─── Engine quality gate ───────────────────────────────────────────────────

  it("11. evaluateBuffer called with the downloaded audio buffer", async () => {
    await workerProcessor(makeJob());
    expect(mockEvaluateBuffer).toHaveBeenCalledWith(
      expect.any(Buffer)
    );
  });

  it("12. runQualityGates called with the evaluation result", async () => {
    const fakeEval = { features: {}, laneScores: {}, quality: {}, groove: {}, perception: {}, stems: {}, cultural: {}, issues: [] };
    mockEvaluateBuffer.mockReturnValue(fakeEval);
    await workerProcessor(makeJob());
    expect(mockRunQualityGates).toHaveBeenCalledWith(fakeEval);
  });

  it("13. Gate passes (readyForRelease: true) → status 'complete'", async () => {
    mockRunQualityGates.mockReturnValue(makePassingGateReport());
    const result = await workerProcessor(makeJob()) as Record<string, unknown>;
    expect(result.status).toBe("complete");
  });

  it("14. Gate passes → result includes grade and overall_score", async () => {
    mockRunQualityGates.mockReturnValue(makePassingGateReport());
    const result = await workerProcessor(makeJob()) as Record<string, unknown>;
    expect(result.grade).toBe("A");
    expect(typeof result.overall_score).toBe("number");
  });

  it("15. Gate fails (readyForRelease: false) → status 'gate_failed'", async () => {
    mockRunQualityGates.mockReturnValue(makeFailingGateReport());
    const result = await workerProcessor(makeJob()) as Record<string, unknown>;
    expect(result.status).toBe("gate_failed");
  });

  it("16. Gate fails → result includes grade, overall_score, failing_gates", async () => {
    mockRunQualityGates.mockReturnValue(makeFailingGateReport());
    const result = await workerProcessor(makeJob()) as Record<string, unknown>;
    expect(result.grade).toBe("F");
    expect(typeof result.overall_score).toBe("number");
    const failingGates = result.failing_gates as string[];
    expect(failingGates).toContain("authenticity");
    expect(failingGates).toContain("perception");
    expect(failingGates).toContain("quality");
  });

  it("17. Gate fails → supabase.update called with status 'gate_failed'", async () => {
    mockRunQualityGates.mockReturnValue(makeFailingGateReport());
    await workerProcessor(makeJob());
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "gate_failed" })
    );
  });

  it("18. Gate fails → metadata written includes gate_report with grade", async () => {
    mockRunQualityGates.mockReturnValue(makeFailingGateReport());
    await workerProcessor(makeJob());
    const updateCall = (mockUpdate as jest.Mock).mock.calls.find(
      (c: unknown[]) => (c[0] as Record<string, unknown>).status === "gate_failed"
    );
    expect(updateCall).toBeTruthy();
    const payload = updateCall![0] as Record<string, unknown>;
    const metadata = payload.metadata as Record<string, unknown>;
    const gateReport = metadata.gate_report as Record<string, unknown>;
    expect(gateReport.grade).toBe("F");
    expect(gateReport.passCount).toBe(2);
  });

  it("19. evaluateBuffer throws (non-parseable buffer) → gate skipped → status 'complete'", async () => {
    mockEvaluateBuffer.mockImplementation(() => { throw new Error("Not a WAV file"); });
    const result = await workerProcessor(makeJob()) as Record<string, unknown>;
    expect(result.status).toBe("complete");
  });

  it("20. evaluateBuffer throws → runQualityGates not called", async () => {
    mockEvaluateBuffer.mockImplementation(() => { throw new Error("parse error"); });
    await workerProcessor(makeJob());
    expect(mockRunQualityGates).not.toHaveBeenCalled();
  });

  // ─── Webhook dispatch ──────────────────────────────────────────────────────

  it("21. Complete + webhook_url → enqueueWebhook called with event: 'complete'", async () => {
    const { enqueueWebhook } = jest.requireMock("../queue/index");
    mockRunQualityGates.mockReturnValue(makePassingGateReport());
    await workerProcessor(makeJob({ webhook_url: "https://hook.example.com/cb" }));
    expect(enqueueWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ event: "complete", webhook_url: "https://hook.example.com/cb", generation_id: "gen-001" })
    );
  });

  it("22. Gate failed + webhook_url → enqueueWebhook called with event: 'gate_failed'", async () => {
    const { enqueueWebhook } = jest.requireMock("../queue/index");
    mockRunQualityGates.mockReturnValue(makeFailingGateReport());
    await workerProcessor(makeJob({ webhook_url: "https://hook.example.com/cb" }));
    expect(enqueueWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ event: "gate_failed", webhook_url: "https://hook.example.com/cb" })
    );
  });

  it("23. Prediction failed + webhook_url → enqueueWebhook called with event: 'failed'", async () => {
    const { enqueueWebhook } = jest.requireMock("../queue/index");
    mockGetPrediction.mockResolvedValue(makePrediction("failed", null, "Model OOM"));
    await workerProcessor(makeJob({ webhook_url: "https://hook.example.com/cb" }));
    expect(enqueueWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ event: "failed", webhook_url: "https://hook.example.com/cb" })
    );
  });

  it("24. No webhook_url → enqueueWebhook NOT called", async () => {
    const { enqueueWebhook } = jest.requireMock("../queue/index");
    mockRunQualityGates.mockReturnValue(makePassingGateReport());
    await workerProcessor(makeJob());
    expect(enqueueWebhook).not.toHaveBeenCalled();
  });

});
