import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const router = Router();

// POST /api/feedback/rate
// Body: { track_id, generation_id, rating, subgenre_notes?, cultural_accuracy?,
//         ctl_snapshot?, composite_score?, subgenre?, bpm?, key? }
router.post("/rate", async (req: Request, res: Response): Promise<void> => {
  const {
    track_id,
    generation_id,
    rating,
    subgenre_notes,
    cultural_accuracy,
    ctl_snapshot,
    composite_score,
    subgenre,
    bpm,
    key,
  } = req.body;

  if (!track_id) {
    res.status(400).json({ error: "track_id is required" });
    return;
  }

  if (!generation_id) {
    res.status(400).json({ error: "generation_id is required" });
    return;
  }

  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    res.status(400).json({ error: "rating must be an integer between 1 and 5" });
    return;
  }

  // Duplicate guard — one rating per generation
  const { data: existing } = await supabase
    .from("producer_feedback")
    .select("id")
    .eq("generation_id", generation_id)
    .maybeSingle();

  if (existing) {
    res.status(409).json({ error: "generation_id already rated", generation_id });
    return;
  }

  const promoted_to_gold = rating >= 4 && !!ctl_snapshot;

  // Always insert into producer_feedback
  const { data: fbData, error: fbError } = await supabase
    .from("producer_feedback")
    .insert({
      track_id,
      generation_id,
      rating,
      subgenre_notes: subgenre_notes ?? null,
      cultural_accuracy: cultural_accuracy ?? null,
      promoted_to_gold,
    })
    .select("id")
    .single();

  if (fbError || !fbData) {
    res.status(500).json({ error: `Failed to save feedback: ${fbError?.message}` });
    return;
  }

  // Promote to gold only when rating >= 4 and CTL is present
  if (promoted_to_gold) {
    await supabase.from("gold_standard_generations").insert({
      track_id,
      generation_id,
      subgenre:         subgenre ?? "unknown",
      bpm:              bpm ?? 110,
      key:              key ?? "F#m",
      ctl_snapshot,
      composite_score:  composite_score ?? 0,
      producer_score:   rating,
      producer_notes:   subgenre_notes ?? null,
      cultural_accuracy: cultural_accuracy ?? null,
      source:           "producer_rating",
    });
  }

  res.json({ feedback_id: fbData.id, promoted_to_gold });
});

// ─────────────────────────────────────────────────────────────────────────────

function round2(v: number): number {
  return parseFloat(v.toFixed(2));
}

type GoldRecord = { subgenre: string; key: string; bpm: number | string; producer_score: number };

// GET /api/feedback/insights
// Returns aggregate statistics derived from gold-standard generations:
//   top_lanes, top_keys (by avg producer_score), bpm_distribution, total_gold.
router.get("/insights", async (_req: Request, res: Response): Promise<void> => {
  const { data: gold, error } = await supabase
    .from("gold_standard_generations")
    .select("subgenre, key, bpm, producer_score");

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const records = (gold ?? []) as GoldRecord[];
  const total_gold = records.length;

  const laneMap: Record<string, { total: number; count: number }> = {};
  const keyMap:  Record<string, { total: number; count: number }> = {};
  const bpms: number[] = [];

  for (const r of records) {
    if (!laneMap[r.subgenre]) laneMap[r.subgenre] = { total: 0, count: 0 };
    laneMap[r.subgenre].total += r.producer_score;
    laneMap[r.subgenre].count++;

    if (!keyMap[r.key]) keyMap[r.key] = { total: 0, count: 0 };
    keyMap[r.key].total += r.producer_score;
    keyMap[r.key].count++;

    bpms.push(Number(r.bpm));
  }

  const top_lanes = Object.entries(laneMap)
    .map(([lane, { total, count }]) => ({ lane, avg_score: round2(total / count), count }))
    .sort((a, b) => b.avg_score - a.avg_score);

  const top_keys = Object.entries(keyMap)
    .map(([key, { total, count }]) => ({ key, avg_score: round2(total / count), count }))
    .sort((a, b) => b.avg_score - a.avg_score);

  const bpm_distribution = bpms.length > 0 ? {
    min:  Math.min(...bpms),
    max:  Math.max(...bpms),
    mean: round2(bpms.reduce((s, v) => s + v, 0) / bpms.length),
  } : null;

  res.json({ total_gold, top_lanes, top_keys, bpm_distribution });
});

// GET /api/feedback/gold
// Query: ?subgenre= &page= &limit= (default limit 20, max 50)
// Returns paginated list of gold-standard generations ordered by composite_score desc.
router.get("/gold", async (req: Request, res: Response): Promise<void> => {
  const subgenre  = req.query.subgenre as string | undefined;
  const pageNum   = Math.max(1, parseInt(req.query.page  as string) || 1);
  const limitNum  = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const from = (pageNum - 1) * limitNum;
  const to   = from + limitNum - 1;

  let query = supabase
    .from("gold_standard_generations")
    .select(
      "id, track_id, generation_id, subgenre, bpm, key, composite_score, producer_score, created_at",
      { count: "exact" },
    )
    .order("composite_score", { ascending: false })
    .range(from, to);

  if (subgenre) query = query.eq("subgenre", subgenre);

  const { data, count, error } = await query;

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ gold: data ?? [], total: count ?? 0, page: pageNum, limit: limitNum });
});

export default router;
