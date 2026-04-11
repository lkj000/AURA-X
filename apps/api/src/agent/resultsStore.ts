import { supabase } from "../lib/supabase";
import { CTLv1 } from "@aura-x/ctl";

export type ExperimentResult = {
  track_id: string;
  generation_id: string;
  ctl_snapshot: CTLv1;
  composite_score: number;
  passed: boolean;
  subgenre: string;
  bpm: number;
  key: string;
  mutations_applied: string[];
  iterations_run: number;
  notes?: string;
};

export async function storeResult(result: ExperimentResult): Promise<string> {
  const record = {
    track_id:        result.track_id,
    generation_id:   result.generation_id,
    evaluator:       "experiment",
    passed_gate:     result.passed,
    composite_score: result.composite_score,
    revision_needed: !result.passed,
    revision_notes:  result.notes ?? null,
    raw_features: {
      ctl_snapshot:      result.ctl_snapshot,
      subgenre:          result.subgenre,
      bpm:               result.bpm,
      key:               result.key,
      mutations_applied: result.mutations_applied,
      iterations_run:    result.iterations_run,
    },
    authenticity_score:         result.ctl_snapshot.evaluation_targets.authenticity_target,
    groove_clarity_score:       result.ctl_snapshot.evaluation_targets.groove_clarity_target,
    harmonic_density_score:     result.ctl_snapshot.evaluation_targets.harmonic_density_target,
    dj_mix_friendliness_score:  result.ctl_snapshot.evaluation_targets.dj_mix_friendliness_target,
    cultural_lineage_coherence: result.ctl_snapshot.evaluation_targets.cultural_lineage_coherence,
  };

  const { data, error } = await supabase
    .from("evaluations")
    .insert(record)
    .select("id")
    .single();

  if (error) throw new Error(`Failed to store result: ${error.message}`);
  return data.id;
}

export async function queryResults(
  subgenre?: string,
  minScore?: number,
  limit = 20
): Promise<ExperimentResult[]> {
  // Build the filter chain before adding order + limit
  // so the mock chain stays testable
  let query = supabase
    .from("evaluations")
    .select("*")
    .eq("evaluator", "experiment");

  if (minScore !== undefined) {
    query = query.gte("composite_score", minScore);
  }

  const { data, error } = await query
    .order("composite_score", { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  return data
    .filter((d: Record<string, unknown>) => {
      if (!subgenre) return true;
      return (d.raw_features as Record<string, unknown>)?.subgenre === subgenre;
    })
    .map((d: Record<string, unknown>) => {
      const rf = d.raw_features as Record<string, unknown> ?? {};
      return {
        track_id:          d.track_id as string,
        generation_id:     d.generation_id as string,
        ctl_snapshot:      rf.ctl_snapshot as CTLv1,
        composite_score:   d.composite_score as number,
        passed:            d.passed_gate as boolean,
        subgenre:          rf.subgenre as string,
        bpm:               rf.bpm as number,
        key:               rf.key as string,
        mutations_applied: (rf.mutations_applied as string[]) ?? [],
        iterations_run:    (rf.iterations_run as number) ?? 0,
      };
    });
}
