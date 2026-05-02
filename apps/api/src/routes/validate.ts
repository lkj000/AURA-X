import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import {
  validateAll,
  validateLineage,
  validateStyle,
  validateInstrumentation,
  validateHarmony,
} from "@aura-x/ac-ami";
import type { CTLv1 } from "@aura-x/ctl";

// ─── Shared helper ────────────────────────────────────────────────────────────

function domainBreakdown(ctl: CTLv1) {
  const lineage         = validateLineage(ctl);
  const style           = validateStyle(ctl);
  const instrumentation = validateInstrumentation(ctl);
  const harmony         = validateHarmony(ctl);
  const overall         = validateAll(ctl);

  return {
    overall: {
      passed:      overall.passed,
      issue_count: overall.issues.length,
      issues:      overall.issues,
    },
    domains: {
      lineage:         { passed: lineage.passed,         issue_count: lineage.issues.length,         issues: lineage.issues },
      style:           { passed: style.passed,           issue_count: style.issues.length,           issues: style.issues },
      instrumentation: { passed: instrumentation.passed, issue_count: instrumentation.issues.length, issues: instrumentation.issues },
      harmony:         { passed: harmony.passed,         issue_count: harmony.issues.length,         issues: harmony.issues },
    },
  };
}

// ─── Track-scoped router  (mount at /api/tracks) ─────────────────────────────

export const trackValidateRouter = Router();

// GET /api/tracks/:id/validate
// Validates the track's active CTL and returns a per-domain breakdown.
// No writes — read-only.
trackValidateRouter.get("/:id/validate", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const { data } = await supabase
    .from("ctls")
    .select("ctl_json, version")
    .eq("track_id", id)
    .eq("is_active", true)
    .maybeSingle();

  if (!data?.ctl_json) {
    res.status(404).json({ error: "No active CTL found for this track" });
    return;
  }

  const ctl = data.ctl_json as CTLv1;

  res.json({
    track_id:    id,
    ctl_version: data.version as number,
    ...domainBreakdown(ctl),
  });
});

// ─── Standalone router  (mount at /api/validate) ─────────────────────────────

export const validateRouter = Router();

// POST /api/validate/ctl
// Body: { ctl: CTLv1 }
// Validates an arbitrary CTL payload — useful as a pre-flight check before
// submitting a generation request. No track ID or DB access required.
validateRouter.post("/ctl", (req: Request, res: Response): void => {
  const { ctl } = req.body as { ctl: unknown };

  if (!ctl || typeof ctl !== "object") {
    res.status(400).json({ error: "ctl must be a CTLv1 object" });
    return;
  }

  res.json(domainBreakdown(ctl as CTLv1));
});
