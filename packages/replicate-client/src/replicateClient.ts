import axios, { AxiosInstance } from "axios";
import { MUSICGEN_MODELS, MusicGenModelKey, MUSICGEN_DEFAULTS, SEEDANCE_MODEL } from "./models";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_MAX_POLLS = 60; // 3 min max wait

export type PredictionStatus =
  | "starting"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled";

export type MusicGenInput = {
  prompt: string;
  model_version?: MusicGenModelKey;
  duration?: number;
  temperature?: number;
  top_k?: number;
  top_p?: number;
  classifier_free_guidance?: number;
  output_format?: "wav" | "mp3";
  normalization_strategy?: "peak" | "loudness" | "clip";
  melody?: string; // URL to melody audio (optional conditioning)
};

export type Prediction = {
  id: string;
  status: PredictionStatus;
  input: Record<string, unknown>;
  output: string[] | null;   // Array of audio URLs when complete
  error: string | null;
  created_at: string;
  completed_at: string | null;
  urls: {
    get: string;
    cancel: string;
  };
};

export type GenerationResult = {
  predictionId: string;
  status: "succeeded" | "failed" | "canceled";
  audioUrl: string | null;
  error: string | null;
  durationMs: number;
};

export type SeedanceInput = {
  prompt: string;
  duration?: number;           // seconds, or -1 for auto (Seedance 2.0)
  resolution?: "480p" | "720p";
  aspect_ratio?: "16:9" | "9:16" | "1:1" | "adaptive";
  generate_audio?: boolean;    // Seedance 2.0 native audio
  image?: string;              // optional image URL for image-to-video
  reference_images?: string[];
  reference_videos?: string[];
  reference_audios?: string[];
};

export type VideoGenerationResult = {
  predictionId: string;
  status: "succeeded" | "failed" | "canceled";
  videoUrl: string | null;
  error: string | null;
  durationMs: number;
};

export class ReplicateClient {
  private http: AxiosInstance;
  private apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
    this.http = axios.create({
      baseURL: REPLICATE_API_BASE,
      headers: {
        Authorization: `Token ${apiToken}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  // ─── CREATE PREDICTION ──────────────────────────────
  async createPrediction(input: MusicGenInput): Promise<Prediction> {
    const modelKey = input.model_version ?? "stereo_melody";
    const modelVersion = MUSICGEN_MODELS[modelKey];

    const payload = {
      version: modelVersion,
      input: {
        prompt: input.prompt,
        duration: input.duration ?? MUSICGEN_DEFAULTS.duration,
        temperature: input.temperature ?? MUSICGEN_DEFAULTS.temperature,
        top_k: input.top_k ?? MUSICGEN_DEFAULTS.top_k,
        top_p: input.top_p ?? MUSICGEN_DEFAULTS.top_p,
        classifier_free_guidance:
          input.classifier_free_guidance ??
          MUSICGEN_DEFAULTS.classifier_free_guidance,
        output_format: input.output_format ?? MUSICGEN_DEFAULTS.output_format,
        normalization_strategy:
          input.normalization_strategy ??
          MUSICGEN_DEFAULTS.normalization_strategy,
        ...(input.melody ? { melody: input.melody } : {}),
      },
    };

    try {
      const response = await this.http.post<Prediction>("/predictions", payload);
      return response.data;
    } catch (err) {
      throw this.normalizeError(err, "createPrediction");
    }
  }

  // ─── GET PREDICTION STATUS ──────────────────────────
  async getPrediction(predictionId: string): Promise<Prediction> {
    try {
      const response = await this.http.get<Prediction>(
        `/predictions/${predictionId}`
      );
      return response.data;
    } catch (err) {
      throw this.normalizeError(err, "getPrediction");
    }
  }

  // ─── CANCEL PREDICTION ──────────────────────────────
  async cancelPrediction(predictionId: string): Promise<void> {
    try {
      await this.http.post(`/predictions/${predictionId}/cancel`);
    } catch (err) {
      throw this.normalizeError(err, "cancelPrediction");
    }
  }

  // ─── POLL UNTIL COMPLETE ────────────────────────────
  async waitForCompletion(
    predictionId: string,
    options: {
      pollIntervalMs?: number;
      maxPolls?: number;
      onProgress?: (prediction: Prediction) => void;
    } = {}
  ): Promise<Prediction> {
    const pollInterval = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const maxPolls = options.maxPolls ?? DEFAULT_MAX_POLLS;

    for (let poll = 0; poll < maxPolls; poll++) {
      const prediction = await this.getPrediction(predictionId);

      if (options.onProgress) options.onProgress(prediction);

      if (
        prediction.status === "succeeded" ||
        prediction.status === "failed" ||
        prediction.status === "canceled"
      ) {
        return prediction;
      }

      await sleep(pollInterval);
    }

    throw new ReplicateError(
      `Prediction ${predictionId} did not complete within ${maxPolls * pollInterval}ms`,
      "TIMEOUT",
      predictionId
    );
  }

  // ─── GENERATE (CREATE + WAIT) ───────────────────────
  async generate(input: MusicGenInput): Promise<GenerationResult> {
    const startTime = Date.now();
    const prediction = await this.createPrediction(input);

    const completed = await this.waitForCompletion(prediction.id);
    const durationMs = Date.now() - startTime;

    if (completed.status === "succeeded") {
      const audioUrl = completed.output?.[0] ?? null;
      return {
        predictionId: prediction.id,
        status: "succeeded",
        audioUrl,
        error: null,
        durationMs,
      };
    }

    return {
      predictionId: prediction.id,
      status: completed.status as "failed" | "canceled",
      audioUrl: null,
      error: completed.error,
      durationMs,
    };
  }

  // ─── SEEDANCE VIDEO GENERATION ─────────────────────
  // Calls the Replicate model API endpoint (not the versioned /predictions endpoint)
  // because Seedance is accessed as a deployment model, not a pinned version hash.
  async generateVideo(input: SeedanceInput): Promise<VideoGenerationResult> {
    const startTime = Date.now();

    const payload = {
      input: {
        prompt: input.prompt,
        duration: input.duration ?? 5,
        resolution: input.resolution ?? "720p",
        aspect_ratio: input.aspect_ratio ?? "16:9",
        generate_audio: input.generate_audio ?? true,
        reference_images: input.reference_images ?? [],
        reference_videos: input.reference_videos ?? [],
        reference_audios: input.reference_audios ?? [],
        ...(input.image ? { image: input.image } : {}),
      },
    };

    let prediction: Prediction;
    try {
      const response = await this.http.post<Prediction>(
        `/models/${SEEDANCE_MODEL}/predictions`,
        payload
      );
      prediction = response.data;
    } catch (err) {
      throw this.normalizeError(err, "generateVideo");
    }

    const completed = await this.waitForCompletion(prediction.id, {
      maxPolls: 120, // 6 min — video takes longer than audio
      pollIntervalMs: 3000,
    });

    const durationMs = Date.now() - startTime;

    if (completed.status === "succeeded") {
      const videoUrl = Array.isArray(completed.output)
        ? (completed.output[0] ?? null)
        : (completed.output as string | null);
      return { predictionId: prediction.id, status: "succeeded", videoUrl, error: null, durationMs };
    }

    return {
      predictionId: prediction.id,
      status: completed.status as "failed" | "canceled",
      videoUrl: null,
      error: completed.error,
      durationMs,
    };
  }

  // ─── ERROR NORMALIZER ───────────────────────────────
  private normalizeError(err: unknown, context: string): ReplicateError {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const message = err.response?.data?.detail ?? err.message;
      if (status === 401) {
        return new ReplicateError(
          "Invalid Replicate API token", "AUTH_ERROR", undefined, status
        );
      }
      if (status === 422) {
        return new ReplicateError(
          `Invalid input: ${message}`, "VALIDATION_ERROR", undefined, status
        );
      }
      if (status === 429) {
        return new ReplicateError(
          "Rate limit exceeded", "RATE_LIMIT", undefined, status
        );
      }
      return new ReplicateError(
        `${context} failed: ${message}`, "API_ERROR", undefined, status
      );
    }
    return new ReplicateError(
      `${context}: unexpected error`, "UNKNOWN_ERROR"
    );
  }
}

// ─── CUSTOM ERROR ──────────────────────────────────────

export class ReplicateError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly predictionId?: string,
    public readonly httpStatus?: number
  ) {
    super(message);
    this.name = "ReplicateError";
  }
}

// ─── FACTORY ──────────────────────────────────────────

export function createReplicateClient(): ReplicateClient {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error("REPLICATE_API_TOKEN environment variable is not set");
  }
  return new ReplicateClient(token);
}

// ─── UTIL ─────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
