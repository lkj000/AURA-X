import { queryResults } from "./resultsStore";
import { exportForSuno } from "@aura-x/suno-exporter";

export type DatasetRecord = {
  id: string;
  subgenre: string;
  bpm: number;
  key: string;
  composite_score: number;
  ctl_json: unknown;
  suno_style_prompt: string;
  suno_lyrics_prompt: string;
  generation_id: string;
};

export async function buildDataset(
  subgenre?: string,
  minScore = 0.80,
  limit = 100,
): Promise<{ records: DatasetRecord[]; count: number; min_score: number }> {
  const results = await queryResults(subgenre, minScore, limit);

  const records: DatasetRecord[] = [];

  for (const result of results) {
    if (!result.ctl_snapshot) continue;

    try {
      const bundle = exportForSuno(result.ctl_snapshot);
      records.push({
        id:                 result.generation_id,
        subgenre:           result.subgenre,
        bpm:                result.bpm,
        key:                result.key,
        composite_score:    result.composite_score,
        ctl_json:           result.ctl_snapshot,
        suno_style_prompt:  bundle.style_prompt,
        suno_lyrics_prompt: bundle.lyrics_prompt,
        generation_id:      result.generation_id,
      });
    } catch {
      // CTL parse failed — skip this record
    }
  }

  return { records, count: records.length, min_score: minScore };
}
