import { Router, Request, Response } from "express";
import { CTLv1Schema } from "@aura-x/ctl";
import { runRevisionLoop } from "../agent/revisionLoop";
import { tuneWeightsForSubgenre } from "../agent/weightTuner";
import { buildDataset } from "../agent/datasetBuilder";

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

// POST /api/agent/tune
// Body: { subgenre, min_score? }
router.post("/tune", async (req: Request, res: Response): Promise<void> => {
  const { subgenre, min_score } = req.body;
  if (!subgenre) {
    res.status(400).json({ error: "subgenre is required" });
    return;
  }
  const recommendation = await tuneWeightsForSubgenre(subgenre, min_score ?? 0.75);
  res.json(recommendation);
});

// GET /api/agent/dataset
// Query: ?subgenre=private_school&min_score=0.8
router.get("/dataset", async (req: Request, res: Response): Promise<void> => {
  const { subgenre, min_score } = req.query;
  const dataset = await buildDataset(
    subgenre as string | undefined,
    min_score ? parseFloat(min_score as string) : 0.80,
  );
  res.json(dataset);
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
