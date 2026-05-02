import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { verifyToken } from "../middleware/auth";
import { conditionForMode2 } from "@aura-x/ac-ami";
import type { CTLv1 } from "@aura-x/ctl";

const router = Router();

async function fetchActiveCTL(trackId: string): Promise<{ ctl: CTLv1; version: number } | null> {
  const { data } = await supabase
    .from("ctls")
    .select("ctl_json, version")
    .eq("track_id", trackId)
    .eq("is_active", true)
    .maybeSingle();

  if (!data?.ctl_json) return null;
  return { ctl: data.ctl_json as CTLv1, version: data.version as number };
}

function parseConditioningOpts(body: Record<string, unknown>) {
  const opts: { targetBars?: 8 | 16 | 32; melodyUrl?: string } = {};

  const bars = Number(body.targetBars);
  if (bars === 8 || bars === 16 || bars === 32) opts.targetBars = bars;

  if (typeof body.melodyUrl === "string" && body.melodyUrl.length > 0) {
    opts.melodyUrl = body.melodyUrl;
  }

  return opts;
}

// POST /api/tracks/:id/condition
// Body: { targetBars?: 8|16|32, melodyUrl?: string }
// Read-only. Fetches the active CTL and computes the MusicGen conditioning
// parameters (prompt, duration, temperature, CFG) without writing anything.
router.post("/:id/condition", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const opts    = parseConditioningOpts(req.body as Record<string, unknown>);

  const active = await fetchActiveCTL(id);
  if (!active) {
    res.status(404).json({ error: "No active CTL found for this track" });
    return;
  }

  const result = conditionForMode2(active.ctl, opts);

  res.json({
    track_id:    id,
    ctl_version: active.version,
    ready:       true,
    prompt:      result.prompt,
    duration:    result.duration,
    notes:       result.notes,
    input:       result.input,
  });
});

// POST /api/tracks/:id/condition/apply  (requires JWT)
// Body: { targetBars?, melodyUrl?, persist?: boolean }
// Computes conditioning, then if persist=true creates a draft generation
// record in the generations table so the result is queued for Mode 2.
router.post("/:id/condition/apply", verifyToken, async (req: Request, res: Response): Promise<void> => {
  const { id }       = req.params;
  const body         = req.body as Record<string, unknown> & { persist?: boolean };
  const { persist }  = body;
  const opts         = parseConditioningOpts(body);

  const active = await fetchActiveCTL(id);
  if (!active) {
    res.status(404).json({ error: "No active CTL found for this track" });
    return;
  }

  const result = conditionForMode2(active.ctl, opts);

  let generation_id: string | null = null;

  if (persist) {
    const { data, error } = await supabase
      .from("generations")
      .insert({
        track_id:     id,
        mode:         "mode_2",
        status:       "draft",
        prompt_style: result.prompt.slice(0, 200),
      })
      .select("id")
      .single();

    if (error) {
      res.status(500).json({ error: `Failed to create generation record: ${error.message}` });
      return;
    }
    generation_id = (data as { id: string }).id;
  }

  res.json({
    track_id:      id,
    ctl_version:   active.version,
    ready:         true,
    persisted:     !!persist,
    generation_id,
    prompt:        result.prompt,
    duration:      result.duration,
    notes:         result.notes,
    input:         result.input,
  });
});

export default router;
