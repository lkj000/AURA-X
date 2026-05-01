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

// POST /api/agent/run → 202 Accepted (Temporal workflow started)
export interface WorkflowStartResult {
  workflow_id: string;
  run_id: string;
  status: "started";
}

// GET /api/agent/workflow/:workflowId → poll result
export interface WorkflowPollResult {
  workflow_id: string;
  run_id?: string;
  status:
    | "running"
    | "completed"
    | "failed"
    | "incompatible"
    | "degraded"
    | "terminated"
    | "timed_out"
    | "cancelled"
    | "not_found";
  result?: {
    status: "complete" | "partial";
    track_id: string;
    generation_id?: string;
    ctl: Record<string, unknown>;
    validation_passed: boolean;
    composite_score: number;
    signal_composite_score?: number;
    passed_signal_gate?: boolean;
    iterations_run: number;
    mutations_applied: number;
    suno_bundle?: {
      style_prompt: string;
      lyrics_prompt: string;
      warnings?: string[];
    };
  };
  error?: string;
  contrast_score?: number;
  subgenre_match?: boolean;
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
  request<WorkflowStartResult>("/api/agent/run", {
    method: "POST",
    body: JSON.stringify(body),
  });

export async function pollWorkflowStatus(
  workflowId: string
): Promise<WorkflowPollResult> {
  const res = await fetch(`${BASE}/api/agent/workflow/${workflowId}`);
  return res.json() as Promise<WorkflowPollResult>;
}

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
  audio_files?: { id: string; file_type: string; duration_sec?: number }[];
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

// ── Track library ────────────────────────────────────────────────────────────

export interface TrackSummary {
  id: string;
  title: string;
  subgenre: string;
  bpm: number;
  key: string;
  created_by: string;
  created_at: string;
  composite_score: number | null;
  generation_id: string | null;
}

export interface TrackDetail extends TrackSummary {
  status: string;
  generation_mode: string;
  updated_at: string;
  ctl_snapshot: Record<string, unknown> | null;
  generation: {
    id: string;
    mode: string;
    status: string;
    prompt_style?: string;
    created_at: string;
  } | null;
  passed_gate: boolean | null;
  feedback_count: number;
  feedback_avg: number | null;
}

export interface TracksListResult {
  tracks: TrackSummary[];
  total: number;
  page: number;
  limit: number;
}

export const listTracks = (params?: {
  subgenre?: string;
  bpm_min?: number;
  bpm_max?: number;
  key?: string;
  page?: number;
  limit?: number;
}) => {
  const q = new URLSearchParams();
  if (params?.subgenre)           q.set("subgenre", params.subgenre);
  if (params?.bpm_min != null)    q.set("bpm_min", String(params.bpm_min));
  if (params?.bpm_max != null)    q.set("bpm_max", String(params.bpm_max));
  if (params?.key)                q.set("key", params.key);
  if (params?.page != null)       q.set("page", String(params.page));
  if (params?.limit != null)      q.set("limit", String(params.limit));
  const qs = q.toString();
  return request<TracksListResult>(`/api/tracks${qs ? `?${qs}` : ""}`);
};

export const getTrack = (trackId: string) =>
  request<TrackDetail>(`/api/tracks/${trackId}`);

// ── Feedback ─────────────────────────────────────────────────────────────────

export interface FeedbackInput {
  track_id: string;
  generation_id: string;
  rating: number;
  subgenre_notes?: string;
  cultural_accuracy?: number;
  ctl_snapshot?: Record<string, unknown>;
  composite_score?: number;
  subgenre?: string;
  bpm?: number;
  key?: string;
}

export interface FeedbackResult {
  feedback_id: string;
  promoted_to_gold: boolean;
}

export const submitFeedback = (body: FeedbackInput) =>
  request<FeedbackResult>("/api/feedback/rate", {
    method: "POST",
    body: JSON.stringify(body),
  });

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthResult {
  artist_id: string;
  name: string;
  email: string;
  token: string;
}

export const registerArtist = (body: { name: string; email: string; password: string; country?: string }) =>
  request<AuthResult>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const loginArtist = (body: { email: string; password: string }) =>
  request<AuthResult>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });

// ── Marketplace ──────────────────────────────────────────────────────────────

export interface MarketplaceTier {
  price_usd: number;
  rights: string;
}

export interface MarketplaceListing {
  id: string;
  title: string;
  subgenre: string;
  bpm: number;
  key: string;
  created_by: string;
  created_at: string;
  tiers: { STANDARD: MarketplaceTier; PREMIUM: MarketplaceTier; EXCLUSIVE: MarketplaceTier };
}

export interface MarketplaceListResult {
  listings: MarketplaceListing[];
  total: number;
  page: number;
  limit: number;
}

export interface LicensePurchaseResult {
  license_id: string;
  split_id: string;
  tier: string;
  price_usd: number;
  access_token: string;
  split_status: string;
}

export const listMarketplace = (params?: { page?: number; limit?: number }) => {
  const q = new URLSearchParams();
  if (params?.page  != null) q.set("page",  String(params.page));
  if (params?.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  return request<MarketplaceListResult>(`/api/marketplace${qs ? `?${qs}` : ""}`);
};

export const purchaseLicense = (trackId: string, tier: string, token: string) =>
  request<LicensePurchaseResult>(`/api/marketplace/${trackId}/license`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tier }),
  });

// ── Earnings ─────────────────────────────────────────────────────────────────

export interface EarningsSummary {
  artist_id: string;
  total_earned: number;
  split_count: number;
  track_count: number;
}

export interface EarningsHistoryRow {
  split_id: string;
  track_id: string;
  period: string;
  amount_usd: number;
  role: string;
  status: string;
  created_at: string;
}

export interface EarningsHistoryResult {
  artist_id: string;
  history: EarningsHistoryRow[];
  page: number;
  limit: number;
}

export interface WithdrawResult {
  status: string;
  amount_usd: number;
  period: string;
  nexus_tx_id: string | null;
  nexus_payout: Record<string, unknown>;
}

export const getEarningsSummary = (token: string) =>
  request<EarningsSummary>("/api/earnings", {
    headers: { Authorization: `Bearer ${token}` },
  });

export const getEarningsHistory = (token: string, params?: { page?: number; limit?: number }) => {
  const q = new URLSearchParams();
  if (params?.page  != null) q.set("page",  String(params.page));
  if (params?.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  return request<EarningsHistoryResult>(`/api/earnings/history${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
};

export const withdrawEarnings = (token: string, amount_usd: number) =>
  request<WithdrawResult>("/api/earnings/withdraw", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ amount_usd }),
  });

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
