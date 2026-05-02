import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// AbortSignal.timeout is used in the client
global.AbortSignal = {
  timeout: jest.fn().mockReturnValue({}),
} as unknown as typeof AbortSignal;

// isEngineAvailable reads AURA_ENGINE_URL at module load — reset modules between tests
// that toggle the env var so the module re-evaluates the constant.

describe("auraEngine client", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.AURA_ENGINE_URL;
    jest.resetModules();
  });

  it("1. ctlFromGoal returns null when AURA_ENGINE_URL not set", async () => {
    delete process.env.AURA_ENGINE_URL;
    jest.resetModules();
    const { ctlFromGoal } = await import("../lib/auraEngine");
    const result = await ctlFromGoal({ title: "T", subgenre: "private_school", created_by: "test" });
    expect(result).toBeNull();
  });

  it("2. ctlFromGoal calls correct endpoint with JSON body", async () => {
    process.env.AURA_ENGINE_URL = "http://engine.test";
    jest.resetModules();
    const { ctlFromGoal } = await import("../lib/auraEngine");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ctl: { version: "1.0", global: { subgenre: "private_school" } },
        perception_report: { state: "harmonic", converged: true },
        cultural_report: { best_fit_lane: "private_school" },
        quality_score: 0.85,
        generation_source: "goal_synthesis",
      }),
    });

    const result = await ctlFromGoal({
      title: "Jozi", subgenre: "private_school",
      bpm: 112, key: "F#m", created_by: "test",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://engine.test/ctl/from-goal",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result?.quality_score).toBe(0.85);
    expect(result?.generation_source).toBe("goal_synthesis");
    expect(result?.ctl).toBeDefined();
  });

  it("3. ctlFromGoal returns null on network error", async () => {
    process.env.AURA_ENGINE_URL = "http://engine.test";
    jest.resetModules();
    const { ctlFromGoal } = await import("../lib/auraEngine");
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const result = await ctlFromGoal({ title: "T", subgenre: "sgija", created_by: "test" });
    expect(result).toBeNull();
  });

  it("4. ctlFromGoal returns null on non-ok response", async () => {
    process.env.AURA_ENGINE_URL = "http://engine.test";
    jest.resetModules();
    const { ctlFromGoal } = await import("../lib/auraEngine");
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const result = await ctlFromGoal({ title: "T", subgenre: "bacardi", created_by: "test" });
    expect(result).toBeNull();
  });

  it("5. ctlFromGoal sends bpm=0 when bpm not provided", async () => {
    process.env.AURA_ENGINE_URL = "http://engine.test";
    jest.resetModules();
    const { ctlFromGoal } = await import("../lib/auraEngine");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ctl: {}, perception_report: {}, cultural_report: {},
        quality_score: 0.8, generation_source: "goal_synthesis",
      }),
    });

    await ctlFromGoal({ title: "T", subgenre: "gqom_fusion", created_by: "test" });

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.bpm).toBe(0);
    expect(body.key).toBe("");
  });

  it("6. scoreSignal returns null when AURA_ENGINE_URL not set", async () => {
    delete process.env.AURA_ENGINE_URL;
    jest.resetModules();
    const { scoreSignal } = await import("../lib/auraEngine");
    const result = await scoreSignal(Buffer.from("fake"), "private_school");
    expect(result).toBeNull();
  });

  it("7. scoreSignal calls /signal/score with FormData and returns score", async () => {
    process.env.AURA_ENGINE_URL = "http://engine.test";
    jest.resetModules();
    const { scoreSignal } = await import("../lib/auraEngine");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        composite_score: 0.78,
        lane_match: true,
        lane_score: 0.82,
        perception_score: 0.90,
        authenticity_score: 0.75,
        bpm_score: 0.95,
        key_score: 1.0,
        perception_state: "harmonic",
        c1_pass: true,
        c2_pass: true,
        c3_pass: true,
        detected_lane: "private_school",
        detected_bpm: 112.0,
        detected_key: "F#m",
        violations: [],
        recommendations: [],
      }),
    });

    const result = await scoreSignal(Buffer.alloc(1024), "private_school", 112, "F#m");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://engine.test/signal/score",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result?.composite_score).toBe(0.78);
    expect(result?.c1_pass).toBe(true);
    expect(result?.detected_lane).toBe("private_school");
    expect(result?.lane_match).toBe(true);
  });

  it("8. scoreSignal returns null on network error", async () => {
    process.env.AURA_ENGINE_URL = "http://engine.test";
    jest.resetModules();
    const { scoreSignal } = await import("../lib/auraEngine");
    mockFetch.mockRejectedValueOnce(new Error("timeout"));
    const result = await scoreSignal(Buffer.alloc(512), "sgija");
    expect(result).toBeNull();
  });
});
