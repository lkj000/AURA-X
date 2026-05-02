import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ─── Mock Supabase ────────────────────────────────────────────────────────────

const mockFrom = jest.fn();

jest.mock("../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// ─── Mock @aura-x/ac-ami ─────────────────────────────────────────────────────

const mockConditionForMode2 = jest.fn();

jest.mock("@aura-x/ac-ami", () => ({
  conditionForMode2: (...a: unknown[]) => mockConditionForMode2(...a),
}));

// ─── Mock auth ────────────────────────────────────────────────────────────────

jest.mock("../middleware/auth", () => ({
  verifyToken: (_r: unknown, _s: unknown, next: () => void) => next(),
}));

// ─── Build app ───────────────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import conditionRouter from "../routes/condition";

const app = express();
app.use(express.json());
app.use("/api/tracks", conditionRouter);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TRACK_ID = "track-aaa-001";
const FAKE_CTL = { global: { bpm: 112, key: "F#m", subgenre: "private_school" }, curves: {}, instrumentation: [], lineage: {} };

const FAKE_RESULT = {
  prompt:   "Amapiano private school, 112 BPM, key of F#m, log drum, piano",
  duration: 29,
  notes:    ["Subgenre: private_school", "Duration: 29s (16 bars at 112 BPM)"],
  input:    { prompt: "Amapiano...", duration: 29, temperature: 0.85, classifier_free_guidance: 3.0, top_k: 250, top_p: 0.0, output_format: "wav", normalization_strategy: "peak", model_version: "stereo_melody" },
};

function makeCTLQuery(found: boolean) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: found ? { ctl_json: FAKE_CTL, version: 5 } : null,
            error: null,
          }),
        }),
      }),
    }),
  };
}

function makeInsertQuery(genId = "gen-001") {
  return {
    insert: () => ({
      select: () => ({
        single: () => Promise.resolve({ data: { id: genId }, error: null }),
      }),
    }),
  };
}

// ─── POST /api/tracks/:id/condition ──────────────────────────────────────────

describe("POST /api/tracks/:id/condition", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockConditionForMode2.mockReturnValue(FAKE_RESULT);
    mockFrom.mockImplementation(() => makeCTLQuery(true));
  });

  it("1. No active CTL → 404", async () => {
    mockFrom.mockImplementation(() => makeCTLQuery(false));
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/condition`).send({});
    expect(res.status).toBe(404);
  });

  it("2. Returns 200 with required fields", async () => {
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/condition`).send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      track_id:    TRACK_ID,
      ctl_version: 5,
      ready:       true,
      prompt:      expect.any(String),
      duration:    expect.any(Number),
      notes:       expect.any(Array),
      input:       expect.any(Object),
    });
  });

  it("3. conditionForMode2 called with fetched CTL", async () => {
    await request(app).post(`/api/tracks/${TRACK_ID}/condition`).send({});
    expect(mockConditionForMode2).toHaveBeenCalledWith(FAKE_CTL, expect.any(Object));
  });

  it("4. targetBars=8 forwarded to conditionForMode2", async () => {
    await request(app).post(`/api/tracks/${TRACK_ID}/condition`).send({ targetBars: 8 });
    const [, opts] = (mockConditionForMode2 as jest.Mock).mock.calls[0];
    expect(opts.targetBars).toBe(8);
  });

  it("5. targetBars=32 forwarded", async () => {
    await request(app).post(`/api/tracks/${TRACK_ID}/condition`).send({ targetBars: 32 });
    const [, opts] = (mockConditionForMode2 as jest.Mock).mock.calls[0];
    expect(opts.targetBars).toBe(32);
  });

  it("6. Invalid targetBars (e.g. 7) not forwarded", async () => {
    await request(app).post(`/api/tracks/${TRACK_ID}/condition`).send({ targetBars: 7 });
    const [, opts] = (mockConditionForMode2 as jest.Mock).mock.calls[0];
    expect(opts.targetBars).toBeUndefined();
  });

  it("7. melodyUrl forwarded when provided", async () => {
    const url = "https://cdn.example.com/melody.wav";
    await request(app).post(`/api/tracks/${TRACK_ID}/condition`).send({ melodyUrl: url });
    const [, opts] = (mockConditionForMode2 as jest.Mock).mock.calls[0];
    expect(opts.melodyUrl).toBe(url);
  });

  it("8. prompt and duration match conditionForMode2 output", async () => {
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/condition`).send({});
    expect(res.body.prompt).toBe(FAKE_RESULT.prompt);
    expect(res.body.duration).toBe(FAKE_RESULT.duration);
  });

});

// ─── POST /api/tracks/:id/condition/apply ────────────────────────────────────

describe("POST /api/tracks/:id/condition/apply", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockConditionForMode2.mockReturnValue(FAKE_RESULT);
    mockFrom.mockImplementation((table: string) => {
      if (table === "ctls")        return makeCTLQuery(true);
      if (table === "generations") return makeInsertQuery();
      return {};
    });
  });

  it("9. No active CTL → 404", async () => {
    mockFrom.mockImplementation(() => makeCTLQuery(false));
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/condition/apply`).send({});
    expect(res.status).toBe(404);
  });

  it("10. Returns 200 with persisted and generation_id fields", async () => {
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/condition/apply`).send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      track_id:     TRACK_ID,
      ctl_version:  5,
      ready:        true,
      persisted:    false,
      generation_id: null,
    });
  });

  it("11. conditionForMode2 called on apply", async () => {
    await request(app).post(`/api/tracks/${TRACK_ID}/condition/apply`).send({});
    expect(mockConditionForMode2).toHaveBeenCalledWith(FAKE_CTL, expect.any(Object));
  });

  it("12. persist:false → no Supabase insert into generations", async () => {
    let insertCalled = false;
    mockFrom.mockImplementation((table: string) => {
      if (table === "ctls") return makeCTLQuery(true);
      if (table === "generations") return {
        insert: () => { insertCalled = true; return { select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }; },
      };
      return {};
    });
    await request(app).post(`/api/tracks/${TRACK_ID}/condition/apply`).send({ persist: false });
    expect(insertCalled).toBe(false);
  });

  it("13. persist:true → Supabase insert called, generation_id returned", async () => {
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/condition/apply`).send({ persist: true });
    expect(res.body.persisted).toBe(true);
    expect(res.body.generation_id).toBe("gen-001");
  });

  it("14. persist:true → generation inserted with mode mode_2 and status draft", async () => {
    let capturedInsert: Record<string, unknown> | null = null;
    mockFrom.mockImplementation((table: string) => {
      if (table === "ctls") return makeCTLQuery(true);
      if (table === "generations") return {
        insert: (data: unknown) => {
          capturedInsert = data as Record<string, unknown>;
          return { select: () => ({ single: () => Promise.resolve({ data: { id: "gen-xyz" }, error: null }) }) };
        },
      };
      return {};
    });
    await request(app).post(`/api/tracks/${TRACK_ID}/condition/apply`).send({ persist: true });
    expect(capturedInsert).toMatchObject({ track_id: TRACK_ID, mode: "mode_2", status: "draft" });
  });

  it("15. Input object present in apply response", async () => {
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/condition/apply`).send({});
    expect(res.body.input).toBeDefined();
    expect(typeof res.body.input).toBe("object");
  });

});
