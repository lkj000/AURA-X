import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { verifyToken } from "../middleware/auth";
import {
  validateAll,
  recommendMutations,
  applyMutations,
  repairCTL,
} from "@aura-x/ac-ami";
import type { MutationId } from "@aura-x/ac-ami";
import type { CTLv1 } from "@aura-x/ctl";

const router = Router();

// ─── Shared helper ───────────────────────────────────────────────────────────

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

async function persistMutatedCTL(
  trackId: string,
  ctl: CTLv1,
  newVersion: number,
): Promise<{ error: string | null }> {
  // Deactivate current version
  await supabase
    .from("ctls")
    .update({ is_active: false })
    .eq("track_id", trackId)
    .eq("is_active", true);

  const { error } = await supabase
    .from("ctls")
    .insert({ track_id: trackId, ctl_json: ctl, version: newVersion, is_active: true });

  return { error: error?.message ?? null };
}

// ─────────────────────────────────────────────────────────────────────────────

// POST /api/tracks/:id/mutate/recommend
// Validates the track's active CTL and returns a ranked list of recommended
// mutations without applying them. Read-only — no DB writes.
router.post("/:id/mutate/recommend", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const active = await fetchActiveCTL(id);
  if (!active) {
    res.status(404).json({ error: "No active CTL found for this track" });
    return;
  }

  const validation   = validateAll(active.ctl);
  const recommended  = recommendMutations(validation.issues);

  res.json({
    track_id:             id,
    ctl_version:          active.version,
    validation: {
      passed:     validation.passed,
      issue_count: validation.issues.length,
      issues:     validation.issues,
    },
    recommended_mutations: recommended,
  });
});

// POST /api/tracks/:id/mutate/apply  (requires JWT)
// Body: { mutations: MutationId[], persist?: boolean }
// Applies the specified mutations to the active CTL in sequence.
// If persist is true, inserts a new active CTL version and deactivates the old one.
router.post("/:id/mutate/apply", verifyToken, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { mutations, persist } = req.body as { mutations: unknown; persist?: boolean };

  if (!Array.isArray(mutations) || mutations.length === 0) {
    res.status(400).json({ error: "mutations must be a non-empty array of MutationId" });
    return;
  }

  const active = await fetchActiveCTL(id);
  if (!active) {
    res.status(404).json({ error: "No active CTL found for this track" });
    return;
  }

  const { ctl: mutatedCTL, log } = applyMutations(active.ctl, mutations as MutationId[]);

  if (persist) {
    const { error } = await persistMutatedCTL(id, mutatedCTL, active.version + 1);
    if (error) {
      res.status(500).json({ error: `Failed to persist CTL: ${error}` });
      return;
    }
  }

  res.json({
    track_id:    id,
    ctl_version: persist ? active.version + 1 : active.version,
    persisted:   !!persist,
    log,
    ctl:         mutatedCTL,
  });
});

// POST /api/tracks/:id/mutate/repair  (requires JWT)
// Body: { max_iterations?: number (1-5), persist?: boolean }
// Runs the full validate→recommend→apply repair loop up to max_iterations.
// Returns the repaired CTL with iteration log and final pass/fail status.
router.post("/:id/mutate/repair", verifyToken, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { max_iterations, persist } = req.body as { max_iterations?: unknown; persist?: boolean };

  const maxIter = typeof max_iterations === "number"
    ? Math.min(5, Math.max(1, max_iterations))
    : 3;

  const active = await fetchActiveCTL(id);
  if (!active) {
    res.status(404).json({ error: "No active CTL found for this track" });
    return;
  }

  const result = repairCTL(active.ctl, maxIter);

  if (persist) {
    const { error } = await persistMutatedCTL(id, result.ctl, active.version + 1);
    if (error) {
      res.status(500).json({ error: `Failed to persist CTL: ${error}` });
      return;
    }
  }

  res.json({
    track_id:    id,
    ctl_version: persist ? active.version + 1 : active.version,
    persisted:   !!persist,
    passed:      result.passed,
    iterations:  result.iterations,
    log:         result.log,
    ctl:         result.ctl,
  });
});

export default router;
