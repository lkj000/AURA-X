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
import marketplaceRouter from "../routes/marketplace";

const app = express();
app.use(express.json());
app.use("/api/marketplace", marketplaceRouter);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeToken(artistId = "buyer-001") {
  return jwt.sign({ artist_id: artistId, email: "buyer@test.com" }, "test-secret-aura-x-phase4", { expiresIn: "1h" });
}

const NEXUS_PAYOUT = { processed: true, txId: "AURA-mkt-001", zarAmount: 368, netZAR: 359 };

function makeEvalMock(passed = true) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: passed ? { passed_gate: true } : null,
      error: null,
    }),
  };
}

function makeTrackMock(exists = true) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: exists ? { id: "track-mkt-001", created_by: "producer-001" } : null,
      error: null,
    }),
  };
}

function makeLicenseMock(exclusive: unknown = null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: exclusive, error: null }),
    insert: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: { id: "lic-mkt-001" }, error: null }),
  };
}

function makeSplitInsertMock() {
  return {
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: { id: "split-mkt-001" }, error: null }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// GET /api/marketplace calls "tracks" twice:
//   call 1: .select("id").in().eq("suno_approved", true)  → Promise (suno gate)
//   call 2: .select("id, title, ...").in().order().range() → Promise (listings)
// Returns a factory: call it inside mockFrom so each mockFrom("tracks") call
// gets the correct mock for that invocation.
function makeTracksCallFactory(sunoIds: string[], listings: unknown[]) {
  let callCount = 0;
  return () => {
    callCount++;
    if (callCount === 1) {
      // Suno gate — terminal call is .eq()
      return {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: sunoIds.map((id) => ({ id })), error: null }),
      };
    }
    // Listings — terminal call is .range()
    return {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: listings, error: null }),
    };
  };
}

describe("GET /api/marketplace", () => {
  const LISTINGS = [
    { id: "track-mkt-001", title: "Amapiano Sunrise", subgenre: "log_drum", bpm: 112, key: "Am", created_by: "producer-001", created_at: "2026-05-01T10:00:00Z" },
    { id: "track-mkt-002", title: "Deep Groove", subgenre: "afro_house", bpm: 108, key: "Dm", created_by: "producer-002", created_at: "2026-05-01T09:00:00Z" },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    const tracksFactory = makeTracksCallFactory(["track-mkt-001", "track-mkt-002"], LISTINGS);
    mockFrom.mockImplementation((table: string) => {
      if (table === "evaluations") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({
            data: [{ track_id: "track-mkt-001" }, { track_id: "track-mkt-002" }],
            error: null,
          }),
        };
      }
      if (table === "track_licenses") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === "tracks") return tracksFactory();
      return {};
    });
  });

  it("1. Returns 200 with listings array", async () => {
    const res = await request(app).get("/api/marketplace");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.listings)).toBe(true);
    expect(res.body.listings.length).toBe(2);
  });

  it("2. Each listing includes tier pricing", async () => {
    const res = await request(app).get("/api/marketplace");
    const listing = res.body.listings[0];
    expect(listing.tiers.STANDARD.price_usd).toBe(25);
    expect(listing.tiers.PREMIUM.price_usd).toBe(150);
    expect(listing.tiers.EXCLUSIVE.price_usd).toBe(500);
  });

  it("3. Returns empty listings when no tracks pass gate", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "evaluations") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return {};
    });
    const res = await request(app).get("/api/marketplace");
    expect(res.status).toBe(200);
    expect(res.body.listings).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it("4. Excludes tracks not Suno-approved (returns empty when none approved)", async () => {
    const tracksFactory = makeTracksCallFactory([], []); // suno gate returns no approved IDs
    mockFrom.mockImplementation((table: string) => {
      if (table === "evaluations") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({
            data: [{ track_id: "track-mkt-001" }],
            error: null,
          }),
        };
      }
      if (table === "tracks") return tracksFactory();
      return {};
    });
    const res = await request(app).get("/api/marketplace");
    expect(res.status).toBe(200);
    expect(res.body.listings).toEqual([]);
  });

  it("4b. Excludes exclusively sold tracks", async () => {
    // Suno approves track-mkt-001, but it's exclusively licensed — should be filtered out
    const tracksFactory = makeTracksCallFactory(["track-mkt-001"], []);
    mockFrom.mockImplementation((table: string) => {
      if (table === "evaluations") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({
            data: [{ track_id: "track-mkt-001" }],
            error: null,
          }),
        };
      }
      if (table === "track_licenses") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ data: [{ track_id: "track-mkt-001" }], error: null }),
        };
      }
      if (table === "tracks") return tracksFactory();
      return {};
    });
    const res = await request(app).get("/api/marketplace");
    expect(res.status).toBe(200);
    expect(res.body.listings).toEqual([]);
  });
});

describe("POST /api/marketplace/:trackId/license", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks")         return makeTrackMock();
      if (table === "evaluations")    return makeEvalMock();
      if (table === "track_licenses") return makeLicenseMock();
      if (table === "royalty_splits") return makeSplitInsertMock();
      return {};
    });
    mockFetch.mockResolvedValue({ ok: true, json: async () => NEXUS_PAYOUT });
  });

  it("5. Returns 401 with no auth token", async () => {
    const res = await request(app).post("/api/marketplace/track-mkt-001/license").send({ tier: "STANDARD" });
    expect(res.status).toBe(401);
  });

  it("6. Returns 400 for invalid tier", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/marketplace/track-mkt-001/license")
      .set("Authorization", `Bearer ${token}`)
      .send({ tier: "BRONZE" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/STANDARD|PREMIUM|EXCLUSIVE/);
  });

  it("7. Returns 404 when track not found", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks") return makeTrackMock(false);
      return {};
    });
    const token = makeToken();
    const res = await request(app)
      .post("/api/marketplace/no-track/license")
      .set("Authorization", `Bearer ${token}`)
      .send({ tier: "STANDARD" });
    expect(res.status).toBe(404);
  });

  it("8. Returns 422 when track has not passed quality gate", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks")      return makeTrackMock();
      if (table === "evaluations") return makeEvalMock(false);
      return {};
    });
    const token = makeToken();
    const res = await request(app)
      .post("/api/marketplace/track-mkt-001/license")
      .set("Authorization", `Bearer ${token}`)
      .send({ tier: "STANDARD" });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/quality gate/i);
  });

  it("9. Returns 409 when track is already exclusively licensed", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks")         return makeTrackMock();
      if (table === "evaluations")    return makeEvalMock();
      if (table === "track_licenses") return makeLicenseMock({ id: "excl-001" });
      return {};
    });
    const token = makeToken();
    const res = await request(app)
      .post("/api/marketplace/track-mkt-001/license")
      .set("Authorization", `Bearer ${token}`)
      .send({ tier: "STANDARD" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/exclusively licensed/i);
  });

  it("10. Returns 201 with STANDARD license — $25, 80/20 split, access_token", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/marketplace/track-mkt-001/license")
      .set("Authorization", `Bearer ${token}`)
      .send({ tier: "STANDARD" });

    expect(res.status).toBe(201);
    expect(res.body.tier).toBe("STANDARD");
    expect(res.body.price_usd).toBe(25);
    expect(res.body.license_id).toBe("lic-mkt-001");
    expect(res.body.split_id).toBe("split-mkt-001");
    expect(res.body.split_status).toBe("PAID");
    expect(typeof res.body.access_token).toBe("string");
  });

  it("11. PREMIUM tier priced at $150", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/marketplace/track-mkt-001/license")
      .set("Authorization", `Bearer ${token}`)
      .send({ tier: "PREMIUM" });
    expect(res.status).toBe(201);
    expect(res.body.price_usd).toBe(150);
  });

  it("12. EXCLUSIVE tier priced at $500", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/marketplace/track-mkt-001/license")
      .set("Authorization", `Bearer ${token}`)
      .send({ tier: "EXCLUSIVE" });
    expect(res.status).toBe(201);
    expect(res.body.price_usd).toBe(500);
  });

  it("13. NEXUS called with 80% of price for producer", async () => {
    const token = makeToken();
    await request(app)
      .post("/api/marketplace/track-mkt-001/license")
      .set("Authorization", `Bearer ${token}`)
      .send({ tier: "STANDARD" });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.amountUSD).toBe(20); // 80% of $25
    expect(mockFetch).toHaveBeenCalledWith(
      "http://nexus-mock.test/api/creator/aura-payout",
      expect.objectContaining({ headers: expect.objectContaining({ "x-gig-api-key": "test-gig-key" }) })
    );
  });

  it("14. NEXUS failure still returns 201 with split_status FAILED", async () => {
    mockFetch.mockRejectedValue(new Error("NEXUS down"));
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks")         return makeTrackMock();
      if (table === "evaluations")    return makeEvalMock();
      if (table === "track_licenses") return makeLicenseMock();
      if (table === "royalty_splits") {
        return {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { id: "split-fail-001" }, error: null }),
        };
      }
      return {};
    });
    const token = makeToken();
    const res = await request(app)
      .post("/api/marketplace/track-mkt-001/license")
      .set("Authorization", `Bearer ${token}`)
      .send({ tier: "STANDARD" });
    expect(res.status).toBe(201);
    expect(res.body.split_status).toBe("FAILED");
  });
});
