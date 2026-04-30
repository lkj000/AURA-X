import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ─── Mock Supabase ────────────────────────────────────────────────────────────

const mockMaybeSingle = jest.fn();
const mockSelectDup   = jest.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
const mockEqDup       = jest.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });

const mockSingleFb    = jest.fn();
const mockSelectFb    = jest.fn().mockReturnValue({ single: mockSingleFb });
const mockInsertFb    = jest.fn().mockReturnValue({ select: mockSelectFb });

const mockInsertGold  = jest.fn().mockResolvedValue({ data: {}, error: null });

const mockFrom = jest.fn();

jest.mock("../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// ─── Build app ───────────────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import feedbackRouter from "../routes/feedback";

const app = express();
app.use(express.json());
app.use("/api/feedback", feedbackRouter);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TRACK_ID      = "track-aaaaaaaa-0000-0000-0000-000000000001";
const GENERATION_ID = "gen-bbbbbbbb-0000-0000-0000-000000000002";
const CTL_SNAPSHOT  = { global: { bpm: 112, key: "F#m" } };

function makeBody(overrides: Record<string, unknown> = {}) {
  return {
    track_id:      TRACK_ID,
    generation_id: GENERATION_ID,
    rating:        4,
    ctl_snapshot:  CTL_SNAPSHOT,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/feedback/rate", () => {

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: no duplicate
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    // Default from routing: producer_feedback → no dup, then insert
    mockFrom.mockImplementation((table: string) => {
      if (table === "producer_feedback") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
          insert: mockInsertFb,
        };
      }
      if (table === "gold_standard_generations") {
        return { insert: mockInsertGold };
      }
      return {};
    });

    // Default fb insert returns a valid id
    mockSingleFb.mockResolvedValue({ data: { id: "fb-id-001" }, error: null });
    mockInsertFb.mockReturnValue({ select: mockSelectFb });
    mockSelectFb.mockReturnValue({ single: mockSingleFb });
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it("1. Missing track_id → 400", async () => {
    const res = await request(app).post("/api/feedback/rate").send(
      makeBody({ track_id: undefined })
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/track_id/);
  });

  it("2. Missing generation_id → 400", async () => {
    const res = await request(app).post("/api/feedback/rate").send(
      makeBody({ generation_id: undefined })
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/generation_id/);
  });

  it("3. Rating 0 → 400", async () => {
    const res = await request(app).post("/api/feedback/rate").send(makeBody({ rating: 0 }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rating/);
  });

  it("4. Rating 6 → 400", async () => {
    const res = await request(app).post("/api/feedback/rate").send(makeBody({ rating: 6 }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rating/);
  });

  it("5. Rating is a string → 400", async () => {
    const res = await request(app).post("/api/feedback/rate").send(makeBody({ rating: "five" }));
    expect(res.status).toBe(400);
  });

  // ── Duplicate guard ──────────────────────────────────────────────────────────

  it("6. Duplicate generation_id → 409", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: "existing-fb" }, error: null });
    const res = await request(app).post("/api/feedback/rate").send(makeBody());
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already rated/);
    expect(res.body.generation_id).toBe(GENERATION_ID);
  });

  // ── Happy paths ─────────────────────────────────────────────────────────────

  it("7. Rating 4 + ctl_snapshot → 200, promoted_to_gold: true", async () => {
    const res = await request(app).post("/api/feedback/rate").send(makeBody({ rating: 4 }));
    expect(res.status).toBe(200);
    expect(res.body.promoted_to_gold).toBe(true);
    expect(res.body.feedback_id).toBe("fb-id-001");
  });

  it("8. Rating 5 + ctl_snapshot → promoted_to_gold: true and gold insert called", async () => {
    const res = await request(app).post("/api/feedback/rate").send(makeBody({ rating: 5 }));
    expect(res.status).toBe(200);
    expect(res.body.promoted_to_gold).toBe(true);
    expect(mockInsertGold).toHaveBeenCalledTimes(1);
    expect(mockInsertGold).toHaveBeenCalledWith(
      expect.objectContaining({ generation_id: GENERATION_ID, producer_score: 5 })
    );
  });

  it("9. Rating 3 → promoted_to_gold: false, gold insert NOT called", async () => {
    const res = await request(app).post("/api/feedback/rate").send(makeBody({ rating: 3, ctl_snapshot: CTL_SNAPSHOT }));
    expect(res.status).toBe(200);
    expect(res.body.promoted_to_gold).toBe(false);
    expect(mockInsertGold).not.toHaveBeenCalled();
  });

  it("10. Rating 4 without ctl_snapshot → promoted_to_gold: false", async () => {
    const res = await request(app).post("/api/feedback/rate").send(
      makeBody({ rating: 4, ctl_snapshot: undefined })
    );
    expect(res.status).toBe(200);
    expect(res.body.promoted_to_gold).toBe(false);
    expect(mockInsertGold).not.toHaveBeenCalled();
  });

});
