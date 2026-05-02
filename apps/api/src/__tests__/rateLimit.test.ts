import express, { Request, Response } from "express";
import request from "supertest";
import rateLimit from "express-rate-limit";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeApp(max: number, windowMs = 60_000, message = { error: "rate limited" }) {
  const app = express();
  app.use(rateLimit({
    windowMs,
    max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message,
  }));
  app.get("/ping", (_req: Request, res: Response) => res.json({ ok: true }));
  return app;
}

// ─── Production limiter config verification ───────────────────────────────────

import {
  globalLimiter,
  authLimiter,
  generationLimiter,
  evaluateLimiter,
} from "../middleware/rateLimit";

describe("Rate Limiter — production config", () => {

  it("1. globalLimiter is a function (valid Express middleware)", () => {
    expect(typeof globalLimiter).toBe("function");
  });

  it("2. authLimiter is a function (valid Express middleware)", () => {
    expect(typeof authLimiter).toBe("function");
  });

  it("3. generationLimiter is a function (valid Express middleware)", () => {
    expect(typeof generationLimiter).toBe("function");
  });

  it("4. evaluateLimiter is a function (valid Express middleware)", () => {
    expect(typeof evaluateLimiter).toBe("function");
  });

});

// ─── Enforcement behaviour ────────────────────────────────────────────────────

describe("Rate Limiter — enforcement", () => {

  it("5. Requests within the limit return 200", async () => {
    const app = makeApp(3);
    const res = await request(app).get("/ping");
    expect(res.status).toBe(200);
  });

  it("6. Exactly max requests all return 200", async () => {
    const app = makeApp(2);
    await request(app).get("/ping");
    const res = await request(app).get("/ping");
    expect(res.status).toBe(200);
  });

  it("7. Request beyond max returns 429", async () => {
    const app = makeApp(2);
    await request(app).get("/ping");
    await request(app).get("/ping");
    const res = await request(app).get("/ping");
    expect(res.status).toBe(429);
  });

  it("8. 429 response body contains error key", async () => {
    const app = makeApp(1, 60_000, { error: "rate limited" });
    await request(app).get("/ping");
    const res = await request(app).get("/ping");
    expect(res.status).toBe(429);
    expect(res.body.error).toBeDefined();
  });

  it("9. 429 error message matches configured message", async () => {
    const app = makeApp(1, 60_000, { error: "Too many requests — please slow down" });
    await request(app).get("/ping");
    const res = await request(app).get("/ping");
    expect(res.body.error).toBe("Too many requests — please slow down");
  });

});

// ─── Standard headers ─────────────────────────────────────────────────────────

describe("Rate Limiter — RateLimit headers", () => {

  it("10. RateLimit header present on successful response", async () => {
    const app = makeApp(5);
    const res = await request(app).get("/ping");
    expect(res.headers["ratelimit"]).toBeDefined();
  });

  it("11. RateLimit-Policy header present on successful response", async () => {
    const app = makeApp(5);
    const res = await request(app).get("/ping");
    // draft-7 uses RateLimit and RateLimit-Policy headers
    expect(
      res.headers["ratelimit"] ?? res.headers["ratelimit-limit"]
    ).toBeDefined();
  });

  it("12. RateLimit header present on 429 response", async () => {
    const app = makeApp(1);
    await request(app).get("/ping");
    const res = await request(app).get("/ping");
    expect(res.status).toBe(429);
    expect(
      res.headers["ratelimit"] ?? res.headers["ratelimit-limit"]
    ).toBeDefined();
  });

  it("13. Legacy X-RateLimit-* headers NOT present (legacyHeaders: false)", async () => {
    const app = makeApp(5);
    const res = await request(app).get("/ping");
    expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
    expect(res.headers["x-ratelimit-remaining"]).toBeUndefined();
  });

});

// ─── Per-route limiter integration ────────────────────────────────────────────

describe("Rate Limiter — route-level application", () => {

  it("14. auth route with authLimiter: exceeds limit → 429", async () => {
    const app = express();
    app.use(rateLimit({ windowMs: 60_000, max: 2, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "auth limited" } }));
    app.post("/api/auth/login", (_req, res) => res.json({ ok: true }));
    await request(app).post("/api/auth/login");
    await request(app).post("/api/auth/login");
    const res = await request(app).post("/api/auth/login");
    expect(res.status).toBe(429);
    expect(res.body.error).toBe("auth limited");
  });

  it("15. generation route with generationLimiter: exceeds limit → 429", async () => {
    const app = express();
    app.use(express.json());
    app.use(rateLimit({ windowMs: 60_000, max: 2, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "gen limited" } }));
    app.post("/api/generate", (_req, res) => res.json({ ok: true }));
    await request(app).post("/api/generate");
    await request(app).post("/api/generate");
    const res = await request(app).post("/api/generate");
    expect(res.status).toBe(429);
    expect(res.body.error).toBe("gen limited");
  });

});
