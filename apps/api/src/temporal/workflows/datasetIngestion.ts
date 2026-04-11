import { proxyActivities } from "@temporalio/workflow";
import type { DatasetActivities } from "../activities/datasetActivities";
import type { DatasetIngestionInput, DatasetIngestionResult } from "./types";

// ─── Activity proxy (executes in worker, not workflow sandbox) ────────────────

const {
  analyzeAudio,
  separateStems,
  extractLogDrum,
  alignToCtl,
  writeDatasetRecord,
} = proxyActivities<DatasetActivities>({
  startToCloseTimeout: "10 minutes",
  retry: { maximumAttempts: 3, initialInterval: "5s", backoffCoefficient: 2 },
});

// ─── DatasetIngestionWorkflow ─────────────────────────────────────────────────
// Orchestrates the 5-step pipeline:
//   analyzeAudio → separateStems → extractLogDrum → alignToCtl → writeDatasetRecord

export async function DatasetIngestionWorkflow(
  input: DatasetIngestionInput,
): Promise<DatasetIngestionResult> {
  const activitiesCompleted: string[] = [];

  // 1. Analyze audio — get observed signal features
  const observedFeatures = await analyzeAudio({
    track_id:   input.track_id,
    audio_url:  input.audio_url,
  });
  activitiesCompleted.push("analyzeAudio");

  // 2. Separate stems — htdemucs 4-stem split
  await separateStems({
    track_id:  input.track_id,
    audio_url: input.audio_url,
  });
  activitiesCompleted.push("separateStems");

  // 3. Extract log drum — FFT bandpass 60-300 Hz
  await extractLogDrum({ track_id: input.track_id });
  activitiesCompleted.push("extractLogDrum");

  // 4. Align to CTL — fetch CTL from Supabase, compute signal gaps
  const alignedRecord = await alignToCtl({
    track_id:          input.track_id,
    generation_id:     input.generation_id,
    observed_features: observedFeatures,
    source:            input.source,
  });
  activitiesCompleted.push("alignToCtl");

  // 5. Write dataset record — (CTL, audio, score) triple to Supabase
  const datasetRecordId = await writeDatasetRecord(alignedRecord);
  activitiesCompleted.push("writeDatasetRecord");

  return {
    dataset_record_id:      datasetRecordId,
    track_id:               input.track_id,
    signal_composite_score: alignedRecord.signal_composite_score,
    activities_completed:   activitiesCompleted,
  };
}
