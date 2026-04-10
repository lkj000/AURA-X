import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379", 10),
    password: parsed.password || undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null as null, // required by BullMQ
  };
}

export const connection = parseRedisUrl(redisUrl);

// ─── QUEUES ───────────────────────────────────────────────────────────────────
export const audioQueue    = new Queue("audio-processing", { connection });
export const generationQueue = new Queue("generation", { connection });

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

// ─── ENQUEUE HELPERS ──────────────────────────────────────────────────────────
export async function enqueueAudioAnalysis(data: Omit<AudioAnalyzeJob, "type">) {
  return audioQueue.add(
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
  return audioQueue.add(
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
  return generationQueue.add(
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
