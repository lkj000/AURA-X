import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ─── Mock Supabase ────────────────────────────────────────────────────────────

const mockFrom = jest.fn();

jest.mock("../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// ─── Mock @aura-x/ac-ami ─────────────────────────────────────────────────────

const mockEvaluateSignal = jest.fn();

jest.mock("@aura-x/ac-ami", () => ({
  evaluateSignal: (...a: unknown[]) => mockEvaluateSignal(...a),
}));

// ─── Build app ───────────────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import signalRouter from "../routes/signal";

const app = express();
app.use(express.json());
app.use("/api/tracks", signalRouter);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TRACK_ID = "track-aaa-001";
const FAKE_CTL = { global: { bpm: 112, key: "F#m", subgenre: "private_school" }, curves: {}, instrumentation: [], lineage: {}, evaluation_targets: { authenticity_target: 0.72 } };

const FAKE_SCORE: Record<string, unknown> = {
  bpm_accuracy:           1.0,
  key_accuracy:           1.0,
  energy_accuracy:        0.85,
  groove_density_score:   0.9,
  cultural_signal_score:  0.75,
  signal_composite_score: 0.89,
  bpm_gap:                0,
  key_match:              true,
  energy_gap:             0.05,
  passed_signal_gate:     true,
  signal_notes:           [],
};

const VALID_BODY = {
  bpm:           112,
  key:           "F#m",
  energy_mean:   0.71,
  onset_density: 5.2,
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

// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/tracks/:id/signal", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockEvaluateSignal.mockReturnValue(FAKE_SCORE);
    mockFrom.mockImplementation(() => makeCTLQuery(true));
  });

  // ─── Validation ────────────────────────────────────────────────────────────

  it("1. Missing bpm → 400 with field name", async () => {
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/signal`).send({ key: "F#m", energy_mean: 0.7, onset_density: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/bpm/);
  });

  it("2. Missing key → 400", async () => {
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/signal`).send({ bpm: 112, energy_mean: 0.7, onset_density: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/key/);
  });

  it("3. Missing energy_mean → 400", async () => {
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/signal`).send({ bpm: 112, key: "F#m", onset_density: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/energy_mean/);
  });

  it("4. Missing onset_density → 400", async () => {
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/signal`).send({ bpm: 112, key: "F#m", energy_mean: 0.7 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/onset_density/);
  });

  it("5. Non-numeric bpm → 400", async () => {
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/signal`).send({ ...VALID_BODY, bpm: "fast" });
    expect(res.status).toBe(400);
  });

  // ─── CTL fetch ─────────────────────────────────────────────────────────────

  it("6. No active CTL → 404", async () => {
    mockFrom.mockImplementation(() => makeCTLQuery(false));
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/signal`).send(VALID_BODY);
    expect(res.status).toBe(404);
  });

  // ─── Happy path ────────────────────────────────────────────────────────────

  it("7. Returns 200 with track_id, ctl_version, observed, score_report", async () => {
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/signal`).send(VALID_BODY);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      track_id:    TRACK_ID,
      ctl_version: 5,
      observed:    expect.any(Object),
      score_report: expect.any(Object),
    });
  });

  it("8. evaluateSignal called with fetched CTL and observed features", async () => {
    await request(app).post(`/api/tracks/${TRACK_ID}/signal`).send(VALID_BODY);
    expect(mockEvaluateSignal).toHaveBeenCalledWith(
      FAKE_CTL,
      expect.objectContaining({ bpm: 112, key: "F#m", energy_mean: 0.71, onset_density: 5.2 }),
    );
  });

  it("9. score_report fields present", async () => {
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/signal`).send(VALID_BODY);
    const r = res.body.score_report;
    expect(typeof r.bpm_accuracy).toBe("number");
    expect(typeof r.signal_composite_score).toBe("number");
    expect(typeof r.passed_signal_gate).toBe("boolean");
    expect(Array.isArray(r.signal_notes)).toBe(true);
  });

  it("10. observed object echoed back in response", async () => {
    const res = await request(app).post(`/api/tracks/${TRACK_ID}/signal`).send(VALID_BODY);
    expect(res.body.observed.bpm).toBe(112);
    expect(res.body.observed.key).toBe("F#m");
    expect(res.body.observed.energy_mean).toBe(0.71);
    expect(res.body.observed.onset_density).toBe(5.2);
  });

  it("11. Optional low_mid_ratio forwarded to evaluateSignal", async () => {
    await request(app).post(`/api/tracks/${TRACK_ID}/signal`).send({ ...VALID_BODY, low_mid_ratio: 0.18 });
    const [, observed] = (mockEvaluateSignal as jest.Mock).mock.calls[0];
    expect(observed.low_mid_ratio).toBeCloseTo(0.18);
  });

  it("12. Optional spectral_centroid_hz forwarded", async () => {
    await request(app).post(`/api/tracks/${TRACK_ID}/signal`).send({ ...VALID_BODY, spectral_centroid_hz: 3200 });
    const [, observed] = (mockEvaluateSignal as jest.Mock).mock.calls[0];
    expect(observed.spectral_centroid_hz).toBe(3200);
  });

  it("13. bpm_confidence defaults to 1 when not provided", async () => {
    await request(app).post(`/api/tracks/${TRACK_ID}/signal`).send(VALID_BODY);
    const [, observed] = (mockEvaluateSignal as jest.Mock).mock.calls[0];
    expect(observed.bpm_confidence).toBe(1);
  });

  it("14. duration_sec defaults to 30 when not provided", async () => {
    await request(app).post(`/api/tracks/${TRACK_ID}/signal`).send(VALID_BODY);
    const [, observed] = (mockEvaluateSignal as jest.Mock).mock.calls[0];
    expect(observed.duration_sec).toBe(30);
  });

  it("15. energy_peak defaults to energy_mean when not provided", async () => {
    await request(app).post(`/api/tracks/${TRACK_ID}/signal`).send(VALID_BODY);
    const [, observed] = (mockEvaluateSignal as jest.Mock).mock.calls[0];
    expect(observed.energy_peak).toBeCloseTo(observed.energy_mean);
  });

});
