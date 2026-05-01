import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { verifyToken } from "../middleware/auth";

const router = Router();

const NEXUS_BASE = process.env.NEXUS_API_URL ?? "http://localhost:3002";
const GIG_API_KEY = process.env.GIG_API_KEY ?? "";

const PLATFORM_SHARE_PCT = 20;
const PRODUCER_SHARE_PCT = 80;

interface Collaborator {
  artist_id: string;
  share_pct: number;
}

interface SplitEntry {
  artist_id: string;
  role: "producer" | "collaborator" | "platform";
  share_pct: number;
  amount_usd: number;
  nexus_payout_ref: string | null;
  nexus_payout?: Record<string, unknown>;
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
    headers: {
      "Content-Type": "application/json",
      "x-gig-api-key": GIG_API_KEY,
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`NEXUS payout failed: ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

// POST /api/royalties/split  (requires JWT)
router.post("/split", verifyToken, async (req: Request, res: Response): Promise<void> => {
  const { track_id, period, total_amount_usd, collaborators } = req.body as {
    track_id: string;
    period: string;
    total_amount_usd: number;
    collaborators?: Collaborator[];
  };

  if (!track_id || !period || total_amount_usd == null) {
    res.status(400).json({ error: "track_id, period, and total_amount_usd are required" });
    return;
  }
  if (typeof total_amount_usd !== "number" || total_amount_usd <= 0) {
    res.status(400).json({ error: "total_amount_usd must be a positive number" });
    return;
  }

  const collabs: Collaborator[] = Array.isArray(collaborators) ? collaborators : [];
  const collabTotal = collabs.reduce((sum, c) => sum + c.share_pct, 0);
  if (collabTotal >= PRODUCER_SHARE_PCT) {
    res.status(400).json({ error: "Collaborator shares cannot exceed producer share (80%)" });
    return;
  }

  // Verify track ownership
  const { data: track, error: trackError } = await supabase
    .from("tracks")
    .select("id, created_by")
    .eq("id", track_id)
    .maybeSingle();

  if (trackError) { res.status(500).json({ error: trackError.message }); return; }
  if (!track)     { res.status(404).json({ error: "Track not found" }); return; }

  // Prevent duplicate split for same period
  const { data: existing } = await supabase
    .from("royalty_splits")
    .select("id")
    .eq("track_id", track_id)
    .eq("period", period)
    .maybeSingle();

  if (existing) {
    res.status(409).json({ error: "Royalty split already exists for this track and period" });
    return;
  }

  // Build split entries
  const producerPct = PRODUCER_SHARE_PCT - collabTotal;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const entries: SplitEntry[] = [
    {
      artist_id: req.artist!.artist_id,
      role: "producer",
      share_pct: producerPct,
      amount_usd: round2((producerPct / 100) * total_amount_usd),
      nexus_payout_ref: null,
    },
    ...collabs.map((c) => ({
      artist_id: c.artist_id,
      role: "collaborator" as const,
      share_pct: c.share_pct,
      amount_usd: round2((c.share_pct / 100) * total_amount_usd),
      nexus_payout_ref: null,
    })),
    {
      artist_id: "platform",
      role: "platform" as const,
      share_pct: PLATFORM_SHARE_PCT,
      amount_usd: round2((PLATFORM_SHARE_PCT / 100) * total_amount_usd),
      nexus_payout_ref: null,
    },
  ];

  // Execute NEXUS payouts for non-platform entries
  let allPaid = true;
  for (const entry of entries) {
    if (entry.role === "platform") continue;
    try {
      const payout = await callNexusPayout({
        auraArtistId: entry.artist_id,
        amountUSD: entry.amount_usd,
        platform: "aura-x",
        period,
        userId: entry.artist_id,
      });
      entry.nexus_payout_ref = (payout.txId as string) ?? null;
      entry.nexus_payout = payout;
    } catch (e) {
      entry.nexus_payout_ref = null;
      entry.nexus_payout = { error: (e as Error).message };
      allPaid = false;
    }
  }

  const status = allPaid ? "PAID" : "FAILED";

  const { data: split, error: insertError } = await supabase
    .from("royalty_splits")
    .insert({
      track_id,
      period,
      total_amount_usd,
      splits: entries,
      status,
    })
    .select("id, status")
    .single();

  if (insertError) { res.status(500).json({ error: insertError.message }); return; }

  res.status(201).json({
    split_id: split.id,
    status: split.status,
    total_amount_usd,
    splits: entries,
  });
});

// GET /api/royalties/:trackId  (public)
router.get("/:trackId", async (req: Request, res: Response): Promise<void> => {
  const { trackId } = req.params;

  const { data: splits, error } = await supabase
    .from("royalty_splits")
    .select("id, period, total_amount_usd, splits, status, created_at")
    .eq("track_id", trackId)
    .order("created_at", { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }

  res.json({ track_id: trackId, splits: splits ?? [], count: (splits ?? []).length });
});

export default router;
