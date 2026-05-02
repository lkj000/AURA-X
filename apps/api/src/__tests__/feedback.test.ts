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

// ─── GET /api/feedback/insights ───────────────────────────────────────────────

const GOLD_RECORDS = [
  { subgenre: "private_school", key: "F#m", bpm: 112, producer_score: 5 },
  { subgenre: "private_school", key: "Am",  bpm: 110, producer_score: 4 },
  { subgenre: "sgija",          key: "F#m", bpm: 120, producer_score: 4 },
  { subgenre: "bacardi",        key: "C",   bpm: 118, producer_score: 3 },
];

describe("GET /api/feedback/insights", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === "gold_standard_generations") {
        return { select: () => Promise.resolve({ data: GOLD_RECORDS, error: null }) };
      }
      return {};
    });
  });

  it("11. Returns 200 with expected top-level fields", async () => {
    const res = await request(app).get("/api/feedback/insights");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total_gold:       expect.any(Number),
      top_lanes:        expect.any(Array),
      top_keys:         expect.any(Array),
    });
  });

  it("12. total_gold equals number of gold records", async () => {
    const res = await request(app).get("/api/feedback/insights");
    expect(res.body.total_gold).toBe(GOLD_RECORDS.length);
  });

  it("13. top_lanes sorted by avg_score descending", async () => {
    const res = await request(app).get("/api/feedback/insights");
    const lanes = res.body.top_lanes as { avg_score: number }[];
    for (let i = 1; i < lanes.length; i++) {
      expect(lanes[i].avg_score).toBeLessThanOrEqual(lanes[i - 1].avg_score);
    }
  });

  it("14. top_lanes contains correct lane names", async () => {
    const res = await request(app).get("/api/feedback/insights");
    const names = (res.body.top_lanes as { lane: string }[]).map(l => l.lane);
    expect(names).toContain("private_school");
    expect(names).toContain("sgija");
    expect(names).toContain("bacardi");
  });

  it("15. Each top_lanes entry has lane, avg_score, count", async () => {
    const res = await request(app).get("/api/feedback/insights");
    for (const l of res.body.top_lanes as Record<string, unknown>[]) {
      expect(typeof l.lane).toBe("string");
      expect(typeof l.avg_score).toBe("number");
      expect(typeof l.count).toBe("number");
    }
  });

  it("16. top_keys sorted by avg_score descending", async () => {
    const res = await request(app).get("/api/feedback/insights");
    const keys = res.body.top_keys as { avg_score: number }[];
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i].avg_score).toBeLessThanOrEqual(keys[i - 1].avg_score);
    }
  });

  it("17. bpm_distribution has min, max, mean", async () => {
    const res = await request(app).get("/api/feedback/insights");
    expect(res.body.bpm_distribution).toMatchObject({
      min:  expect.any(Number),
      max:  expect.any(Number),
      mean: expect.any(Number),
    });
  });

  it("18. bpm_distribution.min <= mean <= max", async () => {
    const res = await request(app).get("/api/feedback/insights");
    const d = res.body.bpm_distribution as { min: number; max: number; mean: number };
    expect(d.min).toBeLessThanOrEqual(d.mean);
    expect(d.mean).toBeLessThanOrEqual(d.max);
  });

  it("19. Empty gold table → total_gold 0, empty arrays, null bpm_distribution", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "gold_standard_generations") {
        return { select: () => Promise.resolve({ data: [], error: null }) };
      }
      return {};
    });
    const res = await request(app).get("/api/feedback/insights");
    expect(res.status).toBe(200);
    expect(res.body.total_gold).toBe(0);
    expect(res.body.top_lanes).toHaveLength(0);
    expect(res.body.top_keys).toHaveLength(0);
    expect(res.body.bpm_distribution).toBeNull();
  });

  it("20. Supabase error → 500", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "gold_standard_generations") {
        return { select: () => Promise.resolve({ data: null, error: { message: "DB error" } }) };
      }
      return {};
    });
    const res = await request(app).get("/api/feedback/insights");
    expect(res.status).toBe(500);
  });

});

// ─── GET /api/feedback/gold ───────────────────────────────────────────────────

const GOLD_ROWS = [
  { id: "g1", track_id: "t1", generation_id: "gen1", subgenre: "private_school", bpm: 112, key: "F#m", composite_score: 0.88, producer_score: 5, created_at: "2026-05-01T10:00:00Z" },
  { id: "g2", track_id: "t2", generation_id: "gen2", subgenre: "sgija",          bpm: 120, key: "Am",  composite_score: 0.76, producer_score: 4, created_at: "2026-05-01T09:00:00Z" },
];

describe("GET /api/feedback/gold", () => {

  function makeGoldQuery(rows: typeof GOLD_ROWS, total = rows.length) {
    const chainable = {
      order: () => chainable,
      range: () => Promise.resolve({ data: rows, count: total, error: null }),
      eq:    () => chainable,
    };
    return {
      select: () => chainable,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === "gold_standard_generations") return makeGoldQuery(GOLD_ROWS);
      return {};
    });
  });

  it("21. Returns 200 with gold, total, page, limit", async () => {
    const res = await request(app).get("/api/feedback/gold");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      gold:  expect.any(Array),
      total: expect.any(Number),
      page:  1,
      limit: 20,
    });
  });

  it("22. Returns expected gold records", async () => {
    const res = await request(app).get("/api/feedback/gold");
    expect(res.body.gold).toHaveLength(GOLD_ROWS.length);
    expect(res.body.gold[0].id).toBe("g1");
  });

  it("23. ?page=2&limit=1 reflected in response", async () => {
    const res = await request(app).get("/api/feedback/gold?page=2&limit=1");
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(1);
  });

  it("24. ?limit=999 clamped to 50", async () => {
    const res = await request(app).get("/api/feedback/gold?limit=999");
    expect(res.body.limit).toBe(50);
  });

  it("25. Supabase error → 500", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "gold_standard_generations") return {
        select: () => ({
          order: () => ({
            range: () => Promise.resolve({ data: null, count: null, error: { message: "DB down" } }),
          }),
        }),
      };
      return {};
    });
    const res = await request(app).get("/api/feedback/gold");
    expect(res.status).toBe(500);
  });

});
