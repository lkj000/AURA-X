import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ─── Mock Supabase ────────────────────────────────────────────────────────────

const mockFrom = jest.fn();

jest.mock("../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// ─── Mock @aura-x/ac-ami ─────────────────────────────────────────────────────

const mockValidateAll         = jest.fn();
const mockRecommendMutations  = jest.fn();
const mockApplyMutations      = jest.fn();
const mockRepairCTL           = jest.fn();

jest.mock("@aura-x/ac-ami", () => ({
  validateAll:        (...a: unknown[]) => mockValidateAll(...a),
  recommendMutations: (...a: unknown[]) => mockRecommendMutations(...a),
  applyMutations:     (...a: unknown[]) => mockApplyMutations(...a),
  repairCTL:          (...a: unknown[]) => mockRepairCTL(...a),
}));

// ─── Mock auth middleware ─────────────────────────────────────────────────────

jest.mock("../middleware/auth", () => ({
  verifyToken: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ─── Build app ───────────────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import mutationRouter from "../routes/mutation";

const app = express();
app.use(express.json());
app.use("/api/tracks", mutationRouter);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TRACK_ID  = "track-aaa-001";
const FAKE_CTL  = { global: { bpm: 112, key: "F#m", subgenre: "private_school" }, curves: {}, instrumentation: [], lineage: {} };
const FAKE_ISSUES = [
  { code: "style_piano_too_busy",  severity: "warning", message: "Piano too busy" },
];
const FAKE_LOG    = [{ mutationId: "reduce_piano_busyness", applied: true, reason: "Scaled piano_activity curves down 25%", ctl: FAKE_CTL }];

function makeCTLQuery(found: boolean) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: found ? { ctl_json: FAKE_CTL, version: 2 } : null,
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
      eq: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
  };
}

function makeInsertQuery(fail = false) {
  return {
    insert: () => Promise.resolve({ error: fail ? { message: "DB insert failed" } : null }),
  };
}

// ─── POST /api/tracks/:id/mutate/recommend ───────────────────────────────────

describe("POST /api/tracks/:id/mutate/recommend", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateAll.mockReturnValue({ passed: false, issues: FAKE_ISSUES });
    mockRecommendMutations.mockReturnValue(["reduce_piano_busyness"]);
    mockFrom.mockImplementation(() => makeCTLQuery(true));
  });

  it("1. No active CTL → 404", async () => {
    mockFrom.mockImplementation(() => makeCTLQuery(false));
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/mutate/recommend`);
    expect(res.status).toBe(404);
  });

  it("2. Returns 200 with required fields", async () => {
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/mutate/recommend`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      track_id:              TRACK_ID,
      ctl_version:           2,
      validation:            expect.any(Object),
      recommended_mutations: expect.any(Array),
    });
  });

  it("3. validation.passed reflects validateAll result", async () => {
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/mutate/recommend`);
    expect(res.body.validation.passed).toBe(false);
    expect(res.body.validation.issue_count).toBe(1);
  });

  it("4. validateAll called with fetched CTL", async () => {
    await request(app).post(`/api/tracks/${TRACK_ID}/mutate/recommend`);
    expect(mockValidateAll).toHaveBeenCalledWith(FAKE_CTL);
  });

  it("5. recommended_mutations forwarded from recommendMutations", async () => {
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/mutate/recommend`);
    expect(res.body.recommended_mutations).toEqual(["reduce_piano_busyness"]);
  });

  it("6. No mutations when CTL passes validation", async () => {
    mockValidateAll.mockReturnValue({ passed: true, issues: [] });
    mockRecommendMutations.mockReturnValue([]);
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/mutate/recommend`);
    expect(res.body.validation.passed).toBe(true);
    expect(res.body.recommended_mutations).toHaveLength(0);
  });

});

// ─── POST /api/tracks/:id/mutate/apply ───────────────────────────────────────

describe("POST /api/tracks/:id/mutate/apply", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockApplyMutations.mockReturnValue({ ctl: FAKE_CTL, log: FAKE_LOG });
    mockFrom.mockImplementation(() => makeCTLQuery(true));
  });

  it("7. Missing mutations → 400", async () => {
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/mutate/apply`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mutations/);
  });

  it("8. Empty mutations array → 400", async () => {
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/mutate/apply`).send({ mutations: [] });
    expect(res.status).toBe(400);
  });

  it("9. No active CTL → 404", async () => {
    mockFrom.mockImplementation(() => makeCTLQuery(false));
    const res = await request(app)
      .post(`/api/tracks/${TRACK_ID}/mutate/apply`)
      .send({ mutations: ["reduce_piano_busyness"] });
    expect(res.status).toBe(404);
  });

  it("10. Returns 200 with log and ctl", async () => {
    const res = await request(app)
      .post(`/api/tracks/${TRACK_ID}/mutate/apply`)
      .send({ mutations: ["reduce_piano_busyness"] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ log: expect.any(Array), ctl: expect.any(Object) });
  });

  it("11. persist:false → persisted:false, version unchanged", async () => {
    const res = await request(app)
      .post(`/api/tracks/${TRACK_ID}/mutate/apply`)
      .send({ mutations: ["reduce_piano_busyness"], persist: false });
    expect(res.body.persisted).toBe(false);
    expect(res.body.ctl_version).toBe(2);
  });

  it("12. persist:true → persisted:true, version incremented, Supabase insert called", async () => {
    let insertCalled = false;
    mockFrom.mockImplementation((table: string) => {
      if (table === "ctls") {
        return {
          select: makeCTLQuery(true).select,
          update: makeUpdateQuery().update,
          insert: () => { insertCalled = true; return Promise.resolve({ error: null }); },
        };
      }
      return {};
    });
    const res = await request(app)
      .post(`/api/tracks/${TRACK_ID}/mutate/apply`)
      .send({ mutations: ["reduce_piano_busyness"], persist: true });
    expect(res.body.persisted).toBe(true);
    expect(res.body.ctl_version).toBe(3);
    expect(insertCalled).toBe(true);
  });

});

// ─── POST /api/tracks/:id/mutate/repair ──────────────────────────────────────

describe("POST /api/tracks/:id/mutate/repair", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepairCTL.mockReturnValue({ ctl: FAKE_CTL, iterations: 2, log: FAKE_LOG, passed: true });
    mockFrom.mockImplementation(() => makeCTLQuery(true));
  });

  it("13. No active CTL → 404", async () => {
    mockFrom.mockImplementation(() => makeCTLQuery(false));
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/mutate/repair`).send({});
    expect(res.status).toBe(404);
  });

  it("14. Returns 200 with passed, iterations, log, ctl", async () => {
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/mutate/repair`).send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      passed:     true,
      iterations: 2,
      log:        expect.any(Array),
      ctl:        expect.any(Object),
    });
  });

  it("15. max_iterations clamped to [1,5] and passed to repairCTL", async () => {
    await request(app).post(`/api/tracks/${TRACK_ID}/mutate/repair`).send({ max_iterations: 99 });
    expect(mockRepairCTL).toHaveBeenCalledWith(FAKE_CTL, 5);

    jest.clearAllMocks();
    mockRepairCTL.mockReturnValue({ ctl: FAKE_CTL, iterations: 1, log: [], passed: true });
    await request(app).post(`/api/tracks/${TRACK_ID}/mutate/repair`).send({ max_iterations: 0 });
    expect(mockRepairCTL).toHaveBeenCalledWith(FAKE_CTL, 1);
  });

});
