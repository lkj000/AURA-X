import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ─── Ensure JWT_SECRET is set for tests ─────────────────────────────────────

process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-aura-x-phase3";

// ─── Mock Supabase ────────────────────────────────────────────────────────────

import bcrypt from "bcryptjs";

const ARTIST = {
  id:            "artist-uuid-001",
  name:          "Kabelo Mokoena",
  email:         "kabelo@aura-x.music",
  password_hash: "", // filled in beforeAll
  country:       "ZA",
  created_at:    "2026-04-30T00:00:00Z",
};

const mockMaybeSingle = jest.fn();
const mockSingle      = jest.fn();
const mockSelect      = jest.fn();
const mockInsert      = jest.fn();
const mockEq          = jest.fn();
const mockFrom        = jest.fn();

jest.mock("../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// ─── Build app ───────────────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import authRouter from "../routes/auth";

const app = express();
app.use(express.json());
app.use("/api/auth", authRouter);

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeAll(async () => {
  ARTIST.password_hash = await bcrypt.hash("correctpassword", 10);
});

beforeEach(() => {
  jest.clearAllMocks();

  mockFrom.mockImplementation((table: string) => {
    if (table === "artists") {
      return {
        insert: mockInsert,
        select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
      };
    }
    return {};
  });

  // Default insert: success
  mockInsert.mockReturnValue({
    select: () => ({
      single: mockSingle,
    }),
  });
  mockSingle.mockResolvedValue({
    data: { id: ARTIST.id, name: ARTIST.name, email: ARTIST.email, country: ARTIST.country, created_at: ARTIST.created_at },
    error: null,
  });

  // Default maybeSingle: artist found with correct hash
  mockMaybeSingle.mockResolvedValue({
    data: ARTIST,
    error: null,
  });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/auth/register", () => {

  it("1. Valid registration → 200, has token", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Kabelo Mokoena", email: "kabelo@aura-x.music", password: "secret123", country: "ZA",
    });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.token.length).toBeGreaterThan(0);
  });

  it("2. Valid registration → artist_id in response", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Kabelo Mokoena", email: "kabelo@aura-x.music", password: "secret123",
    });
    expect(res.body.artist_id).toBe(ARTIST.id);
  });

  it("3. Duplicate email → 409", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: "23505", message: "unique violation" },
    });
    const res = await request(app).post("/api/auth/register").send({
      name: "Kabelo Mokoena", email: "kabelo@aura-x.music", password: "secret123",
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  it("4. Missing email → 400", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Kabelo Mokoena", password: "secret123",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it("5. Missing password → 400", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Kabelo Mokoena", email: "kabelo@aura-x.music",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/i);
  });

});

describe("POST /api/auth/login", () => {

  it("6. Correct password → 200, has token", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: ARTIST.email, password: "correctpassword",
    });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
  });

  it("7. Wrong password → 401", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: ARTIST.email, password: "wrongpassword",
    });
    expect(res.status).toBe(401);
  });

  it("8. Unknown email → 401", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await request(app).post("/api/auth/login").send({
      email: "nobody@unknown.com", password: "anypassword",
    });
    expect(res.status).toBe(401);
  });

});

describe("GET /api/auth/me", () => {

  async function validToken(): Promise<string> {
    const res = await request(app).post("/api/auth/login").send({
      email: ARTIST.email, password: "correctpassword",
    });
    return res.body.token as string;
  }

  it("9. Valid token → 200, returns email", async () => {
    const token = await validToken();
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(ARTIST.email);
  });

  it("10. No token → 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("11. Invalid token → 401", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer not.a.real.token");
    expect(res.status).toBe(401);
  });

});
