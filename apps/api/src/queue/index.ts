import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const isLocalhost = redisUrl.includes("localhost") || redisUrl.includes("127.0.0.1");

// ─── JOB TYPES ────────────────────────────────────────────────────────────────
export type AudioAnalyzeJob = {
  type: "audio.analyze";
  audio_file_id: string;
  track_id: string;
  storage_path: string;
  format: string;
};

export type AudioStemsJob = {
  type: "audio.stems";
  audio_file_id: string;
  track_id: string;
  storage_path: string;
};

export type GenerationMode2Job = {
  type: "generation.mode2";
  track_id: string;
  ctl_id: string;
  generation_id: string;
};

export type AudioJobData      = AudioAnalyzeJob | AudioStemsJob;
export type GenerationJobData = GenerationMode2Job;

// ─── CONNECTION + QUEUES ──────────────────────────────────────────────────────
// When REDIS_URL points to localhost and Redis isn't running, skip BullMQ
// entirely so it doesn't flood the console with reconnect errors.
// Set REDIS_URL to a real server (Railway) to enable queued jobs.

let _audioQueue: import("bullmq").Queue | null = null;
let _generationQueue: import("bullmq").Queue | null = null;
export let connection: IORedis | null = null;

if (!isLocalhost) {
  const { Queue } = require("bullmq") as typeof import("bullmq");

  connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  });

  connection.on("error", (err: Error) => {
    console.error("[queue] Redis error:", err.message);
  });

  _audioQueue    = new Queue("audio-processing", { connection });
  _generationQueue = new Queue("generation", { connection });

  console.log("[queue] BullMQ connected to Redis:", redisUrl.replace(/:\/\/.*@/, "://***@"));
} else {
  console.log("[queue] No Redis in local dev — queue jobs disabled. Set REDIS_URL to enable.");
}

export const audioQueue    = _audioQueue;
export const generationQueue = _generationQueue;

// ─── ENQUEUE HELPERS ──────────────────────────────────────────────────────────
export async function enqueueAudioAnalysis(data: Omit<AudioAnalyzeJob, "type">) {
  if (!_audioQueue) return null;
  return _audioQueue.add(
    "audio.analyze",
    { ...data, type: "audio.analyze" } as AudioAnalyzeJob,
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    }
  );
}

export async function enqueueAudioStems(data: Omit<AudioStemsJob, "type">) {
  if (!_audioQueue) return null;
  return _audioQueue.add(
    "audio.stems",
    { ...data, type: "audio.stems" } as AudioStemsJob,
    {
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 50,
      removeOnFail: 25,
    }
  );
}

export async function enqueueMode2Generation(data: Omit<GenerationMode2Job, "type">) {
  if (!_generationQueue) return null;
  return _generationQueue.add(
    "generation.mode2",
    { ...data, type: "generation.mode2" } as GenerationMode2Job,
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    }
  );
}
