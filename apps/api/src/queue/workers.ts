import { Worker } from "bullmq";
import { connection, AudioJobData, GenerationJobData } from "./index";

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
      console.log(`[audio.stems] file=${audio_file_id} track=${track_id}`);
      // Phase 04 Job 29: Demucs stem separation
      return { status: "acknowledged", audio_file_id, track_id };
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
// Handles: generation.mode2 (Replicate/MusicGen)
// Phase 03 Job 22 will wire in real Replicate calls

export const generationWorker = new Worker<GenerationJobData>(
  "generation",
  async (job) => {
    const { type } = job.data;

    if (type === "generation.mode2") {
      const { track_id, generation_id } = job.data;
      console.log(`[generation.mode2] generation=${generation_id} track=${track_id}`);
      // Phase 03 Job 22: real MusicGen via Replicate
      return { status: "acknowledged", track_id, generation_id };
    }

    throw new Error(`Unknown generation job type`);
  },
  { connection, concurrency: 2 }
);

generationWorker.on("completed", (job) => {
  console.log(`[generation-queue] Job ${job.id} completed`);
});

generationWorker.on("failed", (job, err) => {
  console.error(`[generation-queue] Job ${job?.id} failed: ${err.message}`);
});
