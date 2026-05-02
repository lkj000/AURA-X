import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ─── Mock Supabase ────────────────────────────────────────────────────────────

const mockFrom = jest.fn();

jest.mock("../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// ─── Mock @aura-x/ac-ami ─────────────────────────────────────────────────────

const mockValidateAll             = jest.fn();
const mockValidateLineage         = jest.fn();
const mockValidateStyle           = jest.fn();
const mockValidateInstrumentation = jest.fn();
const mockValidateHarmony         = jest.fn();

const PASS  = { passed: true,  issues: [] };
const FAIL  = { passed: false, issues: [{ code: "style_piano_too_busy", severity: "warning", field: "curves.piano_activity", message: "Piano too busy" }] };

jest.mock("@aura-x/ac-ami", () => ({
  validateAll:             (...a: unknown[]) => mockValidateAll(...a),
  validateLineage:         (...a: unknown[]) => mockValidateLineage(...a),
  validateStyle:           (...a: unknown[]) => mockValidateStyle(...a),
  validateInstrumentation: (...a: unknown[]) => mockValidateInstrumentation(...a),
  validateHarmony:         (...a: unknown[]) => mockValidateHarmony(...a),
}));

// ─── Build app ───────────────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import { trackValidateRouter, validateRouter } from "../routes/validate";

const app = express();
app.use(express.json());
app.use("/api/tracks", trackValidateRouter);
app.use("/api/validate", validateRouter);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TRACK_ID = "track-aaa-001";
const FAKE_CTL = { global: { bpm: 112, key: "F#m", subgenre: "private_school" }, curves: {}, instrumentation: [], lineage: {} };

function makeCTLQuery(found: boolean) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: found ? { ctl_json: FAKE_CTL, version: 3 } : null,
            error: null,
          }),
        }),
      }),
    }),
  };
}

// ─── GET /api/tracks/:id/validate ────────────────────────────────────────────

describe("GET /api/tracks/:id/validate", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateAll.mockReturnValue(PASS);
    mockValidateLineage.mockReturnValue(PASS);
    mockValidateStyle.mockReturnValue(PASS);
    mockValidateInstrumentation.mockReturnValue(PASS);
    mockValidateHarmony.mockReturnValue(PASS);
    mockFrom.mockImplementation(() => makeCTLQuery(true));
  });

  it("1. No active CTL → 404", async () => {
    mockFrom.mockImplementation(() => makeCTLQuery(false));
    const res = await request(app).get(`/api/tracks/${TRACK_ID}/validate`);
    expect(res.status).toBe(404);
  });

  it("2. Returns 200 with overall and domains", async () => {
    const res = await request(app).get(`/api/tracks/${TRACK_ID}/validate`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      track_id:    TRACK_ID,
      ctl_version: 3,
      overall:     expect.any(Object),
      domains:     expect.any(Object),
    });
  });

  it("3. overall.passed true when all domains pass", async () => {
    const res = await request(app).get(`/api/tracks/${TRACK_ID}/validate`);
    expect(res.body.overall.passed).toBe(true);
    expect(res.body.overall.issue_count).toBe(0);
  });

  it("4. overall.passed false when validateAll returns issues", async () => {
    mockValidateAll.mockReturnValue(FAIL);
    const res = await request(app).get(`/api/tracks/${TRACK_ID}/validate`);
    expect(res.body.overall.passed).toBe(false);
    expect(res.body.overall.issue_count).toBe(1);
  });

  it("5. domains has lineage, style, instrumentation, harmony keys", async () => {
    const res = await request(app).get(`/api/tracks/${TRACK_ID}/validate`);
    expect(res.body.domains).toHaveProperty("lineage");
    expect(res.body.domains).toHaveProperty("style");
    expect(res.body.domains).toHaveProperty("instrumentation");
    expect(res.body.domains).toHaveProperty("harmony");
  });

  it("6. Each domain entry has passed, issue_count, issues", async () => {
    const res = await request(app).get(`/api/tracks/${TRACK_ID}/validate`);
    for (const domain of Object.values(res.body.domains) as Record<string, unknown>[]) {
      expect(typeof domain.passed).toBe("boolean");
      expect(typeof domain.issue_count).toBe("number");
      expect(Array.isArray(domain.issues)).toBe(true);
    }
  });

  it("7. Per-domain failure reflected independently", async () => {
    mockValidateStyle.mockReturnValue(FAIL);
    const res = await request(app).get(`/api/tracks/${TRACK_ID}/validate`);
    expect(res.body.domains.style.passed).toBe(false);
    expect(res.body.domains.style.issue_count).toBe(1);
    expect(res.body.domains.lineage.passed).toBe(true);
  });

  it("8. validateAll called with the fetched CTL object", async () => {
    await request(app).get(`/api/tracks/${TRACK_ID}/validate`);
    expect(mockValidateAll).toHaveBeenCalledWith(FAKE_CTL);
  });

});

// ─── POST /api/validate/ctl ───────────────────────────────────────────────────

describe("POST /api/validate/ctl", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateAll.mockReturnValue(PASS);
    mockValidateLineage.mockReturnValue(PASS);
    mockValidateStyle.mockReturnValue(PASS);
    mockValidateInstrumentation.mockReturnValue(PASS);
    mockValidateHarmony.mockReturnValue(PASS);
  });

  it("9. Missing ctl → 400", async () => {
    const res = await request(app).post("/api/validate/ctl").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ctl/);
  });

  it("10. ctl is a string → 400", async () => {
    const res = await request(app).post("/api/validate/ctl").send({ ctl: "not-an-object" });
    expect(res.status).toBe(400);
  });

  it("11. Returns 200 with overall and domains", async () => {
    const res = await request(app).post("/api/validate/ctl").send({ ctl: FAKE_CTL });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      overall: expect.any(Object),
      domains: expect.any(Object),
    });
  });

  it("12. No track_id or ctl_version in response", async () => {
    const res = await request(app).post("/api/validate/ctl").send({ ctl: FAKE_CTL });
    expect(res.body).not.toHaveProperty("track_id");
    expect(res.body).not.toHaveProperty("ctl_version");
  });

  it("13. validateAll called with submitted CTL", async () => {
    await request(app).post("/api/validate/ctl").send({ ctl: FAKE_CTL });
    expect(mockValidateAll).toHaveBeenCalledWith(FAKE_CTL);
  });

  it("14. Issues surfaced in overall when validation fails", async () => {
    mockValidateAll.mockReturnValue(FAIL);
    mockValidateStyle.mockReturnValue(FAIL);
    const res = await request(app).post("/api/validate/ctl").send({ ctl: FAKE_CTL });
    expect(res.body.overall.passed).toBe(false);
    expect(res.body.overall.issues.length).toBeGreaterThan(0);
    expect(res.body.overall.issues[0].code).toBe("style_piano_too_busy");
  });

  it("15. No Supabase calls on POST /api/validate/ctl", async () => {
    await request(app).post("/api/validate/ctl").send({ ctl: FAKE_CTL });
    expect(mockFrom).not.toHaveBeenCalled();
  });

});
