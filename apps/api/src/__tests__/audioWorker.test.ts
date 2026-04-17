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

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockDatasetEq     = jest.fn();
const mockDatasetUpdate = jest.fn();
const mockDatasetSingle = jest.fn();
const mockDatasetSelect = jest.fn();
const mockDatasetLimit  = jest.fn();

// dataset_records query chain: .select().eq().limit().single()
mockDatasetSelect.mockReturnValue({ eq: mockDatasetEq });
mockDatasetEq.mockReturnValue({ limit: mockDatasetLimit });
mockDatasetLimit.mockReturnValue({ single: mockDatasetSingle });
mockDatasetSingle.mockResolvedValue({ data: { id: "ds-row-001" }, error: null });

// dataset_records update chain: .update().eq()
const mockUpdateEq = jest.fn().mockResolvedValue({ data: {}, error: null });
mockDatasetUpdate.mockReturnValue({ eq: mockUpdateEq });

jest.mock("../lib/supabase", () => ({
  supabase: {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === "dataset_records") {
        return {
          select: mockDatasetSelect,
          update: mockDatasetUpdate,
        };
      }
      return {
        insert: jest.fn().mockResolvedValue({ data: {}, error: null }),
        update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ data: {}, error: null }) }),
      };
    }),
    storage: {
      from: jest.fn().mockReturnValue({
        upload: jest.fn().mockResolvedValue({ data: {}, error: null }),
      }),
    },
  },
}));

// ─── queue/index mock ─────────────────────────────────────────────────────────

jest.mock("../queue/index", () => ({
  connection: { status: "ready" },
  enqueueAudioAnalysis:   jest.fn().mockResolvedValue({ id: "job-1" }),
  enqueueMode2Generation: jest.fn().mockResolvedValue({ id: "job-1" }),
  enqueueAudioStems:      jest.fn().mockResolvedValue({ id: "job-1" }),
}));

// ─── axios mock ──────────────────────────────────────────────────────────────

const mockAxiosPost = jest.fn();

jest.mock("axios", () => ({
  get:  jest.fn().mockResolvedValue({ data: Buffer.from("audio") }),
  post: (...args: unknown[]) => mockAxiosPost(...args),
  isAxiosError: jest.fn().mockReturnValue(false),
}));

jest.mock("uuid", () => ({ v4: jest.fn().mockReturnValue("mock-uuid") }));

jest.mock("@aura-x/replicate-client", () => ({
  createReplicateClient: jest.fn().mockReturnValue({
    getPrediction: jest.fn(),
  }),
}));

// ─── Capture audio processor ──────────────────────────────────────────────────

const { Worker: MockWorker } = jest.requireMock("bullmq");
let audioProcessor: (job: { data: Record<string, unknown> }) => Promise<unknown>;

// ─── Standard analysis response ──────────────────────────────────────────────

const ANALYSIS_RESPONSE = {
  status:          "complete",
  bpm:             114.0,
  bpm_confidence:  0.87,
  key:             "Am",
  key_confidence:  0.79,
  mode:            "minor",
  energy_mean:     0.60,
  energy_peak:     0.035,
  onset_density:   3.8,
  duration_sec:    210.0,
  sample_rate:     44100,
};

// ─────────────────────────────────────────────────────────────────────────────

describe("Audio Worker — audio.analyze with dataset_records update", () => {

  beforeAll(async () => {
    mockAxiosPost.mockResolvedValue({ data: ANALYSIS_RESPONSE });
    await import("../queue/workers");
    const calls = (MockWorker as jest.Mock).mock.calls;
    const audioCall = calls.find((c: unknown[]) => c[0] === "audio-processing");
    if (audioCall) audioProcessor = audioCall[1];
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosPost.mockResolvedValue({ data: ANALYSIS_RESPONSE });
    // Re-wire mock chains after clearAllMocks
    mockDatasetSelect.mockReturnValue({ eq: mockDatasetEq });
    mockDatasetEq.mockReturnValue({ limit: mockDatasetLimit });
    mockDatasetLimit.mockReturnValue({ single: mockDatasetSingle });
    mockDatasetSingle.mockResolvedValue({ data: { id: "ds-row-001" }, error: null });
    mockDatasetUpdate.mockReturnValue({ eq: mockUpdateEq });
    mockUpdateEq.mockResolvedValue({ data: {}, error: null });
  });

  function makeAnalyzeJob(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      data: {
        type:          "audio.analyze",
        audio_file_id: "af-001",
        track_id:      "track-001",
        storage_path:  "track-001/raw/af-001.wav",
        format:        "wav",
        ...overrides,
      },
    };
  }

  // ─── Python service call ──────────────────────────────────────────────────

  it("1. audio.analyze → POST to /analysis/analyze", async () => {
    await audioProcessor(makeAnalyzeJob());
    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.stringContaining("/analysis/analyze"),
      expect.objectContaining({ audio_file_id: "af-001", track_id: "track-001" }),
      expect.objectContaining({ timeout: 120000 })
    );
  });

  it("2. Result includes real BPM from analyzer", async () => {
    const result = await audioProcessor(makeAnalyzeJob()) as Record<string, unknown>;
    expect(result.bpm).toBe(114.0);
  });

  it("3. Result includes real key from analyzer", async () => {
    const result = await audioProcessor(makeAnalyzeJob()) as Record<string, unknown>;
    expect(result.key).toBe("Am");
  });

  // ─── dataset_records update ───────────────────────────────────────────────

  it("4. dataset_records queried by track_id", async () => {
    await audioProcessor(makeAnalyzeJob());
    expect(mockDatasetEq).toHaveBeenCalledWith("track_id", "track-001");
  });

  it("5. dataset_records.update called with real BPM", async () => {
    await audioProcessor(makeAnalyzeJob());
    expect(mockDatasetUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ bpm: 114.0 })
    );
  });

  it("6. dataset_records.update called with real key", async () => {
    await audioProcessor(makeAnalyzeJob());
    expect(mockDatasetUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ key: "Am" })
    );
  });

  it("7. composite_score is a signal-grounded number (not hardcoded 0.82)", async () => {
    const result = await audioProcessor(makeAnalyzeJob()) as Record<string, unknown>;
    // BPM=114: bpm_score = 1 - |114-110|/30 = 1 - 4/30 ≈ 0.867
    // energy=0.60, onset=3.8/4=0.95
    // composite ≈ 0.5*0.867 + 0.3*0.60 + 0.2*0.95 ≈ 0.804
    expect(typeof result.composite_score).toBe("number");
    expect(result.composite_score).not.toBe(0.82);
    expect(result.composite_score as number).toBeGreaterThan(0);
    expect(result.composite_score as number).toBeLessThanOrEqual(1);
  });

  it("8. update includes metadata with analyzed_at timestamp", async () => {
    await audioProcessor(makeAnalyzeJob());
    expect(mockDatasetUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ analyzed_at: expect.any(String) }),
      })
    );
  });

  // ─── No dataset_records row — graceful skip ───────────────────────────────

  it("9. No dataset_records row → update is skipped (no error thrown)", async () => {
    mockDatasetSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(audioProcessor(makeAnalyzeJob())).resolves.toBeDefined();
    expect(mockDatasetUpdate).not.toHaveBeenCalled();
  });

  // ─── Composite score formula validation ───────────────────────────────────

  it("10. BPM exactly 110 → bpm_score = 1.0, max composite for given energy/onset", async () => {
    mockAxiosPost.mockResolvedValueOnce({
      data: { ...ANALYSIS_RESPONSE, bpm: 110.0, energy_mean: 1.0, onset_density: 4.0 },
    });
    const result = await audioProcessor(makeAnalyzeJob()) as Record<string, unknown>;
    // bpm_score=1, energy=1, onset=1 → composite = 1.0
    expect(result.composite_score).toBe(1.0);
  });

});
