const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3003";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body.error ?? body.message ?? JSON.stringify(body);
    } catch {}
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ── Agent ────────────────────────────────────────────────────────────────────

export interface AgentRunResult {
  status: "complete" | "partial" | "failed";
  track_id: string;
  generation_id?: string;
  validation_passed: boolean;
  composite_score: number;
  signal_composite_score?: number;
  passed_signal_gate?: boolean;
  iterations_run: number;
  mutations_applied: number;
  suno_bundle?: { style_prompt: string; lyrics_prompt: string };
  agent_log: string[];
}

export interface AgentRunInput {
  title: string;
  subgenre: string;
  bpm?: number;
  key?: string;
  emotional_profile?: string;
  generation_mode?: string;
  created_by: string;
}

export const agentRun = (body: AgentRunInput) =>
  request<AgentRunResult>("/api/agent/run", {
    method: "POST",
    body: JSON.stringify(body),
  });

// ── Dataset stats ────────────────────────────────────────────────────────────

export interface DatasetStats {
  total: number;
  by_subgenre: Record<string, number>;
  by_source: Record<string, number>;
  by_split: Record<string, number>;
  mean_score: number;
  ready_for_training: boolean;
  training_threshold: number;
}

export const getDatasetStats = () =>
  request<DatasetStats>("/api/agent/dataset/stats");

// ── Evaluations ──────────────────────────────────────────────────────────────

export interface Evaluation {
  id: string;
  track_id: string;
  generation_id: string;
  authenticity_score: number;
  subgenre_recognizability_score: number;
  groove_clarity_score: number;
  harmonic_density_score: number;
  dj_mix_friendliness_score: number;
  cultural_lineage_coherence: number;
  composite_score: number;
  passed_gate: boolean;
  revision_notes: string;
  created_at: string;
}

export const getEvaluations = (generationId: string) =>
  request<{ generation_id: string; evaluations: Evaluation[]; count: number }>(
    `/api/evaluate/${generationId}`
  );

// ── Generation status ────────────────────────────────────────────────────────

export interface GenerationStatus {
  generation_id: string;
  status: string;
  prompt_style?: string;
  prompt_lyrics?: string;
  replicate_id?: string;
  audio_files?: unknown[];
}

export const getGenerationStatus = (generationId: string) =>
  request<GenerationStatus>(`/api/generate/status/${generationId}`);

export const getTrackGenerations = (trackId: string) =>
  request<{ track_id: string; generations: GenerationStatus[]; count: number }>(
    `/api/generate/track/${trackId}`
  );

// ── Audio signed URL ─────────────────────────────────────────────────────────

export const getSignedUrl = (audioFileId: string) =>
  request<{ url: string; expires_at: string }>(
    `/api/audio/signed-url/${audioFileId}`
  );

// ── Agent status ─────────────────────────────────────────────────────────────

export interface AgentStatus {
  agent_level: number;
  capabilities: string[];
  revision_loop: { enabled: boolean; max_iterations: number };
}

export const getAgentStatus = () =>
  request<AgentStatus>("/api/agent/status");

// ── Video (Seedance 2.0) ─────────────────────────────────────────────────────

export interface VideoGenerationResult {
  video_id: string;
  track_id: string;
  generation_id: string;
  status: "complete" | "failed";
  video_url: string | null;
  visual_prompt: string;
  prediction_id: string | null;
  error?: string;
}

export interface VideoGenerationInput {
  track_id: string;
  generation_id: string;
  subgenre: string;
  bpm: number;
  key: string;
  emotional_profile: string;
  title: string;
  duration?: 5 | 10;
  resolution?: "480p" | "720p" | "1080p";
}

export const generateVideo = (body: VideoGenerationInput) =>
  request<VideoGenerationResult>("/api/video/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const getVideoPromptPreview = (params: {
  subgenre: string; bpm: number; key: string;
  emotional_profile: string; title: string;
}) => {
  const q = new URLSearchParams({
    subgenre: params.subgenre,
    bpm: String(params.bpm),
    key: params.key,
    emotional_profile: params.emotional_profile,
    title: params.title,
  });
  return request<{ visual_prompt: string }>(`/api/video/prompt-preview?${q}`);
};

// ── Finetune ─────────────────────────────────────────────────────────────────

export const triggerFinetune = (body: {
  subgenre?: string;
  min_score?: number;
  training_steps?: number;
  triggered_by: string;
}) =>
  request<{ run_id: string; status: string; message: string }>(
    "/api/agent/finetune",
    { method: "POST", body: JSON.stringify(body) }
  );
