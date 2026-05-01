import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

process.env.JWT_SECRET    = "test-secret-aura-x-phase4";
process.env.NEXUS_API_URL = "http://nexus-mock.test";
process.env.GIG_API_KEY   = "test-gig-key";

// ─── Mock Supabase ────────────────────────────────────────────────────────────

const mockFrom = jest.fn();
jest.mock("../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// ─── Mock fetch ───────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// ─── App setup ────────────────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import earningsRouter from "../routes/earnings";

const app = express();
app.use(express.json());
app.use("/api/earnings", earningsRouter);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeToken(artistId = "producer-001") {
  return jwt.sign({ artist_id: artistId, email: "producer@test.com" }, "test-secret-aura-x-phase4", { expiresIn: "1h" });
}

const PAID_SPLITS = [
  {
    id: "split-001",
    track_id: "track-001",
    period: "2026-05",
    total_amount_usd: 100,
    splits: [
      { artist_id: "producer-001", role: "producer", amount_usd: 80 },
      { artist_id: "platform",     role: "platform",  amount_usd: 20 },
    ],
    status: "PAID",
    created_at: "2026-05-01T10:00:00Z",
  },
  {
    id: "split-002",
    track_id: "track-002",
    period: "2026-05",
    total_amount_usd: 150,
    splits: [
      { artist_id: "producer-001", role: "producer", amount_usd: 120 },
      { artist_id: "platform",     role: "platform",  amount_usd:  30 },
    ],
    status: "PAID",
    created_at: "2026-05-02T10:00:00Z",
  },
];

const NEXUS_PAYOUT = { processed: true, txId: "AURA-withdraw-001", zarAmount: 7360, netZAR: 7183 };

function makeHistoryMock(data = PAID_SPLITS) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockResolvedValue({ data, error: null }),
  };
}

function makeSummaryMock(data = PAID_SPLITS) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({ data, error: null }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/earnings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockImplementation(() => makeSummaryMock());
  });

  it("1. Returns 401 with no auth token", async () => {
    const res = await request(app).get("/api/earnings");
    expect(res.status).toBe(401);
  });

  it("2. Returns 200 with correct totals for authenticated producer", async () => {
    const token = makeToken();
    const res   = await request(app).get("/api/earnings").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.artist_id).toBe("producer-001");
    expect(res.body.total_earned).toBe(200);   // 80 + 120
    expect(res.body.split_count).toBe(2);
    expect(res.body.track_count).toBe(2);
  });

  it("3. Returns zero totals when producer has no splits", async () => {
    mockFrom.mockImplementation(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: [], error: null }),
    }));
    const token = makeToken("unknown-producer");
    const res   = await request(app).get("/api/earnings").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total_earned).toBe(0);
    expect(res.body.split_count).toBe(0);
    expect(res.body.track_count).toBe(0);
  });
});

describe("GET /api/earnings/history", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockImplementation(() => makeHistoryMock());
  });

  it("4. Returns 401 with no auth token", async () => {
    const res = await request(app).get("/api/earnings/history");
    expect(res.status).toBe(401);
  });

  it("5. Returns 200 with history rows filtered to authenticated artist", async () => {
    const token = makeToken();
    const res   = await request(app).get("/api/earnings/history").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.history)).toBe(true);
    expect(res.body.history.length).toBe(2);
    expect(res.body.history[0].amount_usd).toBe(80);
    expect(res.body.history[0].role).toBe("producer");
  });

  it("6. History row has required fields", async () => {
    const token = makeToken();
    const res   = await request(app).get("/api/earnings/history").set("Authorization", `Bearer ${token}`);
    const row = res.body.history[0];
    expect(row).toHaveProperty("split_id");
    expect(row).toHaveProperty("track_id");
    expect(row).toHaveProperty("period");
    expect(row).toHaveProperty("amount_usd");
    expect(row).toHaveProperty("status");
    expect(row).toHaveProperty("created_at");
  });

  it("7. Returns empty history for producer with no matching splits", async () => {
    const token = makeToken("other-producer");
    const res   = await request(app).get("/api/earnings/history").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.history).toEqual([]);
  });
});

describe("POST /api/earnings/withdraw", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockImplementation(() => makeSummaryMock());
    mockFetch.mockResolvedValue({ ok: true, json: async () => NEXUS_PAYOUT });
  });

  it("8. Returns 401 with no auth token", async () => {
    const res = await request(app).post("/api/earnings/withdraw").send({ amount_usd: 50 });
    expect(res.status).toBe(401);
  });

  it("9. Returns 400 for missing or invalid amount_usd", async () => {
    const token = makeToken();
    const res   = await request(app)
      .post("/api/earnings/withdraw")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount_usd: -10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive/i);
  });

  it("10. Returns 422 when withdrawal exceeds available balance", async () => {
    const token = makeToken();
    const res   = await request(app)
      .post("/api/earnings/withdraw")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount_usd: 999 });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/exceeds/i);
    expect(res.body.available).toBe(200);
  });

  it("11. Returns 200 with WITHDRAWN status and NEXUS tx_id on success", async () => {
    const token = makeToken();
    const res   = await request(app)
      .post("/api/earnings/withdraw")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount_usd: 100 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("WITHDRAWN");
    expect(res.body.amount_usd).toBe(100);
    expect(res.body.nexus_tx_id).toBe("AURA-withdraw-001");
  });

  it("12. NEXUS called with correct API key and amount", async () => {
    const token = makeToken();
    await request(app)
      .post("/api/earnings/withdraw")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount_usd: 50 });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://nexus-mock.test/api/creator/aura-payout",
      expect.objectContaining({ headers: expect.objectContaining({ "x-gig-api-key": "test-gig-key" }) })
    );
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.amountUSD).toBe(50);
  });

  it("13. Returns 502 when NEXUS call fails", async () => {
    mockFetch.mockRejectedValue(new Error("NEXUS down"));
    const token = makeToken();
    const res   = await request(app)
      .post("/api/earnings/withdraw")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount_usd: 50 });
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/NEXUS withdrawal failed/i);
  });
});
