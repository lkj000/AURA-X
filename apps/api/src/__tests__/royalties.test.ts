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
import royaltiesRouter from "../routes/royalties";

const app = express();
app.use(express.json());
app.use("/api/royalties", royaltiesRouter);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeToken(artistId = "producer-001") {
  return jwt.sign({ artist_id: artistId, email: "producer@test.com" }, "test-secret-aura-x-phase4", { expiresIn: "1h" });
}

const NEXUS_PAYOUT = {
  processed: true,
  txId: "AURA-2026-05-producer-001",
  zarAmount: 1476,
  netZAR: 1439.1,
};

function makeTrackMock(exists = true) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: exists ? { id: "track-001", created_by: "producer-001" } : null,
      error: null,
    }),
  };
}

function makeSplitsMock(existing: unknown = null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: existing, error: null }),
    insert: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: { id: "split-001", status: "PAID" },
      error: null,
    }),
    order: jest.fn().mockResolvedValue({ data: [], error: null }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/royalties/split", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks")         return makeTrackMock();
      if (table === "royalty_splits") return makeSplitsMock();
      return {};
    });
    mockFetch.mockResolvedValue({ ok: true, json: async () => NEXUS_PAYOUT });
  });

  it("1. Returns 401 with no auth token", async () => {
    const res = await request(app).post("/api/royalties/split").send({
      track_id: "track-001", period: "2026-05", total_amount_usd: 100,
    });
    expect(res.status).toBe(401);
  });

  it("2. Returns 400 when required fields missing", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/royalties/split")
      .set("Authorization", `Bearer ${token}`)
      .send({ track_id: "track-001" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it("3. Returns 400 when total_amount_usd is zero or negative", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/royalties/split")
      .set("Authorization", `Bearer ${token}`)
      .send({ track_id: "track-001", period: "2026-05", total_amount_usd: -10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive/i);
  });

  it("4. Returns 400 when collaborator shares exceed 80%", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/royalties/split")
      .set("Authorization", `Bearer ${token}`)
      .send({
        track_id: "track-001", period: "2026-05", total_amount_usd: 100,
        collaborators: [{ artist_id: "collab-001", share_pct: 85 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/collaborator/i);
  });

  it("5. Returns 404 when track not found", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks")         return makeTrackMock(false);
      if (table === "royalty_splits") return makeSplitsMock();
      return {};
    });
    const token = makeToken();
    const res = await request(app)
      .post("/api/royalties/split")
      .set("Authorization", `Bearer ${token}`)
      .send({ track_id: "no-track", period: "2026-05", total_amount_usd: 100 });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("6. Returns 409 when split for this period already exists", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks")         return makeTrackMock();
      if (table === "royalty_splits") return makeSplitsMock({ id: "split-existing" });
      return {};
    });
    const token = makeToken();
    const res = await request(app)
      .post("/api/royalties/split")
      .set("Authorization", `Bearer ${token}`)
      .send({ track_id: "track-001", period: "2026-05", total_amount_usd: 100 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it("7. Returns 201 with 80/20 split on success (no collaborators)", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/royalties/split")
      .set("Authorization", `Bearer ${token}`)
      .send({ track_id: "track-001", period: "2026-05", total_amount_usd: 100 });

    expect(res.status).toBe(201);
    expect(res.body.split_id).toBe("split-001");
    expect(res.body.status).toBe("PAID");
    expect(res.body.total_amount_usd).toBe(100);

    const splits = res.body.splits;
    const producer = splits.find((s: { role: string }) => s.role === "producer");
    const platform = splits.find((s: { role: string }) => s.role === "platform");

    expect(producer.share_pct).toBe(80);
    expect(producer.amount_usd).toBe(80);
    expect(platform.share_pct).toBe(20);
    expect(platform.amount_usd).toBe(20);
  });

  it("8. Collaborator split reduces producer share correctly", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/royalties/split")
      .set("Authorization", `Bearer ${token}`)
      .send({
        track_id: "track-001", period: "2026-05", total_amount_usd: 100,
        collaborators: [{ artist_id: "collab-001", share_pct: 20 }],
      });

    expect(res.status).toBe(201);
    const splits = res.body.splits;
    const producer    = splits.find((s: { role: string }) => s.role === "producer");
    const collaborator = splits.find((s: { role: string }) => s.role === "collaborator");
    const platform    = splits.find((s: { role: string }) => s.role === "platform");

    expect(producer.share_pct).toBe(60);
    expect(producer.amount_usd).toBe(60);
    expect(collaborator.share_pct).toBe(20);
    expect(collaborator.amount_usd).toBe(20);
    expect(platform.share_pct).toBe(20);
    expect(platform.amount_usd).toBe(20);
  });

  it("9. NEXUS called with correct API key for each non-platform entry", async () => {
    const token = makeToken();
    await request(app)
      .post("/api/royalties/split")
      .set("Authorization", `Bearer ${token}`)
      .send({
        track_id: "track-001", period: "2026-05", total_amount_usd: 100,
        collaborators: [{ artist_id: "collab-001", share_pct: 20 }],
      });

    // Called twice: producer + collaborator (not platform)
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://nexus-mock.test/api/creator/aura-payout",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-gig-api-key": "test-gig-key" }),
      })
    );
  });

  it("10. NEXUS payout failure marks status FAILED but still returns 201", async () => {
    mockFetch.mockRejectedValue(new Error("NEXUS down"));
    const token = makeToken();

    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks") return makeTrackMock();
      if (table === "royalty_splits") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          insert: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: "split-002", status: "FAILED" },
            error: null,
          }),
          order: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return {};
    });

    const res = await request(app)
      .post("/api/royalties/split")
      .set("Authorization", `Bearer ${token}`)
      .send({ track_id: "track-001", period: "2026-05", total_amount_usd: 100 });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("FAILED");
    const producer = res.body.splits.find((s: { role: string }) => s.role === "producer");
    expect(producer.nexus_payout.error).toMatch(/NEXUS down/);
  });
});

describe("GET /api/royalties/:trackId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === "royalty_splits") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({
            data: [
              {
                id: "split-001",
                period: "2026-05",
                total_amount_usd: 100,
                splits: [
                  { artist_id: "producer-001", role: "producer", share_pct: 80, amount_usd: 80 },
                  { artist_id: "platform", role: "platform", share_pct: 20, amount_usd: 20 },
                ],
                status: "PAID",
                created_at: "2026-05-01T10:00:00Z",
              },
            ],
            error: null,
          }),
        };
      }
      return {};
    });
  });

  it("11. Returns 200 with splits array", async () => {
    const res = await request(app).get("/api/royalties/track-001");
    expect(res.status).toBe(200);
    expect(res.body.track_id).toBe("track-001");
    expect(Array.isArray(res.body.splits)).toBe(true);
    expect(res.body.splits[0].status).toBe("PAID");
  });

  it("12. Response includes count", async () => {
    const res = await request(app).get("/api/royalties/track-001");
    expect(res.body.count).toBe(1);
  });
});
