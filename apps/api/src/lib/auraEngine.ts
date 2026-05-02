/**
 * HTTP client for the Python aura-engine service.
 * Falls back gracefully when AURA_ENGINE_URL is not set.
 */

export type EngineCtlResult = {
  ctl: Record<string, unknown>;
  perception_report: Record<string, unknown>;
  cultural_report: Record<string, unknown>;
  quality_score: number;
  generation_source: string;
};

export type EngineSignalScore = {
  composite_score: number;
  lane_match: boolean;
  lane_score: number;
  perception_score: number;
  authenticity_score: number;
  bpm_score: number;
  key_score: number;
  perception_state: string;
  c1_pass: boolean;
  c2_pass: boolean;
  c3_pass: boolean;
  detected_lane: string;
  detected_bpm: number;
  detected_key: string;
  violations: string[];
  recommendations: string[];
};

const ENGINE_URL = process.env.AURA_ENGINE_URL?.replace(/\/$/, "");

export function isEngineAvailable(): boolean {
  return !!ENGINE_URL;
}

export async function ctlFromGoal(params: {
  title: string;
  subgenre: string;
  bpm?: number;
  key?: string;
  emotional_profile?: string;
  created_by: string;
  generation_mode?: string;
}): Promise<EngineCtlResult | null> {
  if (!ENGINE_URL) return null;
  try {
    const resp = await fetch(`${ENGINE_URL}/ctl/from-goal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title:             params.title,
        subgenre:          params.subgenre,
        bpm:               params.bpm ?? 0,
        key:               params.key ?? "",
        emotional_profile: params.emotional_profile ?? "",
        created_by:        params.created_by,
        generation_mode:   params.generation_mode ?? "mode_1_suno",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      console.warn(`[aura-engine] /ctl/from-goal → ${resp.status}`);
      return null;
    }
    return (await resp.json()) as EngineCtlResult;
  } catch (err) {
    console.warn(`[aura-engine] /ctl/from-goal error: ${(err as Error).message}`);
    return null;
  }
}

export async function scoreSignal(
  audioBuffer: Buffer,
  targetLane: string,
  targetBpm?: number,
  targetKey?: string,
): Promise<EngineSignalScore | null> {
  if (!ENGINE_URL) return null;
  try {
    const form = new FormData();
    form.append("audio", new Blob([audioBuffer], { type: "audio/wav" }), "audio.wav");
    form.append("target_lane", targetLane);
    if (targetBpm && targetBpm > 0) form.append("target_bpm", String(targetBpm));
    if (targetKey) form.append("target_key", targetKey);

    const resp = await fetch(`${ENGINE_URL}/signal/score`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) {
      console.warn(`[aura-engine] /signal/score → ${resp.status}`);
      return null;
    }
    return (await resp.json()) as EngineSignalScore;
  } catch (err) {
    console.warn(`[aura-engine] /signal/score error: ${(err as Error).message}`);
    return null;
  }
}

export async function perceive(audioBuffer: Buffer): Promise<Record<string, unknown> | null> {
  if (!ENGINE_URL) return null;
  try {
    const form = new FormData();
    form.append("audio", new Blob([audioBuffer], { type: "audio/wav" }), "audio.wav");
    const resp = await fetch(`${ENGINE_URL}/perceive`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
