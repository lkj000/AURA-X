import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { supabase } from "../lib/supabase";
import { verifyToken } from "../middleware/auth";

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

  // Verify track exists and passed gate
  const { data: track, error: trackError } = await supabase
    .from("tracks")
    .select("id, created_by")
    .eq("id", trackId)
    .maybeSingle();

  if (trackError) { res.status(500).json({ error: trackError.message }); return; }
  if (!track)     { res.status(404).json({ error: "Track not found" }); return; }

  const { data: evalData } = await supabase
    .from("evaluations")
    .select("passed_gate")
    .eq("track_id", trackId)
    .eq("passed_gate", true)
    .limit(1)
    .maybeSingle();

  if (!evalData) {
    res.status(422).json({ error: "Track has not passed the quality gate" });
    return;
  }

  // Prevent purchase if already exclusively sold
  const { data: exclusiveLicense } = await supabase
    .from("track_licenses")
    .select("id")
    .eq("track_id", trackId)
    .eq("platform", "marketplace-exclusive")
    .maybeSingle();

  if (exclusiveLicense) {
    res.status(409).json({ error: "Track has already been exclusively licensed" });
    return;
  }

  const priceUSD  = TIER_PRICES[tier];
  const period    = `mkt-${Date.now()}`;
  const platform  = `marketplace-${tier.toLowerCase()}`;
  const producerId = track.created_by as string;

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

  const splitStatus = nexusPayout.error ? "FAILED" : "PAID";

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
      status:       "active",
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

  res.status(201).json({
    license_id:   license.id,
    split_id:     split.id,
    tier,
    price_usd:    priceUSD,
    access_token: accessToken,
    split_status: splitStatus,
  });
});

export default router;
