import { createReplicateClient } from "@aura-x/replicate-client";
import { supabase } from "../lib/supabase";

// ─── SUBGENRE VISUAL VOCABULARY ──────────────────────────────────────────────
// Each subgenre carries a distinct cultural-visual signature.
// Prompts are written as cinematography briefs, not generic AI art descriptions.

const SUBGENRE_VISUALS: Record<string, string> = {
  private_school:
    "rooftop penthouse Sandton Johannesburg, city lights glittering below, luxury interior warm amber lighting, fashion editorial, slow cinematic pan, bokeh cityscape, South African upper middle class",
  bacardi:
    "underground Jozi nightclub, smoke haze, strobes cutting through darkness, crowd in motion, gritty energy, raw street fashion, low angle shots",
  sgija:
    "Soweto township streets at golden hour, youth culture, vibrant murals, informal settlement energy, raw authentic South African urban, handheld camera feel",
  stixx_sgija:
    "township block party, outdoor concrete yard, speakers stacked, crowd gathered, kinetic energy, South African street life, warm dust and light",
  mbiraiano:
    "Zimbabwe savanna at sunset, traditional mbira instruments, earth tones red and ochre, acacia silhouettes, cultural fusion, epic wide shots, ancestral",
  gqom_fusion:
    "industrial Durban warehouse rave, intense strobe lights, sweating crowd, dark concrete, bass-heavy atmosphere, South African underground dance culture",
  hybrid_rnb_amapiano:
    "sleek Lagos or Nairobi penthouse, afrobeats meets amapiano crossover, luxury minimalism, moody cinematic lighting, Pan-African affluence",
};

const DEFAULT_VISUAL =
  "aerial shot of African city at night, glowing lights, amapiano culture, cinematic wide lens, warm tones";

// ─── BPM → PACE MODIFIER ─────────────────────────────────────────────────────
function bpmToPace(bpm: number): string {
  if (bpm < 100) return "slow meditative drift, long takes";
  if (bpm < 110) return "smooth flowing motion, steady pace";
  if (bpm < 118) return "rhythmic moderate movement, natural energy";
  return "dynamic cuts, high energy movement, fast-paced";
}

// ─── VISUAL PROMPT BUILDER ───────────────────────────────────────────────────
export function buildVisualPrompt(params: {
  subgenre: string;
  bpm: number;
  key: string;
  emotional_profile: string;
  title: string;
}): string {
  const base = SUBGENRE_VISUALS[params.subgenre] ?? DEFAULT_VISUAL;
  const pace = bpmToPace(params.bpm);

  return [
    base,
    `${pace}`,
    `emotional mood: ${params.emotional_profile}`,
    "no text overlays, no watermarks, photorealistic",
    "cinematic 4K quality, professional color grade",
  ].join(". ");
}

// ─── VIDEO GENERATION ────────────────────────────────────────────────────────
export type VideoRequest = {
  track_id: string;
  generation_id: string;
  subgenre: string;
  bpm: number;
  key: string;
  emotional_profile: string;
  title: string;
  duration?: 5 | 10;
  resolution?: "480p" | "720p" | "1080p";
};

export type VideoResponse = {
  video_id: string;
  track_id: string;
  generation_id: string;
  status: "complete" | "failed";
  video_url: string | null;
  visual_prompt: string;
  prediction_id: string | null;
  error?: string;
};

export async function runVideoGeneration(req: VideoRequest): Promise<VideoResponse> {
  const visual_prompt = buildVisualPrompt({
    subgenre: req.subgenre,
    bpm: req.bpm,
    key: req.key,
    emotional_profile: req.emotional_profile,
    title: req.title,
  });

  // ─── 1. CREATE VIDEO RECORD IN SUPABASE ──────────
  const { data: videoData, error: videoError } = await supabase
    .from("videos")
    .insert({
      track_id: req.track_id,
      generation_id: req.generation_id,
      status: "pending",
      visual_prompt,
      model: "bytedance/seedance-2.0",  // native audio generation
    })
    .select("id")
    .single();

  if (videoError || !videoData) {
    return {
      video_id: "unknown",
      track_id: req.track_id,
      generation_id: req.generation_id,
      status: "failed",
      video_url: null,
      visual_prompt,
      prediction_id: null,
      error: `Failed to create video record: ${videoError?.message}`,
    };
  }

  const video_id = videoData.id;

  // ─── 2. RUN SEEDANCE ON REPLICATE ────────────────
  let result;
  try {
    const client = createReplicateClient();
    result = await client.generateVideo({
      prompt: visual_prompt,
      duration: req.duration ?? 5,
      resolution: req.resolution ?? "720p",
      aspect_ratio: "16:9",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Seedance call failed";
    await supabase
      .from("videos")
      .update({ status: "failed", error_message: msg })
      .eq("id", video_id);

    return {
      video_id,
      track_id: req.track_id,
      generation_id: req.generation_id,
      status: "failed",
      video_url: null,
      visual_prompt,
      prediction_id: null,
      error: msg,
    };
  }

  // ─── 3. UPDATE RECORD WITH RESULT ────────────────
  await supabase
    .from("videos")
    .update({
      status: result.status === "succeeded" ? "complete" : "failed",
      video_url: result.videoUrl,
      prediction_id: result.predictionId,
      completed_at: new Date().toISOString(),
      error_message: result.error ?? null,
    })
    .eq("id", video_id);

  return {
    video_id,
    track_id: req.track_id,
    generation_id: req.generation_id,
    status: result.status === "succeeded" ? "complete" : "failed",
    video_url: result.videoUrl,
    visual_prompt,
    prediction_id: result.predictionId,
    error: result.error ?? undefined,
  };
}
