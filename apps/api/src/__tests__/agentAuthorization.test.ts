/**
 * IDENTITY MUST BE PROVEN, NOT ASSERTED BY THE CALLER.
 *
 * Covers A4 and A5 from the 20 September platform review. They are the same defect in two places: a
 * field the caller fills in was trusted as identity, and a signed token was trusted as authority.
 */
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-aura-x-agentauth";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const updates: Row[] = [];

function builder(table: string) {
  let rows: Row[] = [...(tables[table] ?? [])];
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (col: string, val: unknown) => { rows = rows.filter((r) => r[col] === val); return api; },
    in: (col: string, vals: unknown[]) => { rows = rows.filter((r) => vals.includes(r[col] as never)); return api; },
    limit: () => api,
    order: () => api,
    range: () => api,
    update: (patch: Row) => { updates.push(patch); return api; },
    insert: () => api,
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    single: async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
  };
  return api as unknown as Record<string, (...a: unknown[]) => unknown>;
}

jest.mock("../lib/supabase", () => ({ supabase: { from: (t: string) => builder(t) } }));

// Nothing may reach a network or start a workflow in these tests.
global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
jest.mock("../temporal/client", () => ({
  getTemporalClient: jest.fn(async () => { throw new Error("temporal must not be reached in tests"); }),
}), { virtual: true });

import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

const ARTIST = "artist-ordinary-001";
const MODERATOR = "artist-moderator-777";
const OWNER = "artist-owner-002";
const TRACK = "track-approve-001";

const tokenFor = (id: string) =>
  jwt.sign({ artist_id: id, email: `${id}@x.test` }, process.env.JWT_SECRET!, { expiresIn: "1h" });

async function app() {
  jest.resetModules();
  const tracks = (await import("../routes/tracks")).default;
  const agent = (await import("../routes/agent")).default;
  const a = express();
  a.use(express.json());
  a.use("/api/tracks", tracks);
  a.use("/api/agent", agent);
  return a;
}

beforeEach(() => {
  tables.tracks = [{ id: TRACK, title: "T", created_by: OWNER, suno_approved: false }];
  updates.length = 0;
  delete process.env.TRACK_MODERATOR_IDS;
  delete process.env.SUNO_INTEGRATION_SECRET;
});

describe("A5 — a signed token is not authority to approve a track", () => {
  it("AA-01 an ordinary artist cannot approve someone else's track", async () => {
    // The defect: verifyToken checked the signature and nothing else, so any artist could set
    // suno_approved on any track — approving their own work onto the marketplace, or removing a
    // competitor's from it.
    const res = await request(await app())
      .post(`/api/tracks/${TRACK}/suno-result`)
      .set("Authorization", `Bearer ${tokenFor(ARTIST)}`)
      .send({ approved: true });

    expect(res.status).toBe(403);
    expect(res.body.reason).toBe("NOT_AUTHORISED");
    expect(updates).toHaveLength(0);
  });

  it("AA-02 with no approver configured at all, nobody is approved", async () => {
    // An approval gate with no configured approver must decline, not fall back to accepting whoever
    // asks. This is the default posture of a fresh deployment.
    const res = await request(await app())
      .post(`/api/tracks/${TRACK}/suno-result`)
      .set("Authorization", `Bearer ${tokenFor(MODERATOR)}`)
      .send({ approved: true });

    expect(res.status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it("AA-03 a listed moderator may approve another artist's track", async () => {
    process.env.TRACK_MODERATOR_IDS = `${MODERATOR}, someone-else`;
    const res = await request(await app())
      .post(`/api/tracks/${TRACK}/suno-result`)
      .set("Authorization", `Bearer ${tokenFor(MODERATOR)}`)
      .send({ approved: true, style_tag: "amapiano" });

    expect(res.status).toBe(200);
    expect(res.body.approved_via).toBe("moderator");
    expect(updates[0].suno_approved).toBe(true);
    // Attributed on the row: an approval nobody can attribute is one nobody can review.
    expect(updates[0].suno_classified_by).toBe(MODERATOR);
  });

  it("AA-04 a moderator may NOT approve their own track", async () => {
    // The obvious fix — "only the creator may approve" — would have been the same defect with better
    // manners: a gate the applicant operates is not a gate. Trust in general does not resolve a
    // conflict in particular.
    tables.tracks = [{ id: TRACK, title: "T", created_by: MODERATOR }];
    process.env.TRACK_MODERATOR_IDS = MODERATOR;

    const res = await request(await app())
      .post(`/api/tracks/${TRACK}/suno-result`)
      .set("Authorization", `Bearer ${tokenFor(MODERATOR)}`)
      .send({ approved: true });

    expect(res.status).toBe(403);
    expect(res.body.reason).toBe("SELF_APPROVAL");
    expect(updates).toHaveLength(0);
  });

  it("AA-05 the integration approves with its secret and no artist token", async () => {
    process.env.SUNO_INTEGRATION_SECRET = "s3cret-value-long-enough";
    const res = await request(await app())
      .post(`/api/tracks/${TRACK}/suno-result`)
      .set("x-integration-secret", "s3cret-value-long-enough")
      .send({ approved: true });

    expect(res.status).toBe(200);
    expect(res.body.approved_via).toBe("integration");
    expect(updates[0].suno_classified_by).toBe("suno-integration");
  });

  it("AA-06 a wrong secret is refused, and does not reveal that a right one exists", async () => {
    process.env.SUNO_INTEGRATION_SECRET = "s3cret-value-long-enough";
    const res = await request(await app())
      .post(`/api/tracks/${TRACK}/suno-result`)
      .set("x-integration-secret", "wrong-value-same-length!")
      .send({ approved: true });

    expect(res.status).toBe(403);
    expect(res.body.reason).toBe("NOT_AUTHORISED");
    expect(updates).toHaveLength(0);
  });

  it("AA-07 a nonexistent track is 404, not 403 — the caller learns the useful thing", async () => {
    process.env.TRACK_MODERATOR_IDS = MODERATOR;
    const res = await request(await app())
      .post(`/api/tracks/no-such-track/suno-result`)
      .set("Authorization", `Bearer ${tokenFor(MODERATOR)}`)
      .send({ approved: true });

    expect(res.status).toBe(404);
  });

  it("AA-08 an invalid token is rejected outright, not treated as anonymous", async () => {
    // optionalToken tolerates a MISSING credential, because the integration presents none. A BROKEN
    // one is an error, not an absence — letting it through would make an expired token a silent
    // downgrade to whatever the anonymous path allows.
    process.env.SUNO_INTEGRATION_SECRET = "s3cret-value-long-enough";
    const res = await request(await app())
      .post(`/api/tracks/${TRACK}/suno-result`)
      .set("Authorization", "Bearer not-a-real-token")
      .send({ approved: true });

    expect(res.status).toBe(401);
    expect(updates).toHaveLength(0);
  });
});

describe("A4 — expensive agent operations require a session, and take identity from it", () => {
  it("AA-09 /run refuses an unauthenticated caller", async () => {
    // The router was mounted with no authentication at all, while /api/generate beside it carried the
    // generation limiter.
    const res = await request(await app())
      .post("/api/agent/run")
      .send({ title: "T", subgenre: "amapiano", created_by: "whoever-i-typed" });

    expect(res.status).toBe(401);
  });

  it("AA-10 /finetune refuses an unauthenticated caller", async () => {
    // Model training. The public Dataset page exposed an enabled control for this.
    const res = await request(await app())
      .post("/api/agent/finetune")
      .send({ subgenre: "amapiano", triggered_by: "whoever-i-typed" });

    expect(res.status).toBe(401);
  });

  it("AA-11 the other mutating routes refuse too", async () => {
    const a = await app();
    for (const p of ["/api/agent/revise", "/api/agent/tune", "/api/agent/ingest"]) {
      const res = await request(a).post(p).send({});
      expect([401]).toContain(res.status);
    }
  });

  it("AA-12 reads stay open — the fix is scoped to spend and mutation", async () => {
    // Authenticating the whole router would have broken the Dataset page's polling and stats for no
    // security gain: these read, cost nothing, and start nothing.
    const a = await app();
    const stats = await request(a).get("/api/agent/dataset/stats");
    expect(stats.status).not.toBe(401);
  });
});
