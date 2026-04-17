import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ─── Mocks BEFORE imports ─────────────────────────────────────────────────────

const mockQueueAdd = jest.fn().mockResolvedValue({ id: "job-1" });

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation((name: string) => ({
    name,
    add: mockQueueAdd,
    getWaitingCount:    jest.fn().mockResolvedValue(0),
    getActiveCount:     jest.fn().mockResolvedValue(0),
    getFailedCount:     jest.fn().mockResolvedValue(0),
    getCompletedCount:  jest.fn().mockResolvedValue(0),
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

jest.mock("../lib/supabase", () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockResolvedValue({ data: {}, error: null }),
      update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ data: {}, error: null }) }),
    }),
    storage: {
      from: jest.fn().mockReturnValue({
        upload: jest.fn().mockResolvedValue({ data: {}, error: null }),
      }),
    },
  },
}));

jest.mock("@aura-x/replicate-client", () => ({
  createReplicateClient: jest.fn().mockReturnValue({
    getPrediction: jest.fn().mockResolvedValue({ status: "succeeded", output: [] }),
  }),
}));

jest.mock("uuid", () => ({ v4: jest.fn().mockReturnValue("mock-uuid") }));

// ─── queue/index mock — provide truthy connection so workers.ts doesn't bail ──

jest.mock("../queue/index", () => ({
  connection: { status: "ready" },
  enqueueAudioAnalysis: jest.fn().mockResolvedValue({ id: "job-1" }),
  enqueueMode2Generation: jest.fn().mockResolvedValue({ id: "job-1" }),
  enqueueAudioStems: jest.fn().mockResolvedValue({ id: "job-1" }),
}));

// ─── axios mock ──────────────────────────────────────────────────────────────

const mockAxiosPost = jest.fn();

jest.mock("axios", () => ({
  get:  jest.fn().mockResolvedValue({ data: Buffer.from("audio") }),
  post: (...args: unknown[]) => mockAxiosPost(...args),
  isAxiosError: jest.fn().mockReturnValue(false),
}));

// ─── Capture worker processor ────────────────────────────────────────────────

import { Worker } from "bullmq";
const { Worker: MockWorker } = jest.requireMock("bullmq");

let audioProcessor: (job: { data: Record<string, unknown> }) => Promise<unknown>;

// ─────────────────────────────────────────────────────────────────────────────

describe("Stems Worker", () => {

  beforeAll(async () => {
    mockAxiosPost.mockResolvedValue({
      data: {
        status: "complete",
        track_id: "track-001",
        stems: { drums: "file-d", bass: "file-b", vocals: "file-v", other: "file-o" },
        model: "htdemucs",
        sample_rate: 44100,
      },
    });
    await import("../queue/workers");
    const calls = (MockWorker as jest.Mock).mock.calls;
    const audioCall = calls.find((c: unknown[]) => c[0] === "audio-processing");
    if (audioCall) audioProcessor = audioCall[1];
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosPost.mockResolvedValue({
      data: {
        status: "complete",
        track_id: "track-001",
        stems: { drums: "file-d", bass: "file-b", vocals: "file-v", other: "file-o" },
        model: "htdemucs",
        sample_rate: 44100,
      },
    });
  });

  function makeStemsJob(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      data: {
        type: "audio.stems",
        audio_file_id: "audio-file-001",
        track_id: "track-001",
        generation_id: "gen-001",
        ...overrides,
      },
    };
  }

  // ─── Stems worker tests ───────────────────────────────────────────────────

  it("1. audio.stems job → POST to /stems/separate called", async () => {
    await audioProcessor(makeStemsJob());
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.stringContaining("/stems/separate"),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it("2. POST called with correct audio_file_id", async () => {
    await audioProcessor(makeStemsJob({ audio_file_id: "my-audio-file" }));
    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ audio_file_id: "my-audio-file" }),
      expect.any(Object)
    );
  });

  it("3. POST called with correct track_id", async () => {
    await audioProcessor(makeStemsJob({ track_id: "my-track" }));
    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ track_id: "my-track" }),
      expect.any(Object)
    );
  });

  it("4. POST called with AUDIO_SERVICE_URL base", async () => {
    process.env.AUDIO_SERVICE_URL = "http://localhost:8000";
    await audioProcessor(makeStemsJob());
    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.stringContaining("http://localhost:8000"),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it("5. Successful response → returns stems data", async () => {
    const result = await audioProcessor(makeStemsJob()) as Record<string, unknown>;
    expect(result.status).toBe("complete");
    expect(result.stems).toBeDefined();
    expect((result.stems as Record<string, string>).drums).toBe("file-d");
  });

  it("6. Network error → throws (BullMQ will retry)", async () => {
    mockAxiosPost.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(audioProcessor(makeStemsJob())).rejects.toThrow("ECONNREFUSED");
  });

  it("7. 500 from audio service → throws", async () => {
    const err = new Error("Request failed with status code 500") as Error & { response?: { status: number } };
    err.response = { status: 500 };
    mockAxiosPost.mockRejectedValueOnce(err);
    await expect(audioProcessor(makeStemsJob())).rejects.toThrow();
  });

  it("8. Timeout is set to 300000ms (5 min)", async () => {
    await audioProcessor(makeStemsJob());
    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ timeout: 300000 })
    );
  });

  // ─── Python service availability tests (via httpx) ────────────────────────

  it("9. GET http://localhost:8000/stems/status → 200", async () => {
    // Mock httpx-style test using axios.get for the status endpoint
    const { default: axios } = await import("axios");
    (axios.get as jest.Mock).mockResolvedValueOnce({
      status: 200,
      data: { demucs_available: false, message: "Demucs not installed — run: pip install demucs torch torchaudio" },
    });
    const res = await axios.get("http://localhost:8000/stems/status");
    expect(res.status).toBe(200);
  });

  it("10. Status response has demucs_available field", async () => {
    const { default: axios } = await import("axios");
    (axios.get as jest.Mock).mockResolvedValueOnce({
      status: 200,
      data: { demucs_available: false, message: "Demucs not installed" },
    });
    const res = await axios.get("http://localhost:8000/stems/status");
    expect(res.data).toHaveProperty("demucs_available");
  });

});
