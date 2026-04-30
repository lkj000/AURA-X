import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

process.env.JWT_SECRET     = "test-secret-aura-x-phase3";
process.env.NEXUS_API_URL  = "http://nexus-mock.test";
process.env.GIG_API_KEY    = "test-gig-key";

// ─── Mock Supabase ─────────────────────────────────────────────────────────────

const mockFrom = jest.fn();
jest.mock("../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// ─── Mock global fetch (NEXUS HTTP call) ───────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// ─── Build app ─────────────────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import licensingRouter from "../routes/licensing";

const app = express();
app.use(express.json());
app.use("/api/licensing", licensingRouter);

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(artistId = "artist-test-001", email = "artist@test.com") {
  return jwt.sign({ artist_id: artistId, email }, "test-secret-aura-x-phase3", { expiresIn: "1h" });
}

const NEXUS_PAYOUT = {
  processed: true,
  auraArtistId: "artist-test-001",
  platform: "spotify",
  period: "2026-04",
  grossUSD: 100,
  sarsFXRate: 18.45,
  zarAmount: 1845,
  nexusFeePercent: 2.5,
  nexusFeeZAR: 46.13,
  netZAR: 1798.88,
  txId: "AURA-2026-04-artist-t",
};

function makeTracksMock() {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: { id: "track-aaa-001", created_by: "kabelo" },
      error: null,
    }),
  };
}

function makeLicensesMock(existing: unknown = null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: existing, error: null }),
    insert: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: { id: "lic-new-001" }, error: null }),
    order: jest.fn().mockResolvedValue({ data: [], error: null }),
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/licensing/claim", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks")         return makeTracksMock();
      if (table === "track_licenses") return makeLicensesMock();
      return {};
    });
    mockFetch.mockResolvedValue({ ok: true, json: async () => NEXUS_PAYOUT });
  });

  it("1. Returns 401 when no auth token", async () => {
    const res = await request(app).post("/api/licensing/claim").send({
      track_id: "track-aaa-001", platform: "spotify", period: "2026-04", amount_usd: 100,
    });
    expect(res.status).toBe(401);
  });

  it("2. Returns 400 when required fields are missing", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/licensing/claim")
      .set("Authorization", `Bearer ${token}`)
      .send({ track_id: "track-aaa-001" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it("3. Returns 404 when track does not exist", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });
    const token = makeToken();
    const res = await request(app)
      .post("/api/licensing/claim")
      .set("Authorization", `Bearer ${token}`)
      .send({ track_id: "no-such-track", platform: "spotify", period: "2026-04", amount_usd: 100 });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("4. Returns 409 when license for this period already exists", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks")         return makeTracksMock();
      if (table === "track_licenses") return makeLicensesMock({ id: "lic-existing" });
      return {};
    });
    const token = makeToken();
    const res = await request(app)
      .post("/api/licensing/claim")
      .set("Authorization", `Bearer ${token}`)
      .send({ track_id: "track-aaa-001", platform: "spotify", period: "2026-04", amount_usd: 100 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already claimed/i);
  });

  it("5. Returns 201 with license_id and nexus_payout on success", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/licensing/claim")
      .set("Authorization", `Bearer ${token}`)
      .send({ track_id: "track-aaa-001", platform: "spotify", period: "2026-04", amount_usd: 100 });
    expect(res.status).toBe(201);
    expect(res.body.license_id).toBe("lic-new-001");
    expect(res.body.nexus_payout.processed).toBe(true);
    expect(res.body.nexus_payout.zarAmount).toBe(1845);
    expect(res.body.nexus_payout.txId).toMatch(/^AURA-/);
  });

  it("6. NEXUS is called with correct URL and GIG_API_KEY header", async () => {
    const token = makeToken("artist-xyz-999");
    await request(app)
      .post("/api/licensing/claim")
      .set("Authorization", `Bearer ${token}`)
      .send({ track_id: "track-aaa-001", platform: "apple_music", period: "2026-03", amount_usd: 250 });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://nexus-mock.test/api/creator/aura-payout",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-gig-api-key": "test-gig-key" }),
      })
    );
  });

  it("7. Still returns 201 when NEXUS call fails (graceful degradation)", async () => {
    mockFetch.mockRejectedValue(new Error("NEXUS unreachable"));
    const token = makeToken();
    const res = await request(app)
      .post("/api/licensing/claim")
      .set("Authorization", `Bearer ${token}`)
      .send({ track_id: "track-aaa-001", platform: "spotify", period: "2026-04", amount_usd: 100 });
    expect(res.status).toBe(201);
    expect(res.body.nexus_payout.error).toMatch(/NEXUS unreachable/);
  });
});

describe("GET /api/licensing/:trackId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === "track_licenses") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({
            data: [
              {
                id: "lic-001", platform: "spotify", period: "2026-04",
                amount_usd: 100, status: "claimed", created_at: "2026-04-30T10:00:00Z",
                nexus_payout: NEXUS_PAYOUT,
              },
            ],
            error: null,
          }),
        };
      }
      return {};
    });
  });

  it("8. Returns 200 with licenses array", async () => {
    const res = await request(app).get("/api/licensing/track-aaa-001");
    expect(res.status).toBe(200);
    expect(res.body.track_id).toBe("track-aaa-001");
    expect(Array.isArray(res.body.licenses)).toBe(true);
    expect(res.body.licenses[0].platform).toBe("spotify");
  });

  it("9. Response includes count", async () => {
    const res = await request(app).get("/api/licensing/track-aaa-001");
    expect(res.body.count).toBe(1);
  });
});
