import { CTLv1 } from "@aura-x/ctl";
import {
  validateAll,
  recommendMutations,
  applyMutations,
} from "@aura-x/ac-ami";
import { runGeneration } from "../generation/generationAgent";
import { supabase } from "../lib/supabase";

export type RevisionRequest = {
  track_id: string;
  ctl_id: string;
  ctl: CTLv1;
  max_iterations?: number;
};

export type RevisionIteration = {
  iteration: number;
  validation_passed: boolean;
  issue_count: number;
  mutations_applied: string[];
  generation_id?: string;
  composite_score: number;
};

export type RevisionResult = {
  track_id: string;
  final_ctl: CTLv1;
  final_passed: boolean;
  iterations_run: number;
  iterations: RevisionIteration[];
  final_generation_id?: string;
  total_mutations_applied: number;
};

export async function runRevisionLoop(
  req: RevisionRequest
): Promise<RevisionResult> {
  const maxIterations = req.max_iterations ?? 3;
  const iterations: RevisionIteration[] = [];

  let currentCtl = req.ctl;
  let finalGenerationId: string | undefined;

  for (let i = 0; i < maxIterations; i++) {
    // ─── 1. Validate current CTL ────────────────────
    const validation = validateAll(currentCtl);

    const errorCount   = validation.issues.filter(x => x.severity === "error").length;
    const warningCount = validation.issues.filter(x => x.severity === "warning").length;
    const compositeScore = Math.max(
      0,
      1.0 - (errorCount * 0.15) - (warningCount * 0.05)
    );

    const iterResult: RevisionIteration = {
      iteration: i + 1,
      validation_passed: validation.passed,
      issue_count: validation.issues.length,
      mutations_applied: [],
      composite_score: parseFloat(compositeScore.toFixed(3)),
    };

    if (validation.passed) {
      // ─── 2a. Validation passed — generate ─────────
      const genResult = await runGeneration({
        track_id: req.track_id,
        ctl_id:   req.ctl_id,
        ctl:      currentCtl,
      });

      iterResult.generation_id = genResult.generation_id;
      finalGenerationId = genResult.generation_id;
      iterations.push(iterResult);
      break;
    }

    // ─── 2b. Validation failed — mutate ───────────
    const mutations = recommendMutations(validation.issues);

    if (mutations.length === 0) {
      // No known fixes — stop
      iterations.push(iterResult);
      break;
    }

    const { ctl: repairedCtl, log } = applyMutations(currentCtl, mutations);
    iterResult.mutations_applied = mutations;
    iterations.push(iterResult);

    // Write repair log to Supabase
    await supabase.from("evaluations").insert({
      track_id: req.track_id,
      generation_id: req.ctl_id,
      evaluator: "revision_loop",
      passed_gate: false,
      revision_needed: true,
      revision_notes: `Iteration ${i + 1}: Applied ${mutations.join(", ")}`,
      composite_score: compositeScore,
      raw_features: {
        mutations_applied: mutations,
        repair_log: log.map(l => l.reason),
      },
    });

    currentCtl = repairedCtl;
  }

  const finalValidation = validateAll(currentCtl);

  return {
    track_id: req.track_id,
    final_ctl: currentCtl,
    final_passed: finalValidation.passed,
    iterations_run: iterations.length,
    iterations,
    final_generation_id: finalGenerationId,
    total_mutations_applied: iterations.reduce(
      (sum, it) => sum + it.mutations_applied.length, 0
    ),
  };
}
