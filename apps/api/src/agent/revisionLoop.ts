import axios from "axios";
import { CTLv1 } from "@aura-x/ctl";
import {
  validateAll,
  recommendMutations,
  applyMutations,
} from "@aura-x/ac-ami";
import { runGeneration } from "../generation/generationAgent";
import { supabase } from "../lib/supabase";

const INTEL = process.env.AUDIO_SERVICE_URL ?? "http://localhost:8000";

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
  perception_state?: string;
  ctl_alignment?: number;
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

// ── Perception gate via Python engine ────────────────────────────────────────
// Returns { ctl_state, converged, violations } or null if Python unavailable.

async function perceptionGate(ctl: CTLv1): Promise<{
  ctl_state: string; converged: boolean; violations: string[];
} | null> {
  try {
    const res = await axios.post<{ ctl_state: string; converged: boolean; violations: string[] }>(
      `${INTEL}/intelligence/evaluate`,
      { ctl },
      { timeout: 4_000 },
    );
    return res.data;
  } catch {
    return null;
  }
}

// ── Feedback to adaptive profile store ───────────────────────────────────────

async function recordFeedback(
  lane: string,
  bpm: number,
  composite_score: number,
  passed: boolean,
): Promise<void> {
  try {
    await axios.post(`${INTEL}/intelligence/feedback`, {
      lane, bpm, composite_score, passed,
    }, { timeout: 3_000 });
  } catch {
    // Non-critical — feedback is best-effort
  }
}

// ── Main revision loop ────────────────────────────────────────────────────────

export async function runRevisionLoop(
  req: RevisionRequest
): Promise<RevisionResult> {
  const maxIterations = req.max_iterations ?? 3;
  const iterations: RevisionIteration[] = [];

  let currentCtl = req.ctl;
  let finalGenerationId: string | undefined;

  for (let i = 0; i < maxIterations; i++) {
    // ─── 1a. Schema + rule validation (ac-ami) ────────
    const validation = validateAll(currentCtl);

    const errorCount   = validation.issues.filter(x => x.severity === "error").length;
    const warningCount = validation.issues.filter(x => x.severity === "warning").length;
    const schemaScore  = Math.max(0, 1.0 - (errorCount * 0.15) - (warningCount * 0.05));

    // ─── 1b. Perception gate (Python intelligence engine) ─
    const percept = await perceptionGate(currentCtl);
    const perceptionState   = percept?.ctl_state ?? "unknown";
    const perceptionPassed  = percept ? perceptionState === "harmonic" : true;

    // Composite score = schema score weighted with perception gate
    const compositeScore = parseFloat(
      (schemaScore * 0.60 + (perceptionPassed ? 1.0 : 0.5) * 0.40).toFixed(3)
    );

    const iterResult: RevisionIteration = {
      iteration: i + 1,
      validation_passed: validation.passed && perceptionPassed,
      issue_count: validation.issues.length + (percept?.violations.length ?? 0),
      mutations_applied: [],
      composite_score: compositeScore,
      perception_state: perceptionState,
    };

    if (validation.passed && perceptionPassed) {
      // ─── 2a. Both gates passed — generate ─────────
      const genResult = await runGeneration({
        track_id: req.track_id,
        ctl_id:   req.ctl_id,
        ctl:      currentCtl,
      });

      iterResult.generation_id = genResult.generation_id;
      finalGenerationId = genResult.generation_id;
      iterations.push(iterResult);

      // Feed result to adaptive profile store
      const lane = currentCtl.global.subgenre;
      const bpm  = currentCtl.global.bpm;
      await recordFeedback(lane, bpm, compositeScore, true);
      break;
    }

    // ─── 2b. Gate failed — repair ─────────────────
    const mutations = recommendMutations(validation.issues);
    const repairLog: string[] = [];

    if (mutations.length > 0) {
      const { ctl: repairedCtl, log } = applyMutations(currentCtl, mutations);
      iterResult.mutations_applied = mutations;
      repairLog.push(...log.map(l => l.reason));
      currentCtl = repairedCtl;
    }

    // If perception failed, ask Python engine to re-optimize
    if (!perceptionPassed && percept) {
      try {
        const optRes = await axios.post<{ ctl: CTLv1; mutations_applied: string[] }>(
          `${INTEL}/intelligence/optimize`,
          { ctl: currentCtl },
          { timeout: 5_000 },
        );
        currentCtl = optRes.data.ctl;
        iterResult.mutations_applied.push(...(optRes.data.mutations_applied ?? []));
        repairLog.push(`python_perception_reoptimize: ${optRes.data.mutations_applied?.join("; ")}`);
      } catch {
        // Python unavailable — continue with schema repairs only
      }
    }

    iterations.push(iterResult);

    await supabase.from("evaluations").insert({
      track_id:        req.track_id,
      generation_id:   req.ctl_id,
      evaluator:       "revision_loop_v2",
      passed_gate:     false,
      revision_needed: true,
      revision_notes:  `Iter ${i + 1}: schema=${validation.passed} perception=${perceptionState}`,
      composite_score: compositeScore,
      raw_features: {
        mutations_applied:  iterResult.mutations_applied,
        repair_log:         repairLog,
        perception_state:   perceptionState,
        perception_violations: percept?.violations ?? [],
      },
    });
  }

  const finalValidation = validateAll(currentCtl);
  const finalPercept    = await perceptionGate(currentCtl);
  const finalPassed     = finalValidation.passed && (finalPercept ? finalPercept.ctl_state === "harmonic" : finalValidation.passed);

  // Feed final result to adaptive profiles
  if (iterations.length > 0) {
    const last = iterations[iterations.length - 1];
    await recordFeedback(
      currentCtl.global.subgenre,
      currentCtl.global.bpm,
      last.composite_score,
      finalPassed,
    );
  }

  return {
    track_id:              req.track_id,
    final_ctl:             currentCtl,
    final_passed:          finalPassed,
    iterations_run:        iterations.length,
    iterations,
    final_generation_id:   finalGenerationId,
    total_mutations_applied: iterations.reduce(
      (sum, it) => sum + it.mutations_applied.length, 0
    ),
  };
}
