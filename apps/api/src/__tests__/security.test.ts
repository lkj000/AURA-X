import express from "express";
import request from "supertest";
import { httpsRedirect, securityHeaders } from "../middleware/security";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(httpsRedirect);
  app.use(securityHeaders);
  app.get("/ping", (_req, res) => res.json({ ok: true }));
  return app;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("HTTPS redirect middleware", () => {

  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("1. Non-production: plain HTTP request passes through (200)", async () => {
    process.env.NODE_ENV = "development";
    const res = await request(makeApp()).get("/ping");
    expect(res.status).toBe(200);
  });

  it("2. Non-production: no redirect even without x-forwarded-proto header", async () => {
    process.env.NODE_ENV = "test";
    const res = await request(makeApp()).get("/ping");
    expect(res.status).not.toBe(301);
  });

  it("3. Production + x-forwarded-proto: https → passes through (200)", async () => {
    process.env.NODE_ENV = "production";
    const res = await request(makeApp())
      .get("/ping")
      .set("x-forwarded-proto", "https");
    expect(res.status).toBe(200);
  });

  it("4. Production + x-forwarded-proto: http → 301 redirect", async () => {
    process.env.NODE_ENV = "production";
    const res = await request(makeApp())
      .get("/ping")
      .set("x-forwarded-proto", "http")
      .set("host", "api.okovanggo.ai");
    expect(res.status).toBe(301);
  });

  it("5. Production + x-forwarded-proto: http → redirect Location starts with https://", async () => {
    process.env.NODE_ENV = "production";
    const res = await request(makeApp())
      .get("/ping")
      .set("x-forwarded-proto", "http")
      .set("host", "api.okovanggo.ai");
    expect(res.headers.location).toMatch(/^https:\/\//);
  });

  it("6. Production + no x-forwarded-proto → 301 redirect (missing header treated as HTTP)", async () => {
    process.env.NODE_ENV = "production";
    const app = makeApp();
    const res = await request(app)
      .get("/ping")
      .set("host", "api.okovanggo.ai");
    expect(res.status).toBe(301);
  });

  it("7. Redirect preserves the original path and query string", async () => {
    process.env.NODE_ENV = "production";
    const res = await request(makeApp())
      .get("/ping?foo=bar")
      .set("x-forwarded-proto", "http")
      .set("host", "api.okovanggo.ai");
    expect(res.headers.location).toContain("/ping?foo=bar");
  });

});

describe("Security headers middleware", () => {

  it("8. Strict-Transport-Security header present", async () => {
    const res = await request(makeApp()).get("/ping");
    expect(res.headers["strict-transport-security"]).toContain("max-age=31536000");
  });

  it("9. HSTS includes includeSubDomains", async () => {
    const res = await request(makeApp()).get("/ping");
    expect(res.headers["strict-transport-security"]).toContain("includeSubDomains");
  });

  it("10. X-Content-Type-Options: nosniff", async () => {
    const res = await request(makeApp()).get("/ping");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("11. X-Frame-Options: DENY", async () => {
    const res = await request(makeApp()).get("/ping");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("12. Referrer-Policy: strict-origin-when-cross-origin", async () => {
    const res = await request(makeApp()).get("/ping");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

});

describe("Trust proxy", () => {

  it("13. app has trust proxy enabled (req.ip reflects X-Forwarded-For)", async () => {
    const app = express();
    app.set("trust proxy", 1);
    app.use(httpsRedirect);
    app.use(securityHeaders);
    let capturedIp: string | undefined;
    app.get("/ip", (req, res) => {
      capturedIp = req.ip;
      res.json({ ip: req.ip });
    });
    await request(app).get("/ip").set("x-forwarded-for", "1.2.3.4");
    expect(capturedIp).toBe("1.2.3.4");
  });

});
