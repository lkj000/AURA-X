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

export default router;
