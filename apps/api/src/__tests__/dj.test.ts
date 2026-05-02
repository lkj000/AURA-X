import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ─── Mock Supabase ────────────────────────────────────────────────────────────

const mockFrom = jest.fn();

jest.mock("../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// ─── Mock @aura-x/ac-ami ─────────────────────────────────────────────────────

const mockPlanSet                  = jest.fn();
const mockGetCamelotCode           = jest.fn();
const mockGetCompatibleKeys        = jest.fn();
const mockHarmonicCompatibility    = jest.fn();
const mockBpmCompatibility         = jest.fn();
const mockMixCompatibility         = jest.fn();

jest.mock("@aura-x/ac-ami", () => ({
  planSet:                    (...a: unknown[]) => mockPlanSet(...a),
  getCamelotCode:             (...a: unknown[]) => mockGetCamelotCode(...a),
  getCompatibleKeys:          (...a: unknown[]) => mockGetCompatibleKeys(...a),
  harmonicCompatibilityScore: (...a: unknown[]) => mockHarmonicCompatibility(...a),
  bpmCompatibilityScore:      (...a: unknown[]) => mockBpmCompatibility(...a),
  mixCompatibilityScore:      (...a: unknown[]) => mockMixCompatibility(...a),
}));

// ─── Build app ───────────────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import djRouter from "../routes/dj";

const app = express();
app.use(express.json());
app.use("/api/dj", djRouter);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TRACK_A = { id: "t-aaa", title: "Johannesburg Rain", subgenre: "private_school", bpm: 112, key: "F#m" };
const TRACK_B = { id: "t-bbb", title: "Soweto Nights",     subgenre: "sgija",          bpm: 115, key: "Am"  };
const TRACK_C = { id: "t-ccc", title: "Cape Town Breeze",  subgenre: "bacardi",         bpm: 118, key: "C"   };

const FAKE_SET_PLAN = {
  title: "Test Set",
  total_duration_min: 45,
  track_count: 3,
  energy_arc: ["entry", "build", "peak"],
  tracks: [TRACK_A, TRACK_B, TRACK_C],
  transitions: [],
  set_notes: ["Planned 3 tracks, ~45 min"],
};

function makeTracksQuery(rows: typeof TRACK_A[]) {
  return {
    select: () => ({
      in: () => Promise.resolve({ data: rows, error: null }),
    }),
  };
}

function makeEvalsQuery() {
  return {
    select: () => ({
      in: () => ({
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  };
}

function makeSingleTrackQuery(row: typeof TRACK_A | null) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: row, error: null }),
      }),
    }),
  };
}

// ─── POST /api/dj/set-plan ────────────────────────────────────────────────────

describe("POST /api/dj/set-plan", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockPlanSet.mockReturnValue(FAKE_SET_PLAN);
    mockGetCamelotCode.mockReturnValue("8A");
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks")      return makeTracksQuery([TRACK_A, TRACK_B, TRACK_C]);
      if (table === "evaluations") return makeEvalsQuery();
      return {};
    });
  });

  it("1. Missing track_ids → 400", async () => {
    const res = await request(app).post("/api/dj/set-plan").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/track_ids/);
  });

  it("2. track_ids not an array → 400", async () => {
    const res = await request(app).post("/api/dj/set-plan").send({ track_ids: "t-aaa" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/track_ids/);
  });

  it("3. track_ids with 1 element → 400", async () => {
    const res = await request(app).post("/api/dj/set-plan").send({ track_ids: ["t-aaa"] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 2/);
  });

  it("4. Valid track_ids → 200 with SetPlan shape", async () => {
    const res = await request(app).post("/api/dj/set-plan").send({
      track_ids: ["t-aaa", "t-bbb", "t-ccc"],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title:            expect.any(String),
      total_duration_min: expect.any(Number),
      track_count:      expect.any(Number),
      energy_arc:       expect.any(Array),
      tracks:           expect.any(Array),
      transitions:      expect.any(Array),
      set_notes:        expect.any(Array),
    });
  });

  it("5. planSet called with correct SetTrack array length", async () => {
    await request(app).post("/api/dj/set-plan").send({
      track_ids: ["t-aaa", "t-bbb", "t-ccc"],
    });
    const [setTracks] = (mockPlanSet as jest.Mock).mock.calls[0];
    expect(setTracks).toHaveLength(3);
    expect(setTracks[0].track_id).toBe("t-aaa");
  });

  it("6. title option passed to planSet", async () => {
    await request(app).post("/api/dj/set-plan").send({
      track_ids: ["t-aaa", "t-bbb", "t-ccc"],
      title: "Friday Rooftop",
    });
    const [, opts] = (mockPlanSet as jest.Mock).mock.calls[0];
    expect(opts.title).toBe("Friday Rooftop");
  });

  it("7. target_duration_min passed and clamped to [10, 180]", async () => {
    await request(app).post("/api/dj/set-plan").send({
      track_ids: ["t-aaa", "t-bbb", "t-ccc"],
      target_duration_min: 9999,
    });
    const [, opts] = (mockPlanSet as jest.Mock).mock.calls[0];
    expect(opts.target_duration_min).toBe(180);
  });

  it("8. Evaluation composite_score used as energy_mean when available", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks") return makeTracksQuery([TRACK_A, TRACK_B]);
      if (table === "evaluations") return {
        select: () => ({
          in: () => ({
            order: () => Promise.resolve({
              data: [{ track_id: "t-aaa", composite_score: 0.82 }],
              error: null,
            }),
          }),
        }),
      };
      return {};
    });
    await request(app).post("/api/dj/set-plan").send({ track_ids: ["t-aaa", "t-bbb"] });
    const [setTracks] = (mockPlanSet as jest.Mock).mock.calls[0];
    const trackA = (setTracks as { track_id: string; energy_mean: number }[]).find(t => t.track_id === "t-aaa");
    expect(trackA?.energy_mean).toBe(0.82);
  });

  it("9. Missing tracks in DB → 422 with missing IDs", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks") return makeTracksQuery([TRACK_A]); // only 1 of 2 found
      return {};
    });
    const res = await request(app).post("/api/dj/set-plan").send({
      track_ids: ["t-aaa", "t-missing"],
    });
    expect(res.status).toBe(422);
    expect(res.body.missing).toContain("t-missing");
  });

});

// ─── GET /api/dj/mix-score ────────────────────────────────────────────────────

describe("GET /api/dj/mix-score", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCamelotCode.mockReturnValue("8A");
    mockGetCompatibleKeys.mockReturnValue(["7A", "8B", "9A"]);
    mockHarmonicCompatibility.mockReturnValue(0.9);
    mockBpmCompatibility.mockReturnValue(0.85);
    mockMixCompatibility.mockReturnValue(0.88);
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks") return makeSingleTrackQuery(TRACK_A);
      return {};
    });
  });

  it("10. Missing track_a → 400", async () => {
    const res = await request(app).get("/api/dj/mix-score?track_b=t-bbb");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/track_a/);
  });

  it("11. Missing track_b → 400", async () => {
    const res = await request(app).get("/api/dj/mix-score?track_a=t-aaa");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/track_b/);
  });

  it("12. Valid request → 200 with score fields", async () => {
    mockFrom.mockImplementation(() => makeSingleTrackQuery(TRACK_A));
    const res = await request(app).get("/api/dj/mix-score?track_a=t-aaa&track_b=t-bbb");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      bpm_score:      expect.any(Number),
      harmonic_score: expect.any(Number),
      overall_score:  expect.any(Number),
      compatible_keys: expect.any(Array),
    });
  });

  it("13. track_a not found → 404", async () => {
    mockFrom.mockImplementationOnce(() => makeSingleTrackQuery(null))
             .mockImplementationOnce(() => makeSingleTrackQuery(TRACK_B));
    const res = await request(app).get("/api/dj/mix-score?track_a=t-missing&track_b=t-bbb");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/track_a/);
  });

  it("14. track_b not found → 404", async () => {
    mockFrom.mockImplementationOnce(() => makeSingleTrackQuery(TRACK_A))
             .mockImplementationOnce(() => makeSingleTrackQuery(null));
    const res = await request(app).get("/api/dj/mix-score?track_a=t-aaa&track_b=t-missing");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/track_b/);
  });

  it("15. Camelot codes included in track_a and track_b response objects", async () => {
    mockFrom.mockImplementation(() => makeSingleTrackQuery(TRACK_A));
    const res = await request(app).get("/api/dj/mix-score?track_a=t-aaa&track_b=t-bbb");
    expect(res.status).toBe(200);
    expect(res.body.track_a).toHaveProperty("camelot");
    expect(res.body.track_b).toHaveProperty("camelot");
  });

});
