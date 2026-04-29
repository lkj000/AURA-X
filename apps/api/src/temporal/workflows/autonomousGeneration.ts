import { proxyActivities } from "@temporalio/workflow";
import type { AgentActivities } from "../activities/agentActivities";
import type { AgentGenerationInput, AgentGenerationResult } from "./types";

// ─── Activity proxy (executes in worker, not workflow sandbox) ────────────────

const {
  createTrack,
  buildCtl,
  runAgentRevision,
  storeAgentResult,
  extractSunoBundle,
  updateTrackStatus,
  runSignalEval,
} = proxyActivities<AgentActivities>({
  startToCloseTimeout: "15 minutes",
  retry: { maximumAttempts: 3, initialInterval: "5s", backoffCoefficient: 2 },
});

// ─── AutonomousGenerationWorkflow ─────────────────────────────────────────────
// Orchestrates the 7-step agent pipeline with full Temporal durability:
//   createTrack → buildCtl → runAgentRevision → storeAgentResult
//   → extractSunoBundle → updateTrackStatus → runSignalEval

export async function AutonomousGenerationWorkflow(
  input: AgentGenerationInput,
): Promise<AgentGenerationResult> {

  // 1. Create track record in Supabase
  const { track_id } = await createTrack(input.goal);

  // 2. Select preset, apply planners, write CTL record
  const { ctl, ctl_id } = await buildCtl({ track_id, goal: input.goal });

  // 3. Run revision loop (evaluate → mutate → regenerate, max 3 iterations)
  const revision = await runAgentRevision({ track_id, ctl_id, ctl });

  const finalCtl    = revision.final_ctl;
  const lastIter    = revision.iterations[revision.iterations.length - 1];
  const compositeScore = lastIter?.composite_score ?? 0;

  // 4. Store agent result
  await storeAgentResult({
    track_id,
    generation_id:     revision.final_generation_id ?? ctl_id,
    ctl_snapshot:      finalCtl,
    composite_score:   compositeScore,
    passed:            revision.final_passed,
    subgenre:          input.goal.subgenre,
    bpm:               input.goal.bpm ?? (finalCtl.global.bpm as number),
    key:               input.goal.key ?? (finalCtl.global.key as string),
    mutations_applied: revision.iterations.flatMap(i => i.mutations_applied),
    iterations_run:    revision.iterations_run,
  });

  // 5. Extract Mode 1 Suno bundle (best-effort — null if not found)
  const sunoBundle = revision.final_generation_id
    ? await extractSunoBundle({ generation_id: revision.final_generation_id })
    : null;

  // 6. Update track status to 'produced' or 'draft'
  await updateTrackStatus({ track_id, passed: revision.final_passed });

  // 7. Signal evaluation — audio→CTL gap (best-effort — null if audio service unavailable)
  const signalResult = revision.final_generation_id
    ? await runSignalEval({
        track_id,
        generation_id: revision.final_generation_id,
        ctl:           finalCtl,
      })
    : null;

  return {
    status:                  revision.final_passed ? "complete" : "partial",
    track_id,
    generation_id:           revision.final_generation_id,
    ctl:                     finalCtl,
    validation_passed:       revision.final_passed,
    composite_score:         compositeScore,
    signal_composite_score:  signalResult?.signal_composite_score,
    passed_signal_gate:      signalResult?.passed_signal_gate,
    iterations_run:          revision.iterations_run,
    mutations_applied:       revision.total_mutations_applied,
    suno_bundle:             sunoBundle ?? undefined,
  };
}
