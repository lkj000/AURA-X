import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { verifyToken } from "../middleware/auth";
import { evaluateBuffer, generateProductionReport } from "@aura-x/engine";

const router = Router();

// GET /api/tracks
// Query: ?subgenre= &bpm_min= &bpm_max= &key= &page= &limit=
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { subgenre, bpm_min, bpm_max, key } = req.query;
  const pageNum  = Math.max(1, parseInt(req.query.page  as string) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const from = (pageNum - 1) * limitNum;
  const to   = from + limitNum - 1;

  let query = supabase
    .from("tracks")
    .select("id, title, subgenre, bpm, key, created_by, created_at", { count: "exact" });

  if (subgenre) query = query.eq("subgenre", subgenre as string);
  if (bpm_min)  query = query.gte("bpm", Number(bpm_min));
  if (bpm_max)  query = query.lte("bpm", Number(bpm_max));
  if (key)      query = query.eq("key", key as string);

  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data: tracks, count, error } = await query;

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const trackIds = (tracks ?? []).map((t) => t.id);
  const scoresMap: Record<string, number> = {};
  const genMap:    Record<string, string> = {};

  if (trackIds.length > 0) {
    const { data: evals } = await supabase
      .from("evaluations")
      .select("track_id, composite_score")
      .in("track_id", trackIds)
      .order("composite_score", { ascending: false });

    for (const e of evals ?? []) {
      if (e.track_id && !scoresMap[e.track_id]) {
        scoresMap[e.track_id] = e.composite_score;
      }
    }

    const { data: gens } = await supabase
      .from("generations")
      .select("id, track_id")
      .in("track_id", trackIds)
      .order("created_at", { ascending: false });

    for (const g of gens ?? []) {
      if (g.track_id && !genMap[g.track_id]) {
        genMap[g.track_id] = g.id;
      }
    }
  }

  const enriched = (tracks ?? []).map((t) => ({
    ...t,
    composite_score: scoresMap[t.id] ?? null,
    generation_id:   genMap[t.id]    ?? null,
  }));

  res.json({ tracks: enriched, total: count ?? 0, page: pageNum, limit: limitNum });
});

// GET /api/tracks/:id
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const { data: track, error: trackError } = await supabase
    .from("tracks")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (trackError) {
    res.status(500).json({ error: trackError.message });
    return;
  }
  if (!track) {
    res.status(404).json({ error: "Track not found" });
    return;
  }

  const [ctlRes, genRes, evalRes, fbRes] = await Promise.all([
    supabase.from("ctls").select("ctl_json, version").eq("track_id", id).eq("is_active", true).maybeSingle(),
    supabase.from("generations").select("id, mode, status, prompt_style, created_at").eq("track_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("evaluations").select("composite_score, passed_gate, authenticity_score, groove_clarity_score").eq("track_id", id).order("composite_score", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("producer_feedback").select("rating").eq("track_id", id),
  ]);

  const ratings = ((fbRes.data ?? []) as { rating: number }[]).map((f) => f.rating);
  const feedback_count = ratings.length;
  const feedback_avg   = feedback_count > 0
    ? parseFloat((ratings.reduce((a, b) => a + b, 0) / feedback_count).toFixed(2))
    : null;

  res.json({
    ...track,
    ctl_snapshot:    ctlRes.data?.ctl_json ?? null,
    generation:      genRes.data ?? null,
    composite_score: evalRes.data?.composite_score ?? null,
    passed_gate:     evalRes.data?.passed_gate ?? null,
    feedback_count,
    feedback_avg,
  });
});

// POST /api/tracks/:id/report
// Downloads the latest raw_generation audio for the track, runs the full
// engine evaluation stack, and returns a ProductionReport (grade, mix spec,
// sample recommendations, arrangement arc, ranked recommendations).
router.post("/:id/report", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const { data: track } = await supabase.from("tracks").select("id").eq("id", id).maybeSingle();
  if (!track) { res.status(404).json({ error: "Track not found" }); return; }

  const { data: audioFile } = await supabase
    .from("audio_files")
    .select("storage_path")
    .eq("track_id", id)
    .eq("file_type", "raw_generation")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!audioFile) {
    res.status(422).json({ error: "No audio available for this track — generate first" });
    return;
  }

  const { data: blob, error: dlError } = await supabase.storage
    .from("aura-x-audio")
    .download(audioFile.storage_path);

  if (dlError || !blob) {
    res.status(500).json({ error: "Failed to retrieve audio file" });
    return;
  }

  const audioBuffer = Buffer.from(await (blob as Blob).arrayBuffer());

  try {
    const evaluation = evaluateBuffer(audioBuffer);
    const report     = generateProductionReport(evaluation);
    res.json(report);
  } catch {
    res.status(422).json({ error: "Audio could not be analysed — WAV 16-bit PCM required" });
  }
});

// POST /api/tracks/:id/suno-result  (requires JWT)
// Body: { approved: boolean, style_tag?: string }
router.post("/:id/suno-result", verifyToken, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { approved, style_tag } = req.body as { approved: unknown; style_tag?: string };

  if (typeof approved !== "boolean") {
    res.status(400).json({ error: "approved must be a boolean" });
    return;
  }

  const { data, error } = await supabase
    .from("tracks")
    .update({
      suno_approved:      approved,
      suno_classified_at: new Date().toISOString(),
      suno_style_tag:     style_tag ?? null,
    })
    .eq("id", id)
    .select("id, title, suno_approved, suno_classified_at, suno_style_tag")
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  if (!data)  { res.status(404).json({ error: "Track not found" }); return; }

  res.json(data);
});

export default router;
