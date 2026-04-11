// ─── Shared workflow payload types ────────────────────────────────────────────

export type DatasetIngestionInput = {
  track_id: string;
  generation_id: string;
  audio_url: string;
  source: "human" | "generated";
};

export type DatasetIngestionResult = {
  dataset_record_id: string;
  track_id: string;
  signal_composite_score: number;
  activities_completed: string[];
};

export type WorkflowStatus = {
  workflow_id: string;
  run_id: string;
  status: "running" | "completed" | "failed" | "not_found";
  result?: DatasetIngestionResult;
};
