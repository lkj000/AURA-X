import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import {
  planSet,
  getCamelotCode,
  getCompatibleKeys,
  harmonicCompatibilityScore,
  bpmCompatibilityScore,
  mixCompatibilityScore,
} from "@aura-x/ac-ami";
import type { SetTrack } from "@aura-x/ac-ami";

const router = Router();

// POST /api/dj/set-plan
// Body: { track_ids: string[], title?: string, target_duration_min?: number }
// Fetches tracks + evaluation scores, then calls planSet() to produce a
// phase-aware Amapiano set plan with ordered tracks and transition cues.
router.post("/set-plan", async (req: Request, res: Response): Promise<void> => {
  const { track_ids, title, target_duration_min } = req.body as {
    track_ids: unknown;
    title?: string;
    target_duration_min?: unknown;
  };

  if (!Array.isArray(track_ids)) {
    res.status(400).json({ error: "track_ids must be an array" });
    return;
  }
  if (track_ids.length < 2) {
    res.status(400).json({ error: "track_ids must contain at least 2 tracks" });
    return;
  }

  const durMin = typeof target_duration_min === "number"
    ? Math.min(180, Math.max(10, target_duration_min))
    : 45;

  // Fetch tracks
  const { data: tracks, error: tErr } = await supabase
    .from("tracks")
    .select("id, title, subgenre, bpm, key")
    .in("id", track_ids as string[]);

  if (tErr) {
    res.status(500).json({ error: tErr.message });
    return;
  }

  const found = (tracks ?? []) as { id: string; title: string; subgenre: string; bpm: number; key: string }[];
  const foundIds = found.map(t => t.id);
  const missing = (track_ids as string[]).filter(id => !foundIds.includes(id));
  if (missing.length > 0) {
    res.status(422).json({ error: "Some tracks not found", missing });
    return;
  }

  // Fetch evaluation scores for energy_mean proxy
  const { data: evals } = await supabase
    .from("evaluations")
    .select("track_id, composite_score")
    .in("track_id", foundIds)
    .order("composite_score", { ascending: false });

  const evalMap: Record<string, number> = {};
  for (const e of (evals ?? []) as { track_id: string; composite_score: number }[]) {
    if (!evalMap[e.track_id]) evalMap[e.track_id] = e.composite_score;
  }

  const setTracks: SetTrack[] = found.map(t => ({
    track_id:    t.id,
    title:       t.title,
    bpm:         t.bpm,
    key:         t.key ?? "C",
    subgenre:    t.subgenre,
    energy_mean: evalMap[t.id] ?? 0.5,
    duration_sec: 300,
    camelot_code: getCamelotCode(t.key ?? "C") ?? undefined,
  }));

  const plan = planSet(setTracks, {
    title:               title,
    target_duration_min: durMin,
  });

  res.json(plan);
});

// GET /api/dj/mix-score?track_a=<id>&track_b=<id>
// Returns harmonic, BPM, and overall mix compatibility scores between two tracks,
// plus Camelot codes and compatible key suggestions.
router.get("/mix-score", async (req: Request, res: Response): Promise<void> => {
  const trackAId = req.query.track_a as string | undefined;
  const trackBId = req.query.track_b as string | undefined;

  if (!trackAId) {
    res.status(400).json({ error: "track_a query parameter is required" });
    return;
  }
  if (!trackBId) {
    res.status(400).json({ error: "track_b query parameter is required" });
    return;
  }

  const [resA, resB] = await Promise.all([
    supabase.from("tracks").select("id, title, subgenre, bpm, key").eq("id", trackAId).maybeSingle(),
    supabase.from("tracks").select("id, title, subgenre, bpm, key").eq("id", trackBId).maybeSingle(),
  ]);

  if (!resA.data) { res.status(404).json({ error: "track_a not found" }); return; }
  if (!resB.data) { res.status(404).json({ error: "track_b not found" }); return; }

  const tA = resA.data as { id: string; title: string; subgenre: string; bpm: number; key: string };
  const tB = resB.data as { id: string; title: string; subgenre: string; bpm: number; key: string };

  const camelotA = getCamelotCode(tA.key ?? "C");
  const camelotB = getCamelotCode(tB.key ?? "C");

  const harmonic_score = camelotA && camelotB
    ? harmonicCompatibilityScore(camelotA, camelotB)
    : 0;

  const bpm_score     = bpmCompatibilityScore(tA.bpm, tB.bpm);
  const overall_score = mixCompatibilityScore(
    { key: tA.key ?? "C", bpm: tA.bpm },
    { key: tB.key ?? "C", bpm: tB.bpm },
  );

  const compatible_keys = camelotA ? getCompatibleKeys(camelotA) : [];

  res.json({
    track_a: { id: tA.id, title: tA.title, bpm: tA.bpm, key: tA.key, camelot: camelotA },
    track_b: { id: tB.id, title: tB.title, bpm: tB.bpm, key: tB.key, camelot: camelotB },
    bpm_score:       parseFloat(bpm_score.toFixed(3)),
    harmonic_score:  parseFloat(harmonic_score.toFixed(3)),
    overall_score:   parseFloat(overall_score.toFixed(3)),
    compatible_keys,
  });
});

export default router;
