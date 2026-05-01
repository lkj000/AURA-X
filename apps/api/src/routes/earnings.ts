import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { verifyToken } from "../middleware/auth";

const router = Router();

const NEXUS_BASE  = process.env.NEXUS_API_URL ?? "http://localhost:3002";
const GIG_API_KEY = process.env.GIG_API_KEY   ?? "";

async function callNexusWithdraw(params: {
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
  if (!res.ok) throw new Error(`NEXUS withdraw failed: ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

// GET /api/earnings  — summary of paid royalty splits for the authenticated producer
router.get("/", verifyToken, async (req: Request, res: Response): Promise<void> => {
  const artistId = req.artist!.artist_id;

  const { data: splits, error } = await supabase
    .from("royalty_splits")
    .select("id, track_id, period, total_amount_usd, splits, status, created_at")
    .eq("status", "PAID");

  if (error) { res.status(500).json({ error: error.message }); return; }

  // Filter to rows where this artist appears in splits JSONB
  const mySplits = (splits ?? []).filter((row) => {
    const entries = row.splits as Array<{ artist_id: string; amount_usd: number }>;
    return entries.some((e) => e.artist_id === artistId);
  });

  const totalEarned = mySplits.reduce((sum, row) => {
    const entries = row.splits as Array<{ artist_id: string; amount_usd: number }>;
    const mine = entries.find((e) => e.artist_id === artistId);
    return sum + (mine?.amount_usd ?? 0);
  }, 0);

  const uniqueTracks = new Set(mySplits.map((r) => r.track_id as string)).size;

  res.json({
    artist_id:    artistId,
    total_earned: Math.round(totalEarned * 100) / 100,
    split_count:  mySplits.length,
    track_count:  uniqueTracks,
  });
});

// GET /api/earnings/history  — paginated list of all splits for this producer
router.get("/history", verifyToken, async (req: Request, res: Response): Promise<void> => {
  const artistId = req.artist!.artist_id;
  const pageNum  = Math.max(1, parseInt(req.query.page  as string) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const from = (pageNum - 1) * limitNum;
  const to   = from + limitNum - 1;

  const { data: splits, error } = await supabase
    .from("royalty_splits")
    .select("id, track_id, period, total_amount_usd, splits, status, created_at")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) { res.status(500).json({ error: error.message }); return; }

  const rows = (splits ?? [])
    .map((row) => {
      const entries = row.splits as Array<{ artist_id: string; amount_usd: number; role: string }>;
      const mine = entries.find((e) => e.artist_id === artistId);
      if (!mine) return null;
      return {
        split_id:      row.id,
        track_id:      row.track_id,
        period:        row.period,
        amount_usd:    mine.amount_usd,
        role:          mine.role,
        status:        row.status,
        created_at:    row.created_at,
      };
    })
    .filter(Boolean);

  res.json({ artist_id: artistId, history: rows, page: pageNum, limit: limitNum });
});

// POST /api/earnings/withdraw  — trigger withdrawal to NEXUS wallet
router.post("/withdraw", verifyToken, async (req: Request, res: Response): Promise<void> => {
  const artistId = req.artist!.artist_id;
  const { amount_usd } = req.body as { amount_usd: number };

  if (typeof amount_usd !== "number" || amount_usd <= 0) {
    res.status(400).json({ error: "amount_usd must be a positive number" });
    return;
  }

  // Verify available balance (sum of PAID splits for this artist)
  const { data: splits, error } = await supabase
    .from("royalty_splits")
    .select("splits")
    .eq("status", "PAID");

  if (error) { res.status(500).json({ error: error.message }); return; }

  const available = (splits ?? []).reduce((sum, row) => {
    const entries = row.splits as Array<{ artist_id: string; amount_usd: number }>;
    const mine = entries.find((e) => e.artist_id === artistId);
    return sum + (mine?.amount_usd ?? 0);
  }, 0);

  if (amount_usd > Math.round(available * 100) / 100) {
    res.status(422).json({ error: "Withdrawal amount exceeds available balance", available: Math.round(available * 100) / 100 });
    return;
  }

  const period = `withdraw-${Date.now()}`;
  let nexusPayout: Record<string, unknown>;
  try {
    nexusPayout = await callNexusWithdraw({
      auraArtistId: artistId,
      amountUSD:    amount_usd,
      platform:     "aura-x-withdrawal",
      period,
      userId:       artistId,
    });
  } catch (e) {
    res.status(502).json({ error: `NEXUS withdrawal failed: ${(e as Error).message}` });
    return;
  }

  res.status(200).json({
    status:       "WITHDRAWN",
    amount_usd,
    period,
    nexus_tx_id:  (nexusPayout.txId as string) ?? null,
    nexus_payout: nexusPayout,
  });
});

export default router;
