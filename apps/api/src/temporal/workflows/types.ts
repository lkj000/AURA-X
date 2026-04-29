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

// ─── AutonomousGenerationWorkflow types ──────────────────────────────────────

import type { AgentGoalInput, SunoBundle } from "../activities/agentActivities";
import type { CTLv1 } from "@aura-x/ctl";

export type AgentGenerationInput = {
  goal: AgentGoalInput;
};

export type AgentGenerationResult = {
  status: "complete" | "partial";
  track_id: string;
  generation_id?: string;
  ctl: CTLv1;
  validation_passed: boolean;
  composite_score: number;
  signal_composite_score?: number;
  passed_signal_gate?: boolean;
  iterations_run: number;
  mutations_applied: number;
  suno_bundle?: SunoBundle;
};
