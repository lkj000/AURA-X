import { CTLv1 } from "@aura-x/ctl";
import { exportForSuno } from "@aura-x/suno-exporter";
import { conditionForMode2 } from "@aura-x/ac-ami";
import { createReplicateClient } from "@aura-x/replicate-client";
import { supabase } from "../lib/supabase";
import { validateMode2Bpm } from "./mode2QualityGate";

export type GenerationRequest = {
  track_id: string;
  ctl_id: string;
  ctl: CTLv1;
  mode_override?: "mode_1_suno" | "mode_2_musicgen" | "mode_3_suno_api";
};

export type GenerationResponse = {
  generation_id: string;
  track_id: string;
  mode: string;
  status: "complete" | "queued" | "failed" | "incompatible" | "degraded";
  suno_bundle?: {
    style_prompt: string;
    lyrics_prompt: string;
    warnings: string[];
  };
  replicate_prediction_id?: string;
  contrast_score?: number;
  subgenre_match?: boolean;
  message?: string;
  error?: string;
};

export async function runGeneration(
  req: GenerationRequest
): Promise<GenerationResponse> {
  const mode = req.mode_override ?? req.ctl.global.generation_mode;

  // ─── CREATE GENERATION RECORD ─────────────────────
  const { data: genData, error: genError } = await supabase
    .from("generations")
    .insert({
      track_id: req.track_id,
      ctl_id: req.ctl_id,
      mode,
      status: "pending",
    })
    .select("id")
    .single();

  if (genError || !genData) {
    return {
      generation_id: "unknown",
      track_id: req.track_id,
      mode,
      status: "failed",
      error: `Failed to create generation record: ${genError?.message}`,
    };
  }

  const generation_id = genData.id;

  // ─── MODE 1: SUNO PROMPT EXPORT ───────────────────
  if (mode === "mode_1_suno") {
    try {
      const bundle = exportForSuno(req.ctl);

      await supabase
        .from("generations")
        .update({
          status: "complete",
          prompt_style: bundle.style_prompt,
          prompt_lyrics: bundle.lyrics_prompt,
          completed_at: new Date().toISOString(),
        })
        .eq("id", generation_id);

      return {
        generation_id,
        track_id: req.track_id,
        mode,
        status: "complete",
        suno_bundle: {
          style_prompt: bundle.style_prompt,
          lyrics_prompt: bundle.lyrics_prompt,
          warnings: bundle.warnings,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      await supabase
        .from("generations")
        .update({ status: "failed", error_message: msg })
        .eq("id", generation_id);
      return {
        generation_id,
        track_id: req.track_id,
        mode,
        status: "failed",
        error: msg,
      };
    }
  }

  // ─── MODE 2: MUSICGEN VIA REPLICATE ───────────────
  if (mode === "mode_2_musicgen") {
    // Gate 1: pre-generation BPM validation
    const bpmCheck = validateMode2Bpm(req.ctl.global.bpm);
    if (!bpmCheck.valid) {
      await supabase
        .from("generations")
        .update({
          status: "failed",
          error_message: `Incompatible BPM: ${req.ctl.global.bpm} has no Amapiano path (104–116 direct or via halftime/doubletime)`,
          completed_at: new Date().toISOString(),
        })
        .eq("id", generation_id);
      return {
        generation_id,
        track_id: req.track_id,
        mode,
        status: "incompatible",
        error: `BPM ${req.ctl.global.bpm} has no Amapiano path (104–116 direct or via halftime/doubletime)`,
      };
    }

    try {
      const conditioning = conditionForMode2(req.ctl);
      const client = createReplicateClient();
      const prediction = await client.createPrediction(conditioning.input);

      await supabase
        .from("generations")
        .update({ status: "processing", replicate_id: prediction.id })
        .eq("id", generation_id);

      await enqueueMode2Completion({
        generation_id,
        track_id: req.track_id,
        prediction_id: prediction.id,
      });

      return {
        generation_id,
        track_id: req.track_id,
        mode,
        status: "queued",
        replicate_prediction_id: prediction.id,
        message: `MusicGen generation started. Poll GET /api/generate/status/${generation_id}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      await supabase
        .from("generations")
        .update({ status: "failed", error_message: msg })
        .eq("id", generation_id);
      return {
        generation_id,
        track_id: req.track_id,
        mode,
        status: "failed",
        error: msg,
      };
    }
  }

  // ─── MODE 3: SUNO API (RESERVED) ──────────────────
  if (mode === "mode_3_suno_api") {
    await supabase
      .from("generations")
      .update({
        status: "failed",
        error_message: "Mode 3 is reserved pending official Suno API launch",
      })
      .eq("id", generation_id);

    return {
      generation_id,
      track_id: req.track_id,
      mode,
      status: "failed",
      message:
        "Mode 3 (Suno API) is reserved. Will activate when Suno launches official API. Use Mode 1 or Mode 2.",
    };
  }

  return {
    generation_id,
    track_id: req.track_id,
    mode,
    status: "failed",
    error: `Unknown generation mode: ${mode}`,
  };
}

// ─── MODE 2 COMPLETION QUEUE HELPER ───────────────────

async function enqueueMode2Completion(data: {
  generation_id: string;
  track_id: string;
  prediction_id: string;
}): Promise<void> {
  const { generationQueue } = await import("../queue");
  if (!generationQueue) return; // Redis unavailable in local dev
  await generationQueue.add(
    "generation.mode2.completion",
    {
      type: "generation.mode2",
      track_id: data.track_id,
      ctl_id: "pending",
      generation_id: data.generation_id,
      prediction_id: data.prediction_id,
    },
    {
      attempts: 10,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    }
  );
}
