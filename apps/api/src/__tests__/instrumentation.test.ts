import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ─── Mock Supabase ────────────────────────────────────────────────────────────

const mockFrom = jest.fn();

jest.mock("../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// ─── Mock @aura-x/ac-ami ─────────────────────────────────────────────────────

const mockPlanInstrumentation       = jest.fn();
const mockApplyInstrumentationPlan  = jest.fn();

jest.mock("@aura-x/ac-ami", () => ({
  planInstrumentation:      (...a: unknown[]) => mockPlanInstrumentation(...a),
  applyInstrumentationPlan: (...a: unknown[]) => mockApplyInstrumentationPlan(...a),
}));

// ─── Mock auth ────────────────────────────────────────────────────────────────

jest.mock("../middleware/auth", () => ({
  verifyToken: (_r: unknown, _s: unknown, next: () => void) => next(),
}));

// ─── Build app ───────────────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import instrumentationRouter from "../routes/instrumentation";

const app = express();
app.use(express.json());
app.use("/api/tracks", instrumentationRouter);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TRACK_ID = "track-aaa-001";
const FAKE_CTL = { global: { bpm: 112, key: "F#m", subgenre: "private_school" }, curves: {}, instrumentation: [], lineage: {} };
const FAKE_INSTRUMENTS = [
  { family: "log_drum",  patch_class: "private_school_soft_log", body_weight: 0.72 },
  { family: "piano",     patch_class: "luxury_grand_piano",      body_weight: 0.55 },
];
const UPDATED_CTL = { ...FAKE_CTL, instrumentation: FAKE_INSTRUMENTS };

function makeCTLQuery(found: boolean) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: found ? { ctl_json: FAKE_CTL, version: 4 } : null,
            error: null,
          }),
        }),
      }),
    }),
  };
}

function makeUpdateQuery() {
  return {
    update: () => ({
      eq: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  };
}

// ─── POST /api/tracks/:id/instrumentation/plan ───────────────────────────────

describe("POST /api/tracks/:id/instrumentation/plan", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockPlanInstrumentation.mockReturnValue(FAKE_INSTRUMENTS);
    mockFrom.mockImplementation(() => makeCTLQuery(true));
  });

  it("1. No active CTL → 404", async () => {
    mockFrom.mockImplementation(() => makeCTLQuery(false));
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/instrumentation/plan`);
    expect(res.status).toBe(404);
  });

  it("2. Returns 200 with track_id, ctl_version, instruments array", async () => {
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/instrumentation/plan`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      track_id:    TRACK_ID,
      ctl_version: 4,
      instruments: expect.any(Array),
    });
  });

  it("3. planInstrumentation called with fetched CTL", async () => {
    await request(app).post(`/api/tracks/${TRACK_ID}/instrumentation/plan`);
    expect(mockPlanInstrumentation).toHaveBeenCalledWith(FAKE_CTL, expect.any(Object));
  });

  it("4. ?warmth=0.8 passed to planInstrumentation", async () => {
    await request(app).post(`/api/tracks/${TRACK_ID}/instrumentation/plan?warmth=0.8`);
    const [, opts] = (mockPlanInstrumentation as jest.Mock).mock.calls[0];
    expect(opts.warmth).toBeCloseTo(0.8);
  });

  it("5. ?rawness=0.3 passed to planInstrumentation", async () => {
    await request(app).post(`/api/tracks/${TRACK_ID}/instrumentation/plan?rawness=0.3`);
    const [, opts] = (mockPlanInstrumentation as jest.Mock).mock.calls[0];
    expect(opts.rawness).toBeCloseTo(0.3);
  });

  it("6. ?vocalMode=chant passed through", async () => {
    await request(app).post(`/api/tracks/${TRACK_ID}/instrumentation/plan?vocalMode=chant`);
    const [, opts] = (mockPlanInstrumentation as jest.Mock).mock.calls[0];
    expect(opts.vocalMode).toBe("chant");
  });

  it("7. ?includeMbira=true parsed as boolean", async () => {
    await request(app).post(`/api/tracks/${TRACK_ID}/instrumentation/plan?includeMbira=true`);
    const [, opts] = (mockPlanInstrumentation as jest.Mock).mock.calls[0];
    expect(opts.includeMbira).toBe(true);
  });

  it("8. Invalid vocalMode ignored (not passed in opts)", async () => {
    await request(app).post(`/api/tracks/${TRACK_ID}/instrumentation/plan?vocalMode=scream`);
    const [, opts] = (mockPlanInstrumentation as jest.Mock).mock.calls[0];
    expect(opts.vocalMode).toBeUndefined();
  });

});

// ─── POST /api/tracks/:id/instrumentation/apply ──────────────────────────────

describe("POST /api/tracks/:id/instrumentation/apply", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockApplyInstrumentationPlan.mockReturnValue(UPDATED_CTL);
    mockFrom.mockImplementation(() => makeCTLQuery(true));
  });

  it("9. No active CTL → 404", async () => {
    mockFrom.mockImplementation(() => makeCTLQuery(false));
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/instrumentation/apply`).send({});
    expect(res.status).toBe(404);
  });

  it("10. Returns 200 with persisted, ctl_version, ctl", async () => {
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/instrumentation/apply`).send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      persisted:   false,
      ctl_version: 4,
      ctl:         expect.any(Object),
    });
  });

  it("11. applyInstrumentationPlan called with fetched CTL", async () => {
    await request(app).post(`/api/tracks/${TRACK_ID}/instrumentation/apply`).send({});
    expect(mockApplyInstrumentationPlan).toHaveBeenCalledWith(FAKE_CTL, expect.any(Object));
  });

  it("12. Body options forwarded to applyInstrumentationPlan", async () => {
    await request(app)
      .post(`/api/tracks/${TRACK_ID}/instrumentation/apply`)
      .send({ warmth: 0.9, rawness: 0.2 });
    const [, opts] = (mockApplyInstrumentationPlan as jest.Mock).mock.calls[0];
    expect(opts.warmth).toBeCloseTo(0.9);
    expect(opts.rawness).toBeCloseTo(0.2);
  });

  it("13. persist:false → persisted:false, version unchanged, no insert", async () => {
    let insertCalled = false;
    mockFrom.mockImplementation(() => ({
      ...makeCTLQuery(true),
      insert: () => { insertCalled = true; return Promise.resolve({ error: null }); },
    }));
    const res = await request(app)
      .post(`/api/tracks/${TRACK_ID}/instrumentation/apply`)
      .send({ persist: false });
    expect(res.body.persisted).toBe(false);
    expect(res.body.ctl_version).toBe(4);
    expect(insertCalled).toBe(false);
  });

  it("14. persist:true → persisted:true, version incremented", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "ctls") return {
        select: makeCTLQuery(true).select,
        update: makeUpdateQuery().update,
        insert: () => Promise.resolve({ error: null }),
      };
      return {};
    });
    const res = await request(app)
      .post(`/api/tracks/${TRACK_ID}/instrumentation/apply`)
      .send({ persist: true });
    expect(res.body.persisted).toBe(true);
    expect(res.body.ctl_version).toBe(5);
  });

  it("15. Updated CTL contains new instrumentation from applyInstrumentationPlan", async () => {
    const res = await request(app)
      .post(`/api/tracks/${TRACK_ID}/instrumentation/apply`)
      .send({});
    expect(res.body.ctl.instrumentation).toEqual(FAKE_INSTRUMENTS);
  });

});
