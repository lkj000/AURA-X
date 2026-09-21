/**
 * THE MONEY PATH MUST NOT CLAIM SETTLEMENT IT CANNOT PERFORM.
 *
 * Covers A1, A3 and A6 from the 20 September platform review. Each test names the behaviour that was
 * live before, because a test whose failure message does not say what broke is a test somebody
 * deletes.
 */
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-aura-x-phase3";

// ─── Supabase, mocked in the shape this codebase already uses ────────────────────────────────────

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const inserted: Record<string, Row[]> = {};

/**
 * Minimal chainable stub: enough for the filters these routes actually use.
 *
 * `then` is implemented by hand rather than wrapping a pre-resolved Promise, because the routes await
 * the builder AFTER chaining filters onto it. A promise created up front captures the unfiltered rows
 * and resolves with them whatever is chained afterwards — which silently returned the wrong data and
 * cost a confused debugging pass.
 */
function builder(table: string) {
  let rows: Row[] = [...(tables[table] ?? [])];
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (col: string, val: unknown) => { rows = rows.filter((r) => r[col] === val); return api; },
    in: (col: string, vals: unknown[]) => { rows = rows.filter((r) => vals.includes(r[col] as never)); return api; },
    limit: () => api,
    order: () => api,
    range: () => api,
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    single: async () => ({ data: rows[0] ?? { id: `${table}-generated` }, error: null }),
    insert: (row: Row) => {
      (inserted[table] ??= []).push(row);
      return {
        select: () => ({ single: async () => ({ data: { id: `${table}-new` }, error: null }) }),
      };
    },
    // Resolved at await time, so filters chained before the await are honoured.
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
  };
  return api as unknown as Record<string, (...a: unknown[]) => unknown>;
}

jest.mock("../lib/supabase", () => ({ supabase: { from: (t: string) => builder(t) } }));

// Never reach the network, whatever the mode.
global.fetch = jest.fn(async () => ({
  ok: true, json: async () => ({ processed: true, txId: "AURA-fake" }),
})) as unknown as typeof fetch;

import jwt from "jsonwebtoken";

const TRACK = "track-001";
const ARTIST = "artist-buyer-001";
const token = () => jwt.sign({ artist_id: ARTIST, email: "b@x.test" }, process.env.JWT_SECRET!, { expiresIn: "1h" });

function seedApprovedTrack() {
  tables.tracks = [{ id: TRACK, created_by: "artist-producer-001", suno_approved: true }];
  tables.evaluations = [{ track_id: TRACK, passed_gate: true }];
  tables.track_licenses = [];
  tables.royalty_splits = [];
}

/** Routes read MARKETPLACE_MODE at module load, so the module registry is reset per mode. */
async function appInMode(mode: "DISABLED" | "SIMULATION") {
  jest.resetModules();
  process.env.AURA_MARKETPLACE_MODE = mode;
  const express = (await import("express")).default;
  const marketplace = (await import("../routes/marketplace")).default;
  const earnings = (await import("../routes/earnings")).default;
  const app = express();
  app.use(express.json());
  app.use("/api/marketplace", marketplace);
  app.use("/api/earnings", earnings);
  return app;
}

const request = require("supertest") as typeof import("supertest");

beforeEach(() => {
  seedApprovedTrack();
  for (const k of Object.keys(inserted)) delete inserted[k];
});

describe("A1 — a licence is not issued for an unpaid sale", () => {
  it("MS-01 DISABLED is the default posture: licensing refuses and says why", async () => {
    const app = await appInMode("DISABLED");
    const res = await request(app)
      .post(`/api/marketplace/${TRACK}/license`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ tier: "STANDARD" });

    expect(res.status).toBe(503);
    expect(res.body.reason).toBe("SETTLEMENT_NOT_IMPLEMENTED");
    // The defect: an active licence and a producer payout, for a buyer who was never charged.
    expect(inserted.track_licenses ?? []).toHaveLength(0);
    expect(inserted.royalty_splits ?? []).toHaveLength(0);
  });

  it("MS-02 in SIMULATION the licence is never 'active' and the split is never 'PAID'", async () => {
    const app = await appInMode("SIMULATION");
    const res = await request(app)
      .post(`/api/marketplace/${TRACK}/license`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ tier: "STANDARD" });

    expect(res.status).toBe(201);
    expect(res.body.license_status).toBe("simulated");
    expect(res.body.license_status).not.toBe("active");
    expect(res.body.split_status).not.toBe("PAID");
    expect(inserted.track_licenses?.[0]?.status).toBe("simulated");
    expect(inserted.royalty_splits?.[0]?.status).not.toBe("PAID");
  });

  it("MS-03 the response states no money moved, to a client that only checks for a 2xx", async () => {
    const app = await appInMode("SIMULATION");
    const res = await request(app)
      .post(`/api/marketplace/${TRACK}/license`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ tier: "PREMIUM" });

    // Reading the absence of an error as payment is precisely how `processed: true` became `PAID`.
    expect(res.body.simulated).toBe(true);
    expect(res.body.settlement).toBe("NONE");
    expect(res.body.amount_charged).toBe(0);
    expect(String(res.body.notice)).toMatch(/no money moved/i);
  });
});

describe("A6 — listing eligibility and purchase eligibility are the same rule", () => {
  it("MS-04 a track withheld from the marketplace cannot be licensed by id", async () => {
    // Passed the quality gate, but NOT approved for the marketplace. The listing excluded it; the
    // purchase handler checked only the gate, so knowing the id was enough.
    tables.tracks = [{ id: TRACK, created_by: "p1", suno_approved: false }];
    const app = await appInMode("SIMULATION");
    const res = await request(app)
      .post(`/api/marketplace/${TRACK}/license`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ tier: "STANDARD" });

    expect(res.status).toBe(422);
    expect(res.body.reason).toBe("NOT_APPROVED");
    expect(inserted.track_licenses ?? []).toHaveLength(0);
  });

  it("MS-05 a track that never passed the quality gate is still refused", async () => {
    tables.evaluations = [];
    const app = await appInMode("SIMULATION");
    const res = await request(app)
      .post(`/api/marketplace/${TRACK}/license`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ tier: "STANDARD" });

    expect(res.status).toBe(422);
    expect(res.body.reason).toBe("GATE_NOT_PASSED");
  });

  it("MS-06 an already-exclusive track is refused", async () => {
    tables.track_licenses = [{ id: "L1", track_id: TRACK, platform: "marketplace-exclusive" }];
    const app = await appInMode("SIMULATION");
    const res = await request(app)
      .post(`/api/marketplace/${TRACK}/license`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ tier: "STANDARD" });

    expect(res.status).toBe(409);
    expect(res.body.reason).toBe("ALREADY_EXCLUSIVE");
  });
});

describe("A3 — a withdrawal that moves nothing does not report that it did", () => {
  it("MS-07 DISABLED refuses rather than answering WITHDRAWN", async () => {
    const app = await appInMode("DISABLED");
    const res = await request(app)
      .post("/api/earnings/withdraw")
      .set("Authorization", `Bearer ${token()}`)
      .send({ amount_usd: 20 });

    expect(res.status).toBe(503);
    expect(res.body.reason).toBe("SETTLEMENT_NOT_IMPLEMENTED");
    expect(JSON.stringify(res.body)).not.toMatch(/"WITHDRAWN"/);
  });

  it("MS-08 in SIMULATION the status is not WITHDRAWN and says the balance is unchanged", async () => {
    tables.royalty_splits = [
      { status: "SIMULATED", splits: [{ artist_id: ARTIST, amount_usd: 100 }] },
    ];
    const app = await appInMode("SIMULATION");
    const res = await request(app)
      .post("/api/earnings/withdraw")
      .set("Authorization", `Bearer ${token()}`)
      .send({ amount_usd: 20 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("SIMULATED_NOT_WITHDRAWN");
    expect(res.body.status).not.toBe("WITHDRAWN");
    expect(res.body.amount_paid).toBe(0);
    // The repeatability is the defect, and it is stated rather than left to be discovered.
    expect(String(res.body.warning)).toMatch(/repeated indefinitely/i);
  });

  it("MS-09 the same earnings still support a second identical request — and say so", async () => {
    tables.royalty_splits = [
      { status: "SIMULATED", splits: [{ artist_id: ARTIST, amount_usd: 100 }] },
    ];
    const app = await appInMode("SIMULATION");
    const send = () => request(app)
      .post("/api/earnings/withdraw")
      .set("Authorization", `Bearer ${token()}`)
      .send({ amount_usd: 100 });

    const first = await send();
    const second = await send();

    // No ledger exists, so nothing is subtracted — this asserts the CURRENT limitation honestly
    // rather than pretending it is fixed. Both answers are explicitly not-a-withdrawal.
    expect(first.body.status).toBe("SIMULATED_NOT_WITHDRAWN");
    expect(second.body.status).toBe("SIMULATED_NOT_WITHDRAWN");
    expect(second.body.simulated).toBe(true);
  });
});

describe("the refusal is the default — a mode cannot make this real", () => {
  it("MS-10 an unrecognised mode falls back to DISABLED, not to permissive", async () => {
    jest.resetModules();
    process.env.AURA_MARKETPLACE_MODE = "LIVE";   // there is deliberately no LIVE
    const { marketplaceMode } = await import("../lib/marketplaceSettlement");
    expect(marketplaceMode()).toBe("DISABLED");
  });

  it("MS-11 an unset mode is DISABLED", async () => {
    delete process.env.AURA_MARKETPLACE_MODE;
    const { marketplaceMode } = await import("../lib/marketplaceSettlement");
    expect(marketplaceMode()).toBe("DISABLED");
  });
});
