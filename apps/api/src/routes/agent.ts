import { Router, Request, Response } from "express";
import { verifyToken } from "../middleware/auth";
import { generationLimiter } from "../middleware/rateLimit";
import { CTLv1Schema } from "@aura-x/ctl";
import { runRevisionLoop } from "../agent/revisionLoop";
import { tuneWeightsForSubgenre } from "../agent/weightTuner";
import { exportDataset, getDatasetStats } from "../agent/datasetPipeline";
import { triggerFinetune } from "../agent/finetuneRunner";
import { runAblationStudy } from "../agent/ablationRunner";
import { agentActivities } from "../temporal/activities/agentActivities";
import type { AgentGenerationResult } from "../temporal/workflows/types";

// ─── In-process workflow store (replaces Temporal for single-replica deploys) ─
type WorkflowState =
  | { status: "running" }
  | { status: "completed"; result: AgentGenerationResult }
  | { status: "failed"; error: string };

/**
 * IN-PROCESS WORKFLOW STATE, AND WHAT THAT COSTS.
 *
 * A Map lives in one process's memory. It does not survive a restart and is not shared between
 * instances, so behind more than one replica a caller polls whichever instance the load balancer
 * picks and is told `not_found` by the ones that did not start the work.
 *
 * That is not fixed here — durable execution is a real piece of work, not a comment. What is fixed is
 * the SILENCE: `not_found` was returned for three different situations — never existed, lost to a
 * restart, or running on another instance — and the caller could not tell which. The polling response
 * now says so, so "my job disappeared" is a diagnosable statement rather than a mystery.
 */
const workflows = new Map<string, WorkflowState>();

/** Stamped at boot. A workflow id issued before this instance started cannot be in its Map. */
const PROCESS_STARTED_AT = new Date().toISOString();

const router = Router();

// POST /api/agent/revise
// Body: { track_id, ctl_id, ctl, max_iterations? }
// Runs revision loop: evaluate → mutate → regenerate (max 3 iterations)
router.post("/revise", verifyToken, async (req: Request, res: Response): Promise<void> => {
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
router.post("/tune", verifyToken, async (req: Request, res: Response): Promise<void> => {
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

// POST /api/agent/run — FULL AUTONOMOUS AGENT (in-process, no Temporal dependency)
// Body: { title, subgenre, bpm?, key?, emotional_profile?, generation_mode?, created_by }
// Returns 202 immediately with workflowId — poll GET /api/agent/workflow/:workflowId for result
//
// AUTHENTICATED, RATE-LIMITED, AND THE IDENTITY COMES FROM THE SESSION.
//
// This router was mounted with no authentication at all, while `/api/generate` beside it carried the
// generation limiter. `created_by` was read from the REQUEST BODY — so an anonymous caller started
// real workflow runs and attributed them to whoever they typed. Same for `triggered_by` on /finetune,
// which starts model training.
//
// `created_by` is still accepted in the body and ignored: silently overriding it is better than a 400,
// because the existing web client sends it and breaking that would be a second defect.
router.post("/run", verifyToken, generationLimiter, (req: Request, res: Response): void => {
  const { title, subgenre, bpm, key, emotional_profile, generation_mode } = req.body;
  const created_by = req.artist!.artist_id;

  if (!title || !subgenre) {
    res.status(400).json({ error: "title and subgenre are required" });
    return;
  }

  const workflowId = `agent-run-${(created_by as string).replace(/[^a-z0-9]/gi, "-")}-${Date.now()}`;
  workflows.set(workflowId, { status: "running" });

  // Fire-and-forget: run the 7-step pipeline asynchronously
  (async () => {
    try {
      const goal = { title, subgenre, bpm, key, emotional_profile, generation_mode, created_by };

      const { track_id }    = await agentActivities.createTrack(goal);
      const { ctl, ctl_id } = await agentActivities.buildCtl({ track_id, goal });
      const revision        = await agentActivities.runAgentRevision({ track_id, ctl_id, ctl });

      const finalCtl       = revision.final_ctl;
      const lastIter       = revision.iterations[revision.iterations.length - 1];
      const compositeScore = lastIter?.composite_score ?? 0;

      await agentActivities.storeAgentResult({
        track_id,
        generation_id:     revision.final_generation_id ?? ctl_id,
        ctl_snapshot:      finalCtl,
        composite_score:   compositeScore,
        passed:            revision.final_passed,
        subgenre,
        bpm:               bpm ?? (finalCtl.global.bpm as number),
        key:               key ?? (finalCtl.global.key as string),
        mutations_applied: revision.iterations.flatMap(i => i.mutations_applied),
        iterations_run:    revision.iterations_run,
      });

      const sunoBundle = revision.final_generation_id
        ? await agentActivities.extractSunoBundle({ generation_id: revision.final_generation_id })
        : null;

      await agentActivities.updateTrackStatus({ track_id, passed: revision.final_passed });

      const signalResult = revision.final_generation_id
        ? await agentActivities.runSignalEval({
            track_id,
            generation_id: revision.final_generation_id,
            ctl: finalCtl,
          })
        : null;

      workflows.set(workflowId, {
        status: "completed",
        result: {
          status:                 revision.final_passed ? "complete" : "partial",
          track_id,
          generation_id:          revision.final_generation_id,
          ctl:                    finalCtl,
          validation_passed:      revision.final_passed,
          composite_score:        compositeScore,
          signal_composite_score: signalResult?.signal_composite_score,
          passed_signal_gate:     signalResult?.passed_signal_gate,
          iterations_run:         revision.iterations_run,
          mutations_applied:      revision.total_mutations_applied,
          suno_bundle:            sunoBundle ?? undefined,
        },
      });
    } catch (err) {
      workflows.set(workflowId, { status: "failed", error: (err as Error).message });
    }
  })();

  res.status(202).json({ workflow_id: workflowId, status: "started" });
});

// POST /api/agent/ingest
// Body: { track_id, generation_id, audio_url, source? }
router.post("/ingest", verifyToken, async (req: Request, res: Response): Promise<void> => {
  const { track_id, generation_id, audio_url, source = "human" } = req.body;

  if (!track_id || !generation_id || !audio_url) {
    res.status(400).json({ error: "track_id, generation_id, and audio_url are required" });
    return;
  }

  if (!["human", "generated"].includes(source)) {
    res.status(400).json({ error: "source must be 'human' or 'generated'" });
    return;
  }

  // IT SAID "started" AND STARTED NOTHING.
  //
  // The full DatasetIngestionWorkflow needs a Temporal worker that is not wired up. This returned 202
  // with `status: "started"` and a workflow_id that was never registered in `workflows` — so polling
  // that id answered `not_found`, and the caller was left to conclude their job had vanished rather
  // than that it had never begun.
  //
  // 501 rather than 202: the operation is not implemented, and a 2xx is a promise. The identifier is
  // still returned because callers store it, but it is named for what it is.
  res.status(501).json({
    error:         "Dataset ingestion is not implemented — no workflow was started.",
    reason:        "INGEST_NOT_IMPLEMENTED",
    status:        "not_started",
    detail:        "The DatasetIngestionWorkflow requires a Temporal worker that is not currently running.",
    would_be_workflow_id: `dataset-ingest-${track_id}-${generation_id}`,
    track_id,
    generation_id,
  });
});

// GET /api/agent/workflow/:workflowId
// Returns status of an in-process workflow by ID
router.get("/workflow/:workflowId", (req: Request, res: Response): void => {
  const { workflowId } = req.params;
  const state = workflows.get(workflowId);

  if (!state) {
    // "not_found" covered three different situations — never existed, lost to a restart, or started
    // on another instance — and the caller could not tell which. The state is still in memory; what
    // changes is that its absence no longer reads as "your job is gone".
    res.json({
      workflow_id: workflowId,
      status: "not_found",
      detail:
        "This instance has no record of that workflow. State is held in memory: it does not survive " +
        "a restart and is not shared between instances, so a workflow started elsewhere or before " +
        "this process began will not be found here.",
      process_started_at: PROCESS_STARTED_AT,
    });
    return;
  }

  if (state.status === "running") {
    res.json({ workflow_id: workflowId, status: "running" });
    return;
  }

  if (state.status === "failed") {
    res.json({ workflow_id: workflowId, status: "failed", error: state.error });
    return;
  }

  res.json({ workflow_id: workflowId, status: "completed", result: state.result });
});

// POST /api/agent/finetune
// Body: { subgenre?, min_score?, training_steps?, learning_rate?, triggered_by }
// Training spends real compute. Same reasoning as /run: authenticated, limited, and the actor is the
// session rather than a field the caller fills in.
router.post("/finetune", verifyToken, generationLimiter, async (req: Request, res: Response): Promise<void> => {
  const { subgenre, min_score, training_steps, learning_rate } = req.body;
  const triggered_by = req.artist!.artist_id;

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

// POST /api/agent/ablation
// Body: { subgenre, samples_per_condition? }
// Runs the AC-AMI ablation study — PhD evidence generator
router.post("/ablation", async (req: Request, res: Response): Promise<void> => {
  const { subgenre, samples_per_condition } = req.body;

  if (!subgenre) {
    res.status(400).json({ error: "subgenre is required" });
    return;
  }

  const VALID_SUBGENRES = [
    "private_school", "bacardi", "sgija",
    "stixx_sgija", "mbiraiano", "gqom_fusion",
    "hybrid_rnb_amapiano",
  ];
  if (!VALID_SUBGENRES.includes(subgenre)) {
    res.status(400).json({
      error: `Invalid subgenre. Valid: ${VALID_SUBGENRES.join(", ")}`,
    });
    return;
  }

  const n = Math.min(20, samples_per_condition ?? 5);
  const result = await runAblationStudy(subgenre, n);
  res.json(result);
});

// POST /api/agent/synthesize
// Body: { text, patch_class?, language? }
// Returns IPA transcription (audio available after VITS2 training)
router.post("/synthesize", async (req: Request, res: Response): Promise<void> => {
  const {
    text,
    patch_class = "male_percussive_chant",
    language    = "zulu",
  } = req.body;

  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  // Rule-based IPA transcription — no GPU needed
  // Longest match first to avoid partial substitutions
  const PHONEME_MAP: Record<string, string> = {
    "ph": "pʰ", "th": "tʰ", "kh": "kʰ",
    "mb": "mb", "nd": "nd", "ng": "ŋɡ", "nj": "nɟ",
    "c":  "ǀ",  "q":  "ǃ",  "x":  "ǁ",
    "a":  "a",  "e":  "ɛ",  "i":  "i",  "o":  "ɔ",  "u":  "u",
  };

  let ipa = text.toLowerCase();
  for (const [graph, ipaChar] of
       Object.entries(PHONEME_MAP).sort((a, b) => b[0].length - a[0].length)) {
    ipa = ipa.replace(new RegExp(graph, "g"), ipaChar);
  }

  res.json({
    status:            "ipa_transcription",
    original_text:     text,
    ipa_transcription: ipa,
    patch_class,
    language,
    model_status:      "awaiting_training",
    note: "Full audio synthesis available after VITS2 training. " +
          "Run: modal run apps/audio/modal_vits2.py::train_vits2",
  });
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
