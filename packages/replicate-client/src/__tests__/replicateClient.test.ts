import axios from "axios";
import { ReplicateClient, ReplicateError, createReplicateClient } from "../replicateClient";
import { MUSICGEN_MODELS } from "../models";

// ─── Mock axios ───────────────────────────────────────────────────────────────

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockPost = jest.fn();
const mockGet  = jest.fn();

// axios.create() returns a mock instance with .post and .get
mockedAxios.create.mockReturnValue({
  post: mockPost,
  get:  mockGet,
} as unknown as ReturnType<typeof axios.create>);

// Keep isAxiosError working for error tests
mockedAxios.isAxiosError.mockImplementation(
  (err: unknown): err is import("axios").AxiosError =>
    !!(err && typeof err === "object" && (err as Record<string, unknown>).__isAxiosError === true)
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePrediction(overrides: Partial<{
  id: string; status: string; output: string[] | null; error: string | null;
}> = {}) {
  return {
    id:           overrides.id     ?? "pred_abc123",
    status:       overrides.status ?? "starting",
    input:        { prompt: "test" },
    output:       overrides.output ?? null,
    error:        overrides.error  ?? null,
    created_at:   "2026-04-10T00:00:00Z",
    completed_at: null,
    urls: {
      get:    "https://api.replicate.com/v1/predictions/pred_abc123",
      cancel: "https://api.replicate.com/v1/predictions/pred_abc123/cancel",
    },
  };
}

function makeAxiosError(status: number, detail?: string) {
  const err = new Error("axios error") as unknown as Record<string, unknown>;
  err.__isAxiosError = true;
  err.response = { status, data: { detail: detail ?? "error" } };
  return err;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("Replicate Client", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.REPLICATE_API_TOKEN;
  });

  // ─── Construction ──────────────────────────────────────────────────────────

  it("1. ReplicateClient instantiates without error when given token", () => {
    expect(() => new ReplicateClient("test-token")).not.toThrow();
  });

  it("2. createReplicateClient() throws when REPLICATE_API_TOKEN is not set", () => {
    expect(() => createReplicateClient()).toThrow("REPLICATE_API_TOKEN");
  });

  it("3. createReplicateClient() succeeds when token is set in env", () => {
    process.env.REPLICATE_API_TOKEN = "env-token";
    expect(() => createReplicateClient()).not.toThrow();
  });

  // ─── createPrediction ──────────────────────────────────────────────────────

  it("4. POST /predictions called with correct version hash", async () => {
    const client = new ReplicateClient("tok");
    mockPost.mockResolvedValueOnce({ data: makePrediction() });

    await client.createPrediction({ prompt: "deep house amapiano" });

    expect(mockPost).toHaveBeenCalledWith(
      "/predictions",
      expect.objectContaining({
        version: MUSICGEN_MODELS.stereo_melody,
        input: expect.objectContaining({ prompt: "deep house amapiano" }),
      })
    );
  });

  it("5. createPrediction returns prediction object with id and status", async () => {
    const client = new ReplicateClient("tok");
    mockPost.mockResolvedValueOnce({ data: makePrediction({ id: "pred_xyz", status: "starting" }) });

    const prediction = await client.createPrediction({ prompt: "test" });
    expect(prediction.id).toBe("pred_xyz");
    expect(prediction.status).toBe("starting");
  });

  it("6. Auth error (401) throws ReplicateError with code AUTH_ERROR", async () => {
    const client = new ReplicateClient("bad-token");
    mockPost.mockRejectedValueOnce(makeAxiosError(401));

    await expect(client.createPrediction({ prompt: "test" }))
      .rejects.toMatchObject({ name: "ReplicateError", code: "AUTH_ERROR" });
  });

  it("7. Rate limit (429) throws ReplicateError with code RATE_LIMIT", async () => {
    const client = new ReplicateClient("tok");
    mockPost.mockRejectedValueOnce(makeAxiosError(429));

    await expect(client.createPrediction({ prompt: "test" }))
      .rejects.toMatchObject({ name: "ReplicateError", code: "RATE_LIMIT" });
  });

  // ─── getPrediction ─────────────────────────────────────────────────────────

  it("8. GET /predictions/:id called with correct path", async () => {
    const client = new ReplicateClient("tok");
    mockGet.mockResolvedValueOnce({ data: makePrediction({ id: "pred_abc123", status: "processing" }) });

    await client.getPrediction("pred_abc123");
    expect(mockGet).toHaveBeenCalledWith("/predictions/pred_abc123");
  });

  it("9. getPrediction returns prediction with status", async () => {
    const client = new ReplicateClient("tok");
    mockGet.mockResolvedValueOnce({ data: makePrediction({ status: "processing" }) });

    const pred = await client.getPrediction("pred_abc123");
    expect(pred.status).toBe("processing");
  });

  // ─── waitForCompletion ─────────────────────────────────────────────────────

  it("10. Resolves immediately when prediction is already 'succeeded'", async () => {
    const client = new ReplicateClient("tok");
    const done = makePrediction({ status: "succeeded", output: ["https://r2.example.com/audio.wav"] });
    mockGet.mockResolvedValueOnce({ data: done });

    const result = await client.waitForCompletion("pred_abc123", { pollIntervalMs: 0 });
    expect(result.status).toBe("succeeded");
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("11. Polls until status changes from 'processing' to 'succeeded'", async () => {
    const client = new ReplicateClient("tok");
    mockGet
      .mockResolvedValueOnce({ data: makePrediction({ status: "processing" }) })
      .mockResolvedValueOnce({ data: makePrediction({ status: "processing" }) })
      .mockResolvedValueOnce({ data: makePrediction({ status: "succeeded", output: ["https://r2.example.com/audio.wav"] }) });

    const result = await client.waitForCompletion("pred_abc123", { pollIntervalMs: 0 });
    expect(result.status).toBe("succeeded");
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  it("12. Throws ReplicateError with code TIMEOUT after maxPolls exceeded", async () => {
    const client = new ReplicateClient("tok");
    // Always return "processing" — never completes
    mockGet.mockResolvedValue({ data: makePrediction({ status: "processing" }) });

    await expect(
      client.waitForCompletion("pred_abc123", { pollIntervalMs: 0, maxPolls: 3 })
    ).rejects.toMatchObject({ name: "ReplicateError", code: "TIMEOUT" });
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

});
