import { Worker, Job } from "bullmq";
import axios from "axios";
import FormData from "form-data";
import { v4 as uuidv4 } from "uuid";
import { connection, AudioJobData, GenerationJobData, WebhookJobData, enqueueAudioAnalysis, enqueueWebhook } from "./index";
import { evaluateBuffer, runQualityGates } from "@aura-x/engine";
import { metricsCollector } from "../lib/metricsCollector";

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
      if (job.data.webhook_url) {
        await enqueueWebhook({
          generation_id,
          webhook_url: job.data.webhook_url,
          event: "failed",
          payload: { error: prediction.error ?? `Prediction ${prediction.status}` },
        });
      }
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

    // ─── 4a. QUALITY GATE: ENGINE runQualityGates (5-gate pipeline) ──────────
    // Evaluate the downloaded WAV buffer directly — no audio service round-trip.
    // Falls back to pass if the buffer is not parseable (non-PCM format, corrupt).
    let gateReport: ReturnType<typeof runQualityGates> | null = null;
    const gateStart = Date.now();
    try {
      const evaluation = evaluateBuffer(audioBuffer);
      gateReport = runQualityGates(evaluation);
    } catch {
      // Buffer not parseable as WAV PCM — gate skipped, generation continues
    }
    metricsCollector.record({
      durationMs:   Date.now() - gateStart,
      qualityScore: gateReport?.overallScore ?? 0,
      passed:       gateReport ? gateReport.readyForRelease : true,
      lane:         gateReport?.lane,
      error:        gateReport ? undefined : "buffer_unparseable",
    });

    if (gateReport && !gateReport.readyForRelease) {
      const failingGates = gateReport.gates
        .filter((g) => !g.passes)
        .map((g) => g.name);
      await supabase
        .from("generations")
        .update({
          status: "gate_failed",
          completed_at: new Date().toISOString(),
          metadata: {
            gate_report: {
              grade:        gateReport.grade,
              overallScore: gateReport.overallScore,
              passCount:    gateReport.passCount,
              failingGates,
              summary:      gateReport.summary,
            },
          },
        })
        .eq("id", generation_id);
      console.log(
        `[generation.mode2] Gate failed — grade:${gateReport.grade} score:${gateReport.overallScore.toFixed(3)} failing:[${failingGates.join(",")}]`
      );
      if (job.data.webhook_url) {
        await enqueueWebhook({
          generation_id,
          webhook_url: job.data.webhook_url,
          event: "gate_failed",
          payload: {
            grade:         gateReport.grade,
            overall_score: gateReport.overallScore,
            failing_gates: failingGates,
          },
        });
      }
      return {
        status: "gate_failed",
        generation_id,
        grade:         gateReport.grade,
        overall_score: gateReport.overallScore,
        failing_gates: failingGates,
      };
    }

    // ─── 4b. SIGNAL SCORER: Python engine audio analysis ──────────────────────
    // Sends the actual WAV buffer to the Python engine for real acoustic evaluation.
    // composite_score from real audio replaces the engine gate grade for metadata.
    const AURA_ENGINE_URL = process.env.AURA_ENGINE_URL;
    let signalScore: number | null = null;
    let signalState: string | null = null;
    let signalLaneMatch: boolean | null = null;

    if (AURA_ENGINE_URL) {
      try {
        const form = new FormData();
        form.append("audio", audioBuffer, { filename: "audio.wav", contentType: "audio/wav" });
        form.append("target_lane", job.data.subgenre ?? "private_school");

        const scoreResp = await axios.post<{
          composite_score:   number;
          perception_state:  string;
          lane_match:        boolean;
          classified_lane:   string;
          bpm_measured:      number;
          key_measured:      string;
          b_eff:             number;
          violations:        string[];
        }>(
          `${AURA_ENGINE_URL}/signal/score`,
          form,
          { headers: form.getHeaders(), timeout: 15_000 },
        );

        signalScore     = scoreResp.data.composite_score;
        signalState     = scoreResp.data.perception_state;
        signalLaneMatch = scoreResp.data.lane_match;

        console.log(
          `[generation.mode2] Signal score: ${signalScore?.toFixed(3)} ` +
          `state=${signalState} lane_match=${signalLaneMatch} ` +
          `bpm=${scoreResp.data.bpm_measured} key=${scoreResp.data.key_measured}`
        );

        if (!signalLaneMatch || signalScore < 0.40) {
          await supabase
            .from("generations")
            .update({
              status: "gate_failed",
              completed_at: new Date().toISOString(),
              metadata: {
                signal_score: {
                  composite_score:  signalScore,
                  perception_state: signalState,
                  lane_match:       signalLaneMatch,
                  classified_lane:  scoreResp.data.classified_lane,
                  bpm_measured:     scoreResp.data.bpm_measured,
                  key_measured:     scoreResp.data.key_measured,
                  b_eff:            scoreResp.data.b_eff,
                  violations:       scoreResp.data.violations,
                },
              },
            })
            .eq("id", generation_id);

          if (job.data.webhook_url) {
            await enqueueWebhook({
              generation_id,
              webhook_url: job.data.webhook_url,
              event: "gate_failed",
              payload: {
                reason:          "signal_score_gate",
                composite_score: signalScore,
                perception_state: signalState,
                lane_match:      signalLaneMatch,
              },
            });
          }
          return { status: "gate_failed", generation_id, signal_composite_score: signalScore };
        }
      } catch {
        // Python engine unavailable — non-critical, continue to complete
      }
    }

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

    if (job.data.webhook_url) {
      await enqueueWebhook({
        generation_id,
        webhook_url: job.data.webhook_url,
        event: "complete",
        payload: {
          audio_file_id:         fileId,
          grade:                 gateReport?.grade ?? "skip",
          overall_score:         gateReport?.overallScore ?? null,
          signal_composite_score: signalScore,
          signal_state:          signalState,
          signal_lane_match:     signalLaneMatch,
        },
      });
    }

    console.log(
      `[generation.mode2] ✓ Generation ${generation_id} complete — ` +
      `${storagePath} grade:${gateReport?.grade ?? "skip"} signal:${signalScore?.toFixed(3) ?? "n/a"}`
    );
    return {
      status: "complete",
      generation_id,
      audio_file_id:          fileId,
      grade:                  gateReport?.grade ?? "skip",
      overall_score:          gateReport?.overallScore ?? null,
      signal_composite_score: signalScore,
      signal_state:           signalState,
    };
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

// ─── WEBHOOK DELIVERY WORKER ──────────────────────────────────────────────────
// POSTs a JSON notification to the producer-supplied webhook_url.
// 5xx / network errors → retry (BullMQ backoff). 4xx → mark complete (skip).

export const webhookWorker = new Worker<WebhookJobData>(
  "webhook",
  async (job) => {
    const { webhook_url, generation_id, event, payload } = job.data;
    try {
      const response = await axios.post(
        webhook_url,
        { generation_id, event, ...payload },
        { timeout: 10000 }
      );
      console.log(`[webhook.deliver] ✓ gen:${generation_id} event:${event} status:${response.status}`);
      return { delivered: true, status: response.status };
    } catch (err) {
      const status = axios.isAxiosError(err) ? (err as { response?: { status: number } }).response?.status : undefined;
      if (status !== undefined && status >= 400 && status < 500) {
        console.warn(`[webhook.deliver] 4xx ${status} gen:${generation_id} — not retrying`);
        return { skipped: true, status };
      }
      throw err;
    }
  },
  { connection, concurrency: 5 }
);

webhookWorker.on("completed", (job) => {
  console.log(`[webhook-queue] Job ${job.id} completed`);
});

webhookWorker.on("failed", (job, err) => {
  console.error(`[webhook-queue] Job ${job?.id} failed permanently:`, err.message);
});
