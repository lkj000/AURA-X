import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { verifyToken } from "../middleware/auth";

const router = Router();

const NEXUS_BASE = process.env.NEXUS_API_URL ?? "http://localhost:3002";
const GIG_API_KEY = process.env.GIG_API_KEY ?? "";

async function callNexusPayout(params: {
  auraArtistId: string;
  amountUSD: number;
  platform: string;
  period: string;
  userId: string;
}): Promise<Record<string, unknown>> {
  const res = await fetch(`${NEXUS_BASE}/api/creator/aura-payout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-gig-api-key": GIG_API_KEY,
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`NEXUS payout failed: ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

// POST /api/licensing/claim  (requires JWT)
router.post("/claim", verifyToken, async (req: Request, res: Response): Promise<void> => {
  const { track_id, platform, period, amount_usd } = req.body;

  if (!track_id || !platform || !period || amount_usd == null) {
    res.status(400).json({ error: "track_id, platform, period, and amount_usd are required" });
    return;
  }
  if (typeof amount_usd !== "number" || amount_usd <= 0) {
    res.status(400).json({ error: "amount_usd must be a positive number" });
    return;
  }

  const { data: track, error: trackError } = await supabase
    .from("tracks")
    .select("id, created_by")
    .eq("id", track_id)
    .maybeSingle();

  if (trackError) { res.status(500).json({ error: trackError.message }); return; }
  if (!track)     { res.status(404).json({ error: "Track not found" }); return; }

  const { data: existing } = await supabase
    .from("track_licenses")
    .select("id")
    .eq("track_id", track_id)
    .eq("period", period)
    .maybeSingle();

  if (existing) {
    res.status(409).json({ error: "License already claimed for this track and period" });
    return;
  }

  let nexusPayout: Record<string, unknown> = {};
  try {
    nexusPayout = await callNexusPayout({
      auraArtistId: req.artist!.artist_id,
      amountUSD: amount_usd,
      platform,
      period,
      userId: req.artist!.artist_id,
    });
  } catch (e) {
    nexusPayout = { error: (e as Error).message };
  }

  const { data: license, error: insertError } = await supabase
    .from("track_licenses")
    .insert({
      track_id,
      artist_id: req.artist!.artist_id,
      platform,
      period,
      amount_usd,
      nexus_payout: nexusPayout,
      status: "claimed",
    })
    .select("id")
    .single();

  if (insertError) { res.status(500).json({ error: insertError.message }); return; }

  res.status(201).json({ license_id: license.id, nexus_payout: nexusPayout });
});

// GET /api/licensing/:trackId  (public)
router.get("/:trackId", async (req: Request, res: Response): Promise<void> => {
  const { trackId } = req.params;

  const { data: licenses, error } = await supabase
    .from("track_licenses")
    .select("id, platform, period, amount_usd, status, created_at, nexus_payout")
    .eq("track_id", trackId)
    .order("created_at", { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }

  res.json({ track_id: trackId, licenses: licenses ?? [], count: (licenses ?? []).length });
});

export default router;
