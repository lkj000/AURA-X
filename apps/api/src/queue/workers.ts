import { Worker, Job } from "bullmq";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { connection, AudioJobData, GenerationJobData, enqueueAudioAnalysis } from "./index";

if (!connection) {
  console.log("[workers] Skipping worker startup — no Redis connection.");
  // Export empty module — routes still work, jobs just won't process
  module.exports = {};
  // @ts-ignore
  return;
}
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
      console.log(`[audio.analyze] Analyzing ${audio_file_id}`);

      const AUDIO_SERVICE_URL = process.env.AUDIO_SERVICE_URL ?? "http://localhost:8000";

      const response = await axios.post(
        `${AUDIO_SERVICE_URL}/analysis/analyze`,
        { audio_file_id, track_id },
        { timeout: 120000 }
      );

      const analysis = response.data as {
        bpm: number;
        key: string;
        mode: string;
        energy_mean: number;
        onset_density: number;
        bpm_confidence: number;
        key_confidence: number;
      };

      console.log(`[audio.analyze] ✓ BPM: ${analysis.bpm}, Key: ${analysis.key}`);

      // ─── Update dataset_records with real signal features ────────────────
      // Compute a signal-grounded composite score:
      //   bpm_score    = proximity to Amapiano centre (110 BPM), ±30 BPM window
      //   energy_score = RMS energy (already 0-1 normalised by analyser)
      //   onset_score  = groove density (≥4 onsets/sec = max score)
      const bpmScore    = Math.max(0, 1.0 - Math.abs(analysis.bpm - 110) / 30);
      const energyScore = Math.min(1.0, Math.max(0, analysis.energy_mean));
      const onsetScore  = Math.min(1.0, (analysis.onset_density ?? 0) / 4.0);
      const compositeScore = parseFloat(
        (0.50 * bpmScore + 0.30 * energyScore + 0.20 * onsetScore).toFixed(3)
      );

      const { data: dsRow } = await supabase
        .from("dataset_records")
        .select("id")
        .eq("track_id", track_id)
        .limit(1)
        .single();

      if (dsRow) {
        await supabase
          .from("dataset_records")
          .update({
            bpm:             analysis.bpm,
            key:             analysis.key,
            composite_score: compositeScore,
            metadata:        {
              bpm_confidence:  analysis.bpm_confidence,
              key_confidence:  analysis.key_confidence,
              energy_mean:     analysis.energy_mean,
              onset_density:   analysis.onset_density,
              analyzed_at:     new Date().toISOString(),
            },
          })
          .eq("track_id", track_id);

        console.log(`[audio.analyze] ✓ dataset_records updated — BPM:${analysis.bpm} Key:${analysis.key} score:${compositeScore}`);
      }

      return { ...analysis, composite_score: compositeScore };
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
