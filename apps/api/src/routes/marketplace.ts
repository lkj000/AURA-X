import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { supabase } from "../lib/supabase";
import { verifyToken } from "../middleware/auth";
import {
  marketplaceMode,
  SIMULATED_LICENSE_STATUS,
  SIMULATED_SPLIT_STATUS,
  SIMULATION_NOTICE,
  settlementUnavailable,
} from "../lib/marketplaceSettlement";

const router = Router();

const NEXUS_BASE  = process.env.NEXUS_API_URL ?? "http://localhost:3002";
const GIG_API_KEY = process.env.GIG_API_KEY   ?? "";
const JWT_SECRET  = process.env.JWT_SECRET     ?? "dev-secret";

const TIER_PRICES: Record<string, number> = {
  STANDARD:  25,
  PREMIUM:  150,
  EXCLUSIVE: 500,
};

const PLATFORM_PCT = 20;

/**
 * IS THIS TRACK PURCHASABLE? ASKED IN ONE PLACE, BY BOTH CALLERS.
 *
 * The listing required a passed gate AND `suno_approved`. The purchase handler required only the
 * passed gate — so a track deliberately withheld from the marketplace could still be licensed by
 * anyone who knew its id. Two gates over one decision, and the stricter one was the one a buyer never
 * had to pass through.
 *
 * Returns a reason rather than a boolean: the caller has to explain the refusal, and "not eligible"
 * with no cause is the kind of message that gets debugged by reading the source.
 */
export async function trackPurchasability(
  trackId: string,
): Promise<
  | { ok: true; createdBy: string }
  | { ok: false; status: number; reason: string; error: string }
> {
  const { data: track, error: trackError } = await supabase
    .from("tracks")
    .select("id, created_by, suno_approved")
    .eq("id", trackId)
    .maybeSingle();

  if (trackError) return { ok: false, status: 500, reason: "LOOKUP_FAILED", error: trackError.message };
  if (!track)     return { ok: false, status: 404, reason: "TRACK_NOT_FOUND", error: "Track not found" };

  const { data: evalData } = await supabase
    .from("evaluations")
    .select("passed_gate")
    .eq("track_id", trackId)
    .eq("passed_gate", true)
    .limit(1)
    .maybeSingle();

  if (!evalData) {
    return { ok: false, status: 422, reason: "GATE_NOT_PASSED", error: "Track has not passed the quality gate" };
  }

  // The check the purchase path never made. A track is listed only when BOTH hold; it must be
  // licensable only when both hold too, or the listing rule is advisory.
  if (track.suno_approved !== true) {
    return {
      ok: false,
      status: 422,
      reason: "NOT_APPROVED",
      error: "Track has not been approved for the marketplace",
    };
  }

  const { data: exclusiveLicense } = await supabase
    .from("track_licenses")
    .select("id")
    .eq("track_id", trackId)
    .eq("platform", "marketplace-exclusive")
    .maybeSingle();

  if (exclusiveLicense) {
    return {
      ok: false,
      status: 409,
      reason: "ALREADY_EXCLUSIVE",
      error: "Track has already been exclusively licensed",
    };
  }

  // The caller needs the producer id and this function has already fetched it. Returning it here
  // removes a second lookup that could, between the two queries, disagree with the first.
  return { ok: true, createdBy: track.created_by as string };
}

async function callNexusPayout(params: {
  auraArtistId: string;
  amountUSD: number;
  platform: string;
  period: string;
  userId: string;
}): Promise<Record<string, unknown>> {
  const res = await fetch(`${NEXUS_BASE}/api/creator/aura-payout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-gig-api-key": GIG_API_KEY },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`NEXUS payout failed: ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

// GET /api/marketplace  — tracks that passed the quality gate and are not exclusively sold
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const pageNum  = Math.max(1, parseInt(req.query.page  as string) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const from = (pageNum - 1) * limitNum;
  const to   = from + limitNum - 1;

  // Tracks that passed the quality gate
  const { data: evals, error: evalError } = await supabase
    .from("evaluations")
    .select("track_id")
    .eq("passed_gate", true);

  if (evalError) { res.status(500).json({ error: evalError.message }); return; }

  const passedIds = [...new Set((evals ?? []).map((e) => e.track_id as string))];
  if (passedIds.length === 0) {
    res.json({ listings: [], total: 0, page: pageNum, limit: limitNum });
    return;
  }

  // Require Suno external classification approval
  const { data: sunoApproved } = await supabase
    .from("tracks")
    .select("id")
    .in("id", passedIds)
    .eq("suno_approved", true);

  const sunoApprovedIds = new Set((sunoApproved ?? []).map((t) => t.id as string));
  const gatedIds = passedIds.filter((id) => sunoApprovedIds.has(id));

  if (gatedIds.length === 0) {
    res.json({ listings: [], total: 0, page: pageNum, limit: limitNum });
    return;
  }

  // Exclude exclusively sold tracks
  const { data: exclusive } = await supabase
    .from("track_licenses")
    .select("track_id")
    .eq("platform", "marketplace-exclusive");

  const exclusiveIds = new Set((exclusive ?? []).map((e) => e.track_id as string));
  const availableIds = gatedIds.filter((id) => !exclusiveIds.has(id));

  if (availableIds.length === 0) {
    res.json({ listings: [], total: 0, page: pageNum, limit: limitNum });
    return;
  }

  const { data: tracks, error: trackError } = await supabase
    .from("tracks")
    .select("id, title, subgenre, bpm, key, created_by, created_at")
    .in("id", availableIds)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (trackError) { res.status(500).json({ error: trackError.message }); return; }

  const listings = (tracks ?? []).map((t) => ({
    ...t,
    tiers: {
      STANDARD:  { price_usd: TIER_PRICES.STANDARD,  rights: "Non-exclusive, digital only" },
      PREMIUM:   { price_usd: TIER_PRICES.PREMIUM,   rights: "Non-exclusive, sync rights" },
      EXCLUSIVE: { price_usd: TIER_PRICES.EXCLUSIVE, rights: "Full ownership transfer" },
    },
  }));

  res.json({ listings, total: availableIds.length, page: pageNum, limit: limitNum });
});

// POST /api/marketplace/:trackId/license  (requires JWT)
router.post("/:trackId/license", verifyToken, async (req: Request, res: Response): Promise<void> => {
  const { trackId } = req.params;
  const { tier }    = req.body as { tier: string };

  if (!tier || !TIER_PRICES[tier]) {
    res.status(400).json({ error: "tier must be STANDARD, PREMIUM, or EXCLUSIVE" });
    return;
  }

  // ONE eligibility decision, shared with the listing. Previously the listing required a passed gate
  // AND suno_approved while this path required only the gate — so a track withheld from the
  // marketplace could still be licensed by anyone who knew its id.
  const eligibility = await trackPurchasability(trackId);
  if (!eligibility.ok) {
    res.status(eligibility.status).json({ error: eligibility.error, reason: eligibility.reason });
    return;
  }

  // AND ONLY THEN THE SETTLEMENT GATE, IMMEDIATELY BEFORE THE FIRST WRITE.
  //
  // Order matters and was wrong at first. Gating before the eligibility checks turned a nonexistent
  // track into a 503 — the caller told "we cannot settle" when the truthful answer was "no such
  // track". Eligibility is read-only and answers a question about the REQUEST; settlement answers a
  // question about the PLATFORM. Both are worth knowing, and the request-level answer is the one the
  // caller can act on.
  //
  // What must not move is the gate's position relative to the WRITES: everything below records that
  // money moved, and this route used to issue an ACTIVE licence and trigger a producer payout with no
  // buyer charge anywhere in the path.
  // Captured once here, so a single request cannot straddle two policies.
  const mode = marketplaceMode();
  if (mode === "DISABLED") {
    const refusal = settlementUnavailable("Licensing");
    res.status(refusal.status).json(refusal.body);
    return;
  }

  const priceUSD  = TIER_PRICES[tier];
  const period    = `mkt-${Date.now()}`;
  const platform  = `marketplace-${tier.toLowerCase()}`;
  const producerId = eligibility.createdBy;

  // Trigger royalty split: 80% producer, 20% platform
  const producerAmt = Math.round((priceUSD * 0.8) * 100) / 100;
  let nexusPayout: Record<string, unknown> = {};
  try {
    nexusPayout = await callNexusPayout({
      auraArtistId: producerId,
      amountUSD:    producerAmt,
      platform,
      period,
      userId:       producerId,
    });
  } catch (e) {
    nexusPayout = { error: (e as Error).message };
  }

  const splitEntries = [
    {
      artist_id: producerId,
      role: "producer",
      share_pct: 80,
      amount_usd: producerAmt,
      nexus_payout_ref: (nexusPayout.txId as string) ?? null,
      nexus_payout: nexusPayout,
    },
    {
      artist_id: "platform",
      role: "platform",
      share_pct: PLATFORM_PCT,
      amount_usd: Math.round((priceUSD * 0.2) * 100) / 100,
      nexus_payout_ref: null,
    },
  ];

  // NOT "PAID". `callNexusPayout` reaches a NEXUS function that performs arithmetic and returns a
  // receipt-shaped object — no wallet credit, no transaction row. Reading the absence of an error as
  // payment is how simulated accounting came to be presented as settlement. A failure is still worth
  // distinguishing from a success, but neither is a payment.
  const splitStatus = nexusPayout.error ? "FAILED" : SIMULATED_SPLIT_STATUS;

  const { data: split, error: splitError } = await supabase
    .from("royalty_splits")
    .insert({ track_id: trackId, period, total_amount_usd: priceUSD, splits: splitEntries, status: splitStatus })
    .select("id")
    .single();

  if (splitError) { res.status(500).json({ error: splitError.message }); return; }

  // Record license
  const { data: license, error: licenseError } = await supabase
    .from("track_licenses")
    .insert({
      track_id:     trackId,
      artist_id:    req.artist!.artist_id,
      platform,
      period,
      amount_usd:   priceUSD,
      nexus_payout: nexusPayout,
      // NOT "active". An active licence is a right the buyer paid for; nobody paid.
      status:       SIMULATED_LICENSE_STATUS,
    })
    .select("id")
    .single();

  if (licenseError) { res.status(500).json({ error: licenseError.message }); return; }

  // Access token — permanent for EXCLUSIVE, 1 year otherwise
  const expiresIn = tier === "EXCLUSIVE" ? "100y" : "1y";
  const accessToken = jwt.sign(
    { track_id: trackId, tier, buyer_id: req.artist!.artist_id },
    JWT_SECRET,
    { expiresIn },
  );

  // The notice is spread in so a client checking only for a 2xx still receives `simulated: true`
  // rather than a bare success. That is the exact failure this whole change exists to stop: reading
  // the absence of an error as evidence that money moved.
  res.status(201).json({
    ...SIMULATION_NOTICE,
    license_id:     license.id,
    split_id:       split.id,
    tier,
    price_usd:      priceUSD,
    amount_charged: 0,
    access_token:   accessToken,
    license_status: SIMULATED_LICENSE_STATUS,
    split_status:   splitStatus,
  });
});

export default router;
