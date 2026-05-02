import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ─── Mocks BEFORE any imports ─────────────────────────────────────────────────

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation((name: string) => ({
    name,
    add: jest.fn().mockResolvedValue({ id: "job-1" }),
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

jest.mock("../lib/supabase", () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockResolvedValue({ data: {}, error: null }),
      update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ data: {}, error: null }) }),
    }),
    storage: { from: jest.fn() },
  },
}));

jest.mock("@aura-x/replicate-client", () => ({
  createReplicateClient: jest.fn().mockReturnValue({ getPrediction: jest.fn() }),
}));

jest.mock("@aura-x/engine", () => ({
  evaluateBuffer:         jest.fn(),
  runQualityGates:        jest.fn(),
  createMetricsCollector: jest.fn(() => ({
    record: jest.fn(), snapshot: jest.fn(), reset: jest.fn(), size: 0,
  })),
}));

jest.mock("../lib/metricsCollector", () => ({
  metricsCollector: { record: jest.fn(), snapshot: jest.fn(), reset: jest.fn(), size: 0 },
}));

const mockAxiosPost = jest.fn();
const mockIsAxiosError = jest.fn().mockReturnValue(false);

jest.mock("axios", () => ({
  post:         (...args: unknown[]) => mockAxiosPost(...args),
  get:          jest.fn().mockResolvedValue({ data: Buffer.from("") }),
  isAxiosError: (...args: unknown[]) => mockIsAxiosError(...args),
}));

jest.mock("uuid", () => ({ v4: jest.fn().mockReturnValue("mock-uuid") }));

jest.mock("../queue/index", () => ({
  connection:           { status: "ready" },
  enqueueAudioAnalysis: jest.fn().mockResolvedValue({ id: "job-1" }),
  enqueueMode2Generation: jest.fn().mockResolvedValue({ id: "job-1" }),
  enqueueAudioStems:    jest.fn().mockResolvedValue({ id: "job-1" }),
  enqueueWebhook:       jest.fn().mockResolvedValue({ id: "wh-1" }),
}));

// ─── Worker extraction ────────────────────────────────────────────────────────

import { Worker } from "bullmq";
const { Worker: MockWorker } = jest.requireMock("bullmq");

let webhookProcessor: (job: { data: Record<string, unknown> }) => Promise<unknown>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWebhookJob(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      type:          "webhook.deliver",
      generation_id: "gen-001",
      webhook_url:   "https://producer.example.com/webhook",
      event:         "complete",
      payload:       { audio_file_id: "file-001", grade: "A" },
      ...overrides,
    },
  };
}

function makeAxiosError(status: number | undefined) {
  const err = Object.assign(new Error(status ? `HTTP ${status}` : "ECONNREFUSED"), {
    response: status !== undefined ? { status } : undefined,
  });
  mockIsAxiosError.mockReturnValue(true);
  return err;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("Webhook Worker", () => {

  beforeAll(async () => {
    await import("../queue/workers");
    const calls = (MockWorker as jest.Mock).mock.calls;
    const whCall = calls.find((c: unknown[]) => c[0] === "webhook");
    if (whCall) webhookProcessor = whCall[1] as typeof webhookProcessor;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAxiosError.mockReturnValue(false);
    mockAxiosPost.mockResolvedValue({ status: 200, data: { ok: true } });
  });

  // ─── Delivery ─────────────────────────────────────────────────────────────

  it("1. Worker registered with queue name 'webhook' — processor extracted", () => {
    expect(typeof webhookProcessor).toBe("function");
  });

  it("2. axios.post called with the webhook_url", async () => {
    await webhookProcessor(makeWebhookJob());
    expect(mockAxiosPost).toHaveBeenCalledWith(
      "https://producer.example.com/webhook",
      expect.any(Object),
      expect.any(Object)
    );
  });

  it("3. POST body includes generation_id and event", async () => {
    await webhookProcessor(makeWebhookJob());
    const body = (mockAxiosPost as jest.Mock).mock.calls[0][1] as Record<string, unknown>;
    expect(body.generation_id).toBe("gen-001");
    expect(body.event).toBe("complete");
  });

  it("4. POST body spreads payload fields into top-level", async () => {
    await webhookProcessor(makeWebhookJob());
    const body = (mockAxiosPost as jest.Mock).mock.calls[0][1] as Record<string, unknown>;
    expect(body.audio_file_id).toBe("file-001");
    expect(body.grade).toBe("A");
  });

  it("5. POST called with timeout: 10000", async () => {
    await webhookProcessor(makeWebhookJob());
    const opts = (mockAxiosPost as jest.Mock).mock.calls[0][2] as Record<string, unknown>;
    expect(opts.timeout).toBe(10000);
  });

  it("6. 2xx response → returns { delivered: true, status: 200 }", async () => {
    mockAxiosPost.mockResolvedValue({ status: 200, data: {} });
    const result = await webhookProcessor(makeWebhookJob()) as Record<string, unknown>;
    expect(result.delivered).toBe(true);
    expect(result.status).toBe(200);
  });

  // ─── Retry / skip policy ──────────────────────────────────────────────────

  it("7. 4xx response → returns { skipped: true } without throwing", async () => {
    mockAxiosPost.mockRejectedValue(makeAxiosError(404));
    const result = await webhookProcessor(makeWebhookJob()) as Record<string, unknown>;
    expect(result.skipped).toBe(true);
    expect(result.status).toBe(404);
  });

  it("8. 400 response → does not throw (BullMQ marks job complete)", async () => {
    mockAxiosPost.mockRejectedValue(makeAxiosError(400));
    await expect(webhookProcessor(makeWebhookJob())).resolves.toBeDefined();
  });

  it("9. 5xx response → throws (triggers BullMQ retry)", async () => {
    mockAxiosPost.mockRejectedValue(makeAxiosError(500));
    await expect(webhookProcessor(makeWebhookJob())).rejects.toThrow();
  });

  it("10. 503 response → throws (triggers BullMQ retry)", async () => {
    mockAxiosPost.mockRejectedValue(makeAxiosError(503));
    await expect(webhookProcessor(makeWebhookJob())).rejects.toThrow();
  });

  it("11. Network error (no response) → throws (triggers BullMQ retry)", async () => {
    mockAxiosPost.mockRejectedValue(makeAxiosError(undefined));
    await expect(webhookProcessor(makeWebhookJob())).rejects.toThrow("ECONNREFUSED");
  });

  // ─── Payload shapes ───────────────────────────────────────────────────────

  it("12. gate_failed event — body contains grade, overall_score, failing_gates", async () => {
    await webhookProcessor(makeWebhookJob({
      event:   "gate_failed",
      payload: { grade: "F", overall_score: 0.42, failing_gates: ["authenticity"] },
    }));
    const body = (mockAxiosPost as jest.Mock).mock.calls[0][1] as Record<string, unknown>;
    expect(body.event).toBe("gate_failed");
    expect(body.grade).toBe("F");
    expect((body.failing_gates as string[])).toContain("authenticity");
  });

});
