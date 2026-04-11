import { Router, Request, Response } from "express";
import { CTLv1Schema } from "@aura-x/ctl";
import { runRevisionLoop } from "../agent/revisionLoop";
import { tuneWeightsForSubgenre } from "../agent/weightTuner";
import { exportDataset, getDatasetStats } from "../agent/datasetPipeline";
import { runAgent } from "../agent/agentRunner";
import { triggerFinetune } from "../agent/finetuneRunner";
import { getTemporalClient } from "../temporal/client";
import { WorkflowNotFoundError } from "@temporalio/client";

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
// Query: ?subgenre=&source=&split=&min_score=&limit=
router.get("/dataset", async (req: Request, res: Response): Promise<void> => {
  const { subgenre, source, split, min_score, limit } = req.query;
  const dataset = await exportDataset({
    subgenre:  subgenre  as string | undefined,
    source:    source    as "human" | "generated" | undefined,
    split:     split     as "train" | "val" | "test" | undefined,
    min_score: min_score ? parseFloat(min_score as string) : undefined,
    limit:     limit     ? parseInt(limit as string)       : undefined,
  });
  res.json(dataset);
});

// GET /api/agent/dataset/stats
router.get("/dataset/stats", async (_req: Request, res: Response): Promise<void> => {
  const stats = await getDatasetStats();
  res.json(stats);
});

// POST /api/agent/run — FULL AUTONOMOUS AGENT
// Body: { title, subgenre, bpm?, key?, emotional_profile?, generation_mode?, created_by }
router.post("/run", async (req: Request, res: Response): Promise<void> => {
  const { title, subgenre, bpm, key, emotional_profile, generation_mode, created_by } = req.body;

  if (!title || !subgenre || !created_by) {
    res.status(400).json({ error: "title, subgenre, and created_by are required" });
    return;
  }

  const result = await runAgent({
    title, subgenre, bpm, key,
    emotional_profile, generation_mode, created_by,
  });

  const statusCode = result.status === "failed" ? 500 : 200;
  res.status(statusCode).json(result);
});

// POST /api/agent/ingest
// Body: { track_id, generation_id, audio_url, source? }
// Starts a DatasetIngestionWorkflow via Temporal
router.post("/ingest", async (req: Request, res: Response): Promise<void> => {
  const { track_id, generation_id, audio_url, source = "human" } = req.body;

  if (!track_id || !generation_id || !audio_url) {
    res.status(400).json({ error: "track_id, generation_id, and audio_url are required" });
    return;
  }

  if (!["human", "generated"].includes(source)) {
    res.status(400).json({ error: "source must be 'human' or 'generated'" });
    return;
  }

  try {
    const client = await getTemporalClient();
    const taskQueue  = process.env.TEMPORAL_TASK_QUEUE ?? "aura-x-dataset";
    const workflowId = `dataset-ingest-${track_id}-${generation_id}`;

    const handle = await client.workflow.start("DatasetIngestionWorkflow", {
      taskQueue,
      workflowId,
      args: [{ track_id, generation_id, audio_url, source }],
    });

    res.status(202).json({
      workflow_id: handle.workflowId,
      run_id:      handle.firstExecutionRunId,
      status:      "started",
      track_id,
      generation_id,
    });
  } catch (err) {
    res.status(500).json({ error: `Failed to start workflow: ${(err as Error).message}` });
  }
});

// GET /api/agent/workflow/:workflowId
// Returns status of a Temporal workflow
router.get("/workflow/:workflowId", async (req: Request, res: Response): Promise<void> => {
  const { workflowId } = req.params;

  try {
    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(workflowId);
    const desc   = await handle.describe();

    const status = desc.status.name === "RUNNING"   ? "running"
                 : desc.status.name === "COMPLETED"  ? "completed"
                 : "failed";

    if (status === "completed") {
      const result = await handle.result();
      res.json({ workflow_id: workflowId, run_id: desc.runId, status, result });
      return;
    }

    res.json({ workflow_id: workflowId, run_id: desc.runId, status });
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) {
      res.status(404).json({ workflow_id: workflowId, status: "not_found" });
      return;
    }
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/agent/finetune
// Body: { subgenre?, min_score?, training_steps?, learning_rate?, triggered_by }
router.post("/finetune", async (req: Request, res: Response): Promise<void> => {
  const { subgenre, min_score, training_steps, learning_rate, triggered_by } = req.body;

  if (!triggered_by) {
    res.status(400).json({ error: "triggered_by is required" });
    return;
  }

  const result = await triggerFinetune({
    subgenre,
    min_score:      min_score      ?? 0.65,
    training_steps: training_steps ?? 1000,
    learning_rate:  learning_rate  ?? 1e-4,
    triggered_by,
  });

  const statusCode = result.status === "rejected" ? 422 : 202;
  res.status(statusCode).json(result);
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
