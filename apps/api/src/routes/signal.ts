import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { evaluateSignal } from "@aura-x/ac-ami";
import type { ObservedFeatures } from "@aura-x/ac-ami";
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

// POST /api/tracks/:id/signal
// Body: { bpm, key, energy_mean, onset_density,
//         bpm_confidence?, mode?, key_confidence?,
//         energy_peak?, duration_sec?, low_mid_ratio?, spectral_centroid_hz? }
// Required: bpm, key, energy_mean, onset_density
// Scores how closely the observed audio features match the track's CTL targets.
router.post("/:id/signal", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const body   = req.body as Record<string, unknown>;

  // Validate required fields
  const missing: string[] = [];
  for (const field of ["bpm", "key", "energy_mean", "onset_density"]) {
    if (body[field] === undefined || body[field] === null) missing.push(field);
  }
  if (missing.length > 0) {
    res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
    return;
  }

  const bpm          = Number(body.bpm);
  const energy_mean  = Number(body.energy_mean);
  const onset_density = Number(body.onset_density);

  if (isNaN(bpm) || isNaN(energy_mean) || isNaN(onset_density)) {
    res.status(400).json({ error: "bpm, energy_mean, and onset_density must be numbers" });
    return;
  }

  const active = await fetchActiveCTL(id);
  if (!active) {
    res.status(404).json({ error: "No active CTL found for this track" });
    return;
  }

  const observed: ObservedFeatures = {
    bpm,
    bpm_confidence:       Number(body.bpm_confidence    ?? 1),
    key:                  String(body.key),
    mode:                 String(body.mode               ?? "minor"),
    key_confidence:       Number(body.key_confidence    ?? 1),
    energy_mean,
    energy_peak:          Number(body.energy_peak       ?? energy_mean),
    onset_density,
    duration_sec:         Number(body.duration_sec      ?? 30),
    ...(body.low_mid_ratio        !== undefined ? { low_mid_ratio:        Number(body.low_mid_ratio) }        : {}),
    ...(body.spectral_centroid_hz !== undefined ? { spectral_centroid_hz: Number(body.spectral_centroid_hz) } : {}),
  };

  const score_report = evaluateSignal(active.ctl, observed);

  res.json({
    track_id:    id,
    ctl_version: active.version,
    observed,
    score_report,
  });
});

export default router;
