import axios from "axios";
import { supabase } from "../../lib/supabase";
import { evaluateSignal } from "@aura-x/ac-ami";
import type { ObservedFeatures } from "@aura-x/ac-ami";
import { writeDatasetRecord as writeRecord } from "../../agent/datasetPipeline";

const AUDIO_SERVICE = process.env.AUDIO_SERVICE_URL ?? "http://localhost:8000";

// ─── Activity input/output types ──────────────────────────────────────────────

type AnalyzeAudioInput = { track_id: string; audio_url: string };
type SeparateStemsInput = { track_id: string; audio_url: string };
type ExtractLogDrumInput = { track_id: string };

type AlignToCtlInput = {
  track_id: string;
  generation_id: string;
  observed_features: ObservedFeatures;
  source: "human" | "generated";
};

export type AlignedRecord = {
  track_id: string;
  generation_id: string;
  ctl_json: Record<string, unknown>;
  observed_features: ObservedFeatures;
  signal_composite_score: number;
  passed_signal_gate: boolean;
  source: "human" | "generated";
};

// ─── Activity implementations ─────────────────────────────────────────────────

export type DatasetActivities = typeof datasetActivities;

export const datasetActivities = {

  // 1. Call Python audio service analyzer
  async analyzeAudio(input: AnalyzeAudioInput): Promise<ObservedFeatures> {
    const { data } = await axios.post<ObservedFeatures>(
      `${AUDIO_SERVICE}/analysis/analyze`,
      { track_id: input.track_id, audio_url: input.audio_url },
      { timeout: 60_000 },
    );
    return data;
  },

  // 2. Trigger htdemucs stem separation
  async separateStems(input: SeparateStemsInput): Promise<void> {
    await axios.post(
      `${AUDIO_SERVICE}/stems/separate`,
      { track_id: input.track_id, audio_url: input.audio_url },
      { timeout: 300_000 },
    );
  },

  // 3. Extract log drum (FFT bandpass 60-300 Hz)
  async extractLogDrum(input: ExtractLogDrumInput): Promise<void> {
    await axios.post(
      `${AUDIO_SERVICE}/log-drum/extract`,
      { track_id: input.track_id },
      { timeout: 60_000 },
    );
  },

  // 4. Fetch active CTL from Supabase, run signal evaluation
  async alignToCtl(input: AlignToCtlInput): Promise<AlignedRecord> {
    const { data: ctlRow, error } = await supabase
      .from("ctls")
      .select("ctl_json")
      .eq("track_id", input.track_id)
      .eq("is_active", true)
      .single();

    if (error || !ctlRow) {
      throw new Error(`CTL not found for track ${input.track_id}: ${error?.message}`);
    }

    const ctl = ctlRow.ctl_json as Parameters<typeof evaluateSignal>[0];
    const signalResult = evaluateSignal(ctl, input.observed_features);

    return {
      track_id:               input.track_id,
      generation_id:          input.generation_id,
      ctl_json:               ctlRow.ctl_json,
      observed_features:      input.observed_features,
      signal_composite_score: signalResult.signal_composite_score,
      passed_signal_gate:     signalResult.passed_signal_gate,
      source:                 input.source,
    };
  },

  // 5. Write (CTL, audio, score) training triple via datasetPipeline
  async writeDatasetRecord(record: AlignedRecord): Promise<string> {
    // Fetch musical metadata from CTL
    const ctlGlobal = (record.ctl_json as Record<string, unknown>)?.global as
      Record<string, unknown> | undefined;

    return writeRecord({
      track_id:              record.track_id,
      bpm:                   (ctlGlobal?.bpm as number) ?? 110,
      key:                   (ctlGlobal?.key as string) ?? "F#m",
      subgenre:              (ctlGlobal?.subgenre as string) ?? "private_school",
      mode:                  (ctlGlobal?.mode as string) ?? "minor",
      authenticity_score:    record.signal_composite_score,
      cultural_signal_score: record.signal_composite_score,
      composite_score:       record.signal_composite_score,
      source:                record.source,
      ctl_json:              record.ctl_json,
    });
  },
};
