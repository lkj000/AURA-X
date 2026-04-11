import { supabase } from "../lib/supabase";

export type FinetuneRequest = {
  subgenre?: string;
  min_score?: number;
  training_steps?: number;
  learning_rate?: number;
  model_name?: string;
  triggered_by: string;
};

export type FinetuneRun = {
  run_id: string;
  status: "queued" | "running" | "complete" | "failed";
  subgenre?: string;
  training_steps: number;
  triggered_by: string;
  modal_call_id?: string;
  final_loss?: number;
  steps_completed?: number;
  checkpoint_path?: string;
  created_at: string;
};

// ─── TRIGGER FINE-TUNE ────────────────────────────────────────────────────────

export async function triggerFinetune(
  req: FinetuneRequest
): Promise<{ run_id: string; status: string; message: string }> {
  const run_id = `finetune-${Date.now()}-${req.subgenre ?? "all"}`;

  // ─── Check dataset readiness ──────────────────────────────────────────────
  let countQuery = supabase
    .from("dataset_records")
    .select("id", { count: "exact", head: true })
    .eq("split", "train")
    .gte("composite_score", req.min_score ?? 0.65);

  const { count } = await countQuery;
  const trainCount = count ?? 0;

  if (trainCount < 10) {
    return {
      run_id,
      status: "rejected",
      message: `Insufficient training data: ${trainCount} records. Need >= 10.`,
    };
  }

  // ─── Store the fine-tune run record ──────────────────────────────────────
  await supabase.from("evaluations").insert({
    track_id:        "00000000-0000-0000-0000-000000000000",
    generation_id:   run_id,
    evaluator:       "finetune_runner",
    passed_gate:     false,
    composite_score: 0,
    revision_notes:  `Finetune run queued: ${run_id}`,
    raw_features: {
      run_id,
      subgenre:       req.subgenre,
      training_steps: req.training_steps ?? 1000,
      min_score:      req.min_score ?? 0.65,
      triggered_by:   req.triggered_by,
      status:         "queued",
    },
  });

  return {
    run_id,
    status: "queued",
    message: [
      `Fine-tune run ${run_id} queued.`,
      `Training data: ${trainCount} records.`,
      `To start: modal run apps/audio/modal_finetune.py`,
      `          --subgenre "${req.subgenre ?? "all"}"`,
      `          --run-id "${run_id}"`,
    ].join(" "),
  };
}
