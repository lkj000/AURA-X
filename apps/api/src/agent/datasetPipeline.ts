import { supabase } from "../lib/supabase";
import { exportForSuno } from "@aura-x/suno-exporter";
import { CTLv1Schema } from "@aura-x/ctl";

export type DatasetExportOptions = {
  subgenre?: string;
  source?: "human" | "generated" | "augmented";
  split?: "train" | "val" | "test";
  min_score?: number;
  limit?: number;
  include_suno_prompts?: boolean;
};

export type DatasetRecord = {
  id: string;
  track_id: string;
  bpm: number;
  key: string;
  subgenre: string;
  composite_score: number;
  source: string;
  split: string;
  audio_url?: string;
  log_drum_url?: string;
  ctl_json?: unknown;
  suno_style_prompt?: string;
  suno_lyrics_prompt?: string;
};

export type DatasetExport = {
  version: string;
  exported_at: string;
  record_count: number;
  subgenre_distribution: Record<string, number>;
  source_distribution: Record<string, number>;
  split_distribution: Record<string, number>;
  mean_composite_score: number;
  records: DatasetRecord[];
};

// ─── EXPORT DATASET ───────────────────────────────────────────────────────────

export async function exportDataset(
  opts: DatasetExportOptions = {}
): Promise<DatasetExport> {
  const {
    subgenre,
    source,
    split,
    min_score = 0.65,
    limit = 500,
    include_suno_prompts = true,
  } = opts;

  // ─── 1. Query dataset_records ─────────────────────
  let query = supabase
    .from("dataset_records")
    .select("*")
    .gte("composite_score", min_score)
    .order("composite_score", { ascending: false })
    .limit(limit);

  if (subgenre) query = query.eq("subgenre", subgenre);
  if (source)   query = query.eq("source", source);
  if (split)    query = query.eq("split", split);

  const { data, error } = await query;
  if (error || !data) return _emptyExport();

  // ─── 2. Generate signed URLs + compile Suno prompts ──
  const records: DatasetRecord[] = [];

  for (const row of data) {
    let audioUrl: string | undefined;
    let logDrumUrl: string | undefined;

    if (row.audio_file_id) {
      const audioFile = await supabase
        .from("audio_files")
        .select("storage_path")
        .eq("id", row.audio_file_id)
        .single();

      if (audioFile.data?.storage_path) {
        const signed = await supabase.storage
          .from("aura-x-audio")
          .createSignedUrl(audioFile.data.storage_path, 3600);
        audioUrl = signed.data?.signedUrl ?? undefined;
      }
    }

    if (row.log_drum_file_id) {
      const logFile = await supabase
        .from("audio_files")
        .select("storage_path")
        .eq("id", row.log_drum_file_id)
        .single();

      if (logFile.data?.storage_path) {
        const signed = await supabase.storage
          .from("aura-x-audio")
          .createSignedUrl(logFile.data.storage_path, 3600);
        logDrumUrl = signed.data?.signedUrl ?? undefined;
      }
    }

    // ─── 3. Compile Suno prompts from CTL ─────────────
    let sunoStylePrompt: string | undefined;
    let sunoLyricsPrompt: string | undefined;

    if (include_suno_prompts && row.ctl_json) {
      try {
        const parsedCtl = CTLv1Schema.safeParse(row.ctl_json);
        if (parsedCtl.success) {
          const bundle = exportForSuno(parsedCtl.data);
          sunoStylePrompt  = bundle.style_prompt;
          sunoLyricsPrompt = bundle.lyrics_prompt;

          if (!row.suno_style_prompt) {
            await supabase
              .from("dataset_records")
              .update({ suno_style_prompt: bundle.style_prompt })
              .eq("id", row.id);
          }
        }
      } catch {
        // CTL parse failed — skip prompts
      }
    } else if (row.suno_style_prompt) {
      sunoStylePrompt = row.suno_style_prompt;
    }

    records.push({
      id:                 row.id,
      track_id:           row.track_id,
      bpm:                row.bpm,
      key:                row.key,
      subgenre:           row.subgenre,
      composite_score:    row.composite_score,
      source:             row.source,
      split:              row.split,
      audio_url:          audioUrl,
      log_drum_url:       logDrumUrl,
      ctl_json:           row.ctl_json,
      suno_style_prompt:  sunoStylePrompt,
      suno_lyrics_prompt: sunoLyricsPrompt,
    });
  }

  // ─── 4. Compute statistics ────────────────────────────
  const subgenreDist = _countBy(records, r => r.subgenre);
  const sourceDist   = _countBy(records, r => r.source);
  const splitDist    = _countBy(records, r => r.split);
  const meanScore    = records.length > 0
    ? records.reduce((s, r) => s + r.composite_score, 0) / records.length
    : 0;

  return {
    version:               "1.0",
    exported_at:           new Date().toISOString(),
    record_count:          records.length,
    subgenre_distribution: subgenreDist,
    source_distribution:   sourceDist,
    split_distribution:    splitDist,
    mean_composite_score:  parseFloat(meanScore.toFixed(3)),
    records,
  };
}

// ─── WRITE DATASET RECORD ─────────────────────────────────────────────────────
// Called by the Temporal DatasetIngestionWorkflow

export async function writeDatasetRecord(input: {
  track_id: string;
  audio_file_id?: string;
  log_drum_file_id?: string;
  bpm: number;
  key: string;
  subgenre: string;
  mode?: string;
  authenticity_score: number;
  groove_clarity_score?: number;
  cultural_signal_score?: number;
  composite_score: number;
  source: "human" | "generated" | "augmented";
  ctl_json?: Record<string, unknown>;
  suno_style_prompt?: string;
}): Promise<string> {
  // Auto-assign train/val/test split (80/10/10)
  const rand  = Math.random();
  const split = rand < 0.80 ? "train" : rand < 0.90 ? "val" : "test";

  const { data, error } = await supabase
    .from("dataset_records")
    .insert({
      track_id:              input.track_id,
      audio_file_id:         input.audio_file_id,
      log_drum_file_id:      input.log_drum_file_id,
      bpm:                   input.bpm,
      key:                   input.key,
      subgenre:              input.subgenre,
      mode:                  input.mode ?? "minor",
      authenticity_score:    input.authenticity_score,
      groove_clarity_score:  input.groove_clarity_score,
      cultural_signal_score: input.cultural_signal_score,
      composite_score:       input.composite_score,
      source:                input.source,
      split,
      ctl_json:              input.ctl_json,
      suno_style_prompt:     input.suno_style_prompt,
    })
    .select("id")
    .single();

  if (error) throw new Error(`writeDatasetRecord: ${error.message}`);
  return data.id as string;
}

// ─── DATASET STATS ────────────────────────────────────────────────────────────

export async function getDatasetStats(): Promise<{
  total: number;
  by_subgenre: Record<string, number>;
  by_source: Record<string, number>;
  by_split: Record<string, number>;
  mean_score: number;
  ready_for_training: boolean;
  training_threshold: number;
}> {
  const { data, error } = await supabase
    .from("dataset_records")
    .select("subgenre, source, split, composite_score");

  if (error || !data) {
    return {
      total: 0,
      by_subgenre: {}, by_source: {}, by_split: {},
      mean_score: 0, ready_for_training: false,
      training_threshold: 100,
    };
  }

  const trainRecords = data.filter(r => r.split === "train");
  const meanScore = data.length > 0
    ? data.reduce((s, r) => s + (r.composite_score ?? 0), 0) / data.length
    : 0;

  const TRAINING_THRESHOLD = 100;

  return {
    total:              data.length,
    by_subgenre:        _countBy(data, r => r.subgenre),
    by_source:          _countBy(data, r => r.source),
    by_split:           _countBy(data, r => r.split),
    mean_score:         parseFloat(meanScore.toFixed(3)),
    ready_for_training: trainRecords.length >= TRAINING_THRESHOLD,
    training_threshold: TRAINING_THRESHOLD,
  };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function _countBy<T>(
  arr: T[],
  fn: (item: T) => string
): Record<string, number> {
  return arr.reduce((acc, item) => {
    const key = fn(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function _emptyExport(): DatasetExport {
  return {
    version:               "1.0",
    exported_at:           new Date().toISOString(),
    record_count:          0,
    subgenre_distribution: {},
    source_distribution:   {},
    split_distribution:    {},
    mean_composite_score:  0,
    records:               [],
  };
}
