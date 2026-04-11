import { queryResults } from "./resultsStore";

export type TuningRecommendation = {
  subgenre: string;
  lineage_adjustments: Record<string, number>;
  confidence: number;
  sample_size: number;
  notes: string;
};

export async function tuneWeightsForSubgenre(
  subgenre: string,
  minScore = 0.75
): Promise<TuningRecommendation> {
  const results = await queryResults(subgenre, minScore, 50);

  if (results.length < 3) {
    return {
      subgenre,
      lineage_adjustments: {},
      confidence: 0,
      sample_size: results.length,
      notes: `Insufficient data (${results.length} samples). Need >= 3 high-scoring runs.`,
    };
  }

  // Average lineage weights from high-scoring CTLs
  const lineageSums: Record<string, number>  = {};
  const lineageCounts: Record<string, number> = {};

  for (const result of results) {
    if (!result.ctl_snapshot?.cultural_lineage) continue;
    const lineage = result.ctl_snapshot.cultural_lineage;

    for (const [source, entry] of Object.entries(lineage)) {
      if (!entry || typeof (entry as { weight?: number }).weight !== "number") continue;
      const weight = (entry as { weight: number }).weight;
      lineageSums[source]   = (lineageSums[source]   ?? 0) + weight;
      lineageCounts[source] = (lineageCounts[source] ?? 0) + 1;
    }
  }

  const adjustments: Record<string, number> = {};
  for (const source of Object.keys(lineageSums)) {
    const avg = lineageSums[source] / lineageCounts[source];
    adjustments[source] = parseFloat((avg - 0.5).toFixed(3));
  }

  const confidence = Math.min(1, results.length / 20);

  return {
    subgenre,
    lineage_adjustments: adjustments,
    confidence: parseFloat(confidence.toFixed(2)),
    sample_size: results.length,
    notes: `Averaged lineage weights from ${results.length} runs with score >= ${minScore}`,
  };
}
