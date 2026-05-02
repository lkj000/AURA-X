import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { verifyToken } from "../middleware/auth";
import { planInstrumentation, applyInstrumentationPlan } from "@aura-x/ac-ami";
import type { InstrumentationPlannerOptions } from "@aura-x/ac-ami";
import type { CTLv1 } from "@aura-x/ctl";

const router = Router();

// ─── Shared helpers ───────────────────────────────────────────────────────────

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

async function persistCTL(
  trackId: string,
  ctl: CTLv1,
  newVersion: number,
): Promise<string | null> {
  await supabase
    .from("ctls")
    .update({ is_active: false })
    .eq("track_id", trackId)
    .eq("is_active", true);

  const { error } = await supabase
    .from("ctls")
    .insert({ track_id: trackId, ctl_json: ctl, version: newVersion, is_active: true });

  return error?.message ?? null;
}

function parseOpts(query: Record<string, unknown>): InstrumentationPlannerOptions {
  const clamp = (v: unknown, def = 0.5) => {
    const n = parseFloat(String(v));
    return isNaN(n) ? def : Math.min(1, Math.max(0, n));
  };

  const opts: InstrumentationPlannerOptions = {};
  if (query.intensity    !== undefined) opts.intensity    = clamp(query.intensity);
  if (query.warmth       !== undefined) opts.warmth       = clamp(query.warmth);
  if (query.rawness      !== undefined) opts.rawness      = clamp(query.rawness);
  if (query.vocalMode    !== undefined) {
    const vm = String(query.vocalMode);
    if (vm === "chant" || vm === "melodic" || vm === "none") opts.vocalMode = vm;
  }
  if (query.includeMbira !== undefined) opts.includeMbira = query.includeMbira === "true";
  return opts;
}

// ─────────────────────────────────────────────────────────────────────────────

// POST /api/tracks/:id/instrumentation/plan
// Query: ?intensity=0-1 &warmth=0-1 &rawness=0-1 &vocalMode=chant|melodic|none
//        &includeMbira=true|false
// Read-only: fetches active CTL, proposes an instrument list without writing.
router.post("/:id/instrumentation/plan", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const opts   = parseOpts({ ...req.query, ...req.body } as Record<string, unknown>);

  const active = await fetchActiveCTL(id);
  if (!active) {
    res.status(404).json({ error: "No active CTL found for this track" });
    return;
  }

  const instruments = planInstrumentation(active.ctl, opts);

  res.json({
    track_id:    id,
    ctl_version: active.version,
    options:     opts,
    instruments,
  });
});

// POST /api/tracks/:id/instrumentation/apply  (requires JWT)
// Body: { intensity?, warmth?, rawness?, vocalMode?, includeMbira?, persist? }
// Applies planInstrumentation to the active CTL. If persist=true, saves a
// new CTL version and deactivates the old one.
router.post("/:id/instrumentation/apply", verifyToken, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { persist, ...body } = req.body as Record<string, unknown> & { persist?: boolean };
  const opts = parseOpts(body);

  const active = await fetchActiveCTL(id);
  if (!active) {
    res.status(404).json({ error: "No active CTL found for this track" });
    return;
  }

  const updatedCTL = applyInstrumentationPlan(active.ctl, opts);

  if (persist) {
    const err = await persistCTL(id, updatedCTL, active.version + 1);
    if (err) {
      res.status(500).json({ error: `Failed to persist CTL: ${err}` });
      return;
    }
  }

  res.json({
    track_id:    id,
    ctl_version: persist ? active.version + 1 : active.version,
    persisted:   !!persist,
    options:     opts,
    ctl:         updatedCTL,
  });
});

export default router;
