import { Worker, Job } from "bullmq";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { connection, AudioJobData, GenerationJobData, enqueueAudioAnalysis } from "./index";
import { supabase } from "../lib/supabase";
import { createReplicateClient } from "@aura-x/replicate-client";

// ─── AUDIO PROCESSING WORKER ──────────────────────────────────────────────────
// Handles: audio.analyze, audio.stems
// Phase 04 will wire in real analysis / Demucs stem separation

export const audioWorker = new Worker<AudioJobData>(
  "audio-processing",
  async (job) => {
    const { type } = job.data;

    if (type === "audio.analyze") {
      const { audio_file_id, track_id } = job.data;
      console.log(`[audio.analyze] file=${audio_file_id} track=${track_id}`);
      // Phase 04 Job 32: real waveform analysis via Python audio service
      return { status: "acknowledged", audio_file_id, track_id };
    }

    if (type === "audio.stems") {
      const { audio_file_id, track_id } = job.data;
      console.log(`[audio.stems] Requesting stem separation for ${audio_file_id}`);

      const AUDIO_SERVICE_URL = process.env.AUDIO_SERVICE_URL ?? "http://localhost:8000";

      const response = await axios.post(
        `${AUDIO_SERVICE_URL}/stems/separate`,
        {
          audio_file_id,
          track_id,
          generation_id: (job.data as { generation_id?: string }).generation_id,
        },
        { timeout: 300000 } // 5 min — Demucs can take time
      );

      console.log(`[audio.stems] ✓ Stems separated for ${audio_file_id}:`, response.data.stems);
      return response.data;
    }

    throw new Error(`Unknown audio job type: ${(job.data as { type: string }).type}`);
  },
  { connection, concurrency: 3 }
);

audioWorker.on("completed", (job) => {
  console.log(`[audio-queue] Job ${job.id} (${job.name}) completed`);
});

audioWorker.on("failed", (job, err) => {
  console.error(`[audio-queue] Job ${job?.id} failed: ${err.message}`);
});

// ─── GENERATION WORKER ────────────────────────────────────────────────────────
// Handles: generation.mode2.completion
// Polls Replicate → downloads audio → stores in Supabase → closes the loop

export const generationWorker = new Worker(
  "generation",
  async (job: Job) => {
    const { type, generation_id, track_id, prediction_id } = job.data;

    if (type !== "generation.mode2") {
      throw new Error(`Unknown generation job type: ${type}`);
    }

    // ─── 1. CHECK PREDICTION STATUS ─────────────────
    const client = createReplicateClient();
    const prediction = await client.getPrediction(prediction_id);

    if (prediction.status === "starting" || prediction.status === "processing") {
      // Not done yet — throw to trigger BullMQ retry
      throw new Error(`Prediction ${prediction_id} still ${prediction.status} — will retry`);
    }

    if (prediction.status === "failed" || prediction.status === "canceled") {
      await supabase
        .from("generations")
        .update({
          status: "failed",
          error_message: prediction.error ?? `Prediction ${prediction.status}`,
          completed_at: new Date().toISOString(),
        })
        .eq("id", generation_id);
      return { status: "failed", generation_id };
    }

    // ─── 2. DOWNLOAD AUDIO ──────────────────────────
    const audioUrl = prediction.output?.[0];
    if (!audioUrl) {
      throw new Error(`Prediction ${prediction_id} succeeded but has no output URL`);
    }

    const audioResponse = await axios.get(audioUrl, {
      responseType: "arraybuffer",
      timeout: 60000,
    });
    const audioBuffer = Buffer.from(audioResponse.data);

    // ─── 3. UPLOAD TO SUPABASE STORAGE ──────────────
    const fileId = uuidv4();
    const storagePath = `${track_id}/raw_generation/${fileId}.wav`;

    await supabase.storage
      .from("aura-x-audio")
      .upload(storagePath, audioBuffer, {
        contentType: "audio/wav",
        upsert: false,
      });

    // ─── 4. WRITE audio_files RECORD ────────────────
    await supabase
      .from("audio_files")
      .insert({
        id: fileId,
        track_id,
        generation_id,
        file_type: "raw_generation",
        storage_path: storagePath,
        format: "wav",
        file_size_bytes: audioBuffer.length,
        metadata: {
          source: "replicate_musicgen",
          prediction_id,
          audio_url: audioUrl,
        },
      });

    // ─── 5. UPDATE GENERATION RECORD ────────────────
    await supabase
      .from("generations")
      .update({
        status: "complete",
        completed_at: new Date().toISOString(),
      })
      .eq("id", generation_id);

    // ─── 6. ENQUEUE AUDIO ANALYSIS ──────────────────
    await enqueueAudioAnalysis({
      audio_file_id: fileId,
      track_id,
      storage_path: storagePath,
      format: "wav",
    });

    console.log(`[generation.mode2] ✓ Generation ${generation_id} complete — ${storagePath}`);
    return { status: "complete", generation_id, audio_file_id: fileId };
  },
  {
    connection,
    concurrency: 2,
  }
);

generationWorker.on("completed", (job) => {
  console.log(`[generation-queue] Job ${job.id} completed`);
});

generationWorker.on("failed", (job, err) => {
  // "will retry" errors are expected polling retries — don't alarm
  if (err.message.includes("will retry")) return;
  console.error(`[generation-queue] Job ${job?.id} failed permanently:`, err.message);
});
