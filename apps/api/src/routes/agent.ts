import { Router, Request, Response } from "express";
import { CTLv1Schema } from "@aura-x/ctl";
import { runRevisionLoop } from "../agent/revisionLoop";

const router = Router();

// POST /api/agent/revise
// Body: { track_id, ctl_id, ctl, max_iterations? }
// Runs revision loop: evaluate → mutate → regenerate (max 3 iterations)
router.post("/revise", async (req: Request, res: Response): Promise<void> => {
  const { track_id, ctl_id, max_iterations } = req.body;

  if (!track_id || !ctl_id) {
    res.status(400).json({ error: "track_id and ctl_id are required" });
    return;
  }

  const parsed = CTLv1Schema.safeParse(req.body.ctl);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid CTL", issues: parsed.error.issues });
    return;
  }

  const result = await runRevisionLoop({
    track_id,
    ctl_id,
    ctl: parsed.data,
    max_iterations: max_iterations ?? 3,
  });

  res.json(result);
});

// GET /api/agent/status
router.get("/status", (_req: Request, res: Response): void => {
  res.json({
    agent: "AURA X",
    level: 5,
    capabilities: ["generate", "evaluate", "revise", "store", "learn"],
    revision_loop: {
      max_iterations: 3,
      evaluators: ["lineage", "style", "instrumentation", "harmony"],
      mutation_engine: "9 operations",
    },
  });
});

export default router;
