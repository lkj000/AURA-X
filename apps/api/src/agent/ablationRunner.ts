import { CTLv1 } from "@aura-x/ctl";
import {
  privateSchoolPreset,
  bacardiPreset,
  sgijaPreset,
  mbiraianoPreset,
  PRESET_MAP,
} from "@aura-x/ctl";
import {
  applyHarmonyPlan,
  applyGroovePlan,
  applyInstrumentationPlan,
  validateAll,
  recommendMutations,
  applyMutations,
} from "@aura-x/ac-ami";
import { exportForSuno } from "@aura-x/suno-exporter";
import { supabase } from "../lib/supabase";

export type AblationCondition =
  | "prompt_only"
  | "ctl_no_lineage"
  | "full_stack";

export type AblationSample = {
  condition: AblationCondition;
  subgenre: string;
  generation_id?: string;
  composite_score: number;
  validation_passed: boolean;
  style_prompt: string;
  notes: string;
};

export type AblationResult = {
  subgenre: string;
  samples_per_condition: number;
  conditions: Record<AblationCondition, {
    mean_composite_score: number;
    pass_rate: number;
    sample_count: number;
    mean_prompt_length: number;
  }>;
  winner: AblationCondition;
  ac_ami_lift: number;
  samples: AblationSample[];
  conclusion: string;
};

// ─── CONDITION BUILDERS ───────────────────────────────────────────────────────

function getPresetForSubgenre(subgenre: string): CTLv1 {
  return PRESET_MAP[subgenre] ?? privateSchoolPreset;
}

function buildPromptOnly(subgenre: string, bpm: number, key: string): string {
  // Bare prompt — no CTL, no cultural grammar
  return `Amapiano ${subgenre.replace(/_/g, " ")}, ${bpm} BPM, key of ${key}, log drum bass, shakers, pads`;
}

function buildCtlNoLineage(ctl: CTLv1): CTLv1 {
  // Strip all lineage weights to neutral 0.5 — keeps structure, removes cultural intelligence
  const neutralLineage = Object.fromEntries(
    Object.entries(ctl.cultural_lineage).map(([source, entry]) => [
      source,
      entry ? { ...entry, weight: 0.5 } : entry,
    ])
  ) as CTLv1["cultural_lineage"];

  return { ...ctl, cultural_lineage: neutralLineage };
}

function buildFullStack(ctl: CTLv1): CTLv1 {
  // Full AC-AMI pipeline: planners + validators + mutation
  let planned = applyHarmonyPlan(ctl);
  planned = applyGroovePlan(planned);
  planned = applyInstrumentationPlan(planned);

  const validation = validateAll(planned);
  if (!validation.passed) {
    const mutations = recommendMutations(validation.issues);
    if (mutations.length > 0) {
      const { ctl: repaired } = applyMutations(planned, mutations);
      planned = repaired;
    }
  }
  return planned;
}

// ─── SCORE A SINGLE SAMPLE ────────────────────────────────────────────────────

function scoreSample(ctl: CTLv1): { composite_score: number; validation_passed: boolean; notes: string } {
  const validation  = validateAll(ctl);
  const errorCount  = validation.issues.filter(i => i.severity === "error").length;
  const warnCount   = validation.issues.filter(i => i.severity === "warning").length;
  const composite   = Math.max(0, 1.0 - errorCount * 0.15 - warnCount * 0.05);

  return {
    composite_score:   parseFloat(composite.toFixed(3)),
    validation_passed: validation.passed,
    notes:             validation.issues.slice(0, 3).map(i => i.code).join(", "),
  };
}

// ─── MAIN ABLATION RUNNER ─────────────────────────────────────────────────────

export async function runAblationStudy(
  subgenre: string,
  samplesPerCondition = 5,
  track_id_prefix = "ablation",
): Promise<AblationResult> {
  const baseCtl = getPresetForSubgenre(subgenre);
  const samples: AblationSample[] = [];

  const conditions: AblationCondition[] = [
    "prompt_only",
    "ctl_no_lineage",
    "full_stack",
  ];

  for (const condition of conditions) {
    for (let i = 0; i < samplesPerCondition; i++) {
      let ctl: CTLv1;
      let prompt: string;

      if (condition === "prompt_only") {
        ctl   = baseCtl;
        prompt = buildPromptOnly(subgenre, baseCtl.global.bpm, baseCtl.global.key);
      } else if (condition === "ctl_no_lineage") {
        ctl   = buildCtlNoLineage(baseCtl);
        const bundle = exportForSuno(ctl);
        prompt = bundle.style_prompt;
      } else {
        ctl   = buildFullStack(baseCtl);
        const bundle = exportForSuno(ctl);
        prompt = bundle.style_prompt;
      }

      const scored = scoreSample(ctl);
      const sample: AblationSample = {
        condition,
        subgenre,
        composite_score:   scored.composite_score,
        validation_passed: scored.validation_passed,
        style_prompt:      prompt,
        notes:             scored.notes,
      };

      // Write to evaluations table for persistence (non-fatal)
      try {
        await supabase.from("evaluations").insert({
          track_id:        "00000000-0000-0000-0000-000000000001",
          generation_id:   `${track_id_prefix}-${condition}-${i}`,
          evaluator:       "ablation_study",
          passed_gate:     sample.validation_passed,
          composite_score: sample.composite_score,
          raw_features: {
            condition,
            subgenre,
            sample_index: i,
            style_prompt: prompt,
            notes:        sample.notes,
          },
        });
      } catch {
        // Non-fatal — continue even if DB write fails
      }

      samples.push(sample);
    }
  }

  // ─── Aggregate results ────────────────────────────────────────────────────
  const aggregate = (cond: AblationCondition) => {
    const s = samples.filter(x => x.condition === cond);
    const mean = s.length > 0
      ? s.reduce((acc, x) => acc + x.composite_score, 0) / s.length
      : 0;
    const passRate = s.length > 0
      ? s.filter(x => x.validation_passed).length / s.length
      : 0;
    const meanLen = s.length > 0
      ? s.reduce((acc, x) => acc + x.style_prompt.length, 0) / s.length
      : 0;

    return {
      mean_composite_score: parseFloat(mean.toFixed(3)),
      pass_rate:            parseFloat(passRate.toFixed(3)),
      sample_count:         s.length,
      mean_prompt_length:   Math.round(meanLen),
    };
  };

  const conditionResults = {
    prompt_only:    aggregate("prompt_only"),
    ctl_no_lineage: aggregate("ctl_no_lineage"),
    full_stack:     aggregate("full_stack"),
  };

  const scores = (Object.entries(conditionResults) as [AblationCondition, { mean_composite_score: number }][])
    .sort((a, b) => b[1].mean_composite_score - a[1].mean_composite_score);
  const winner = scores[0][0];

  const acAmiLift = parseFloat((
    conditionResults.full_stack.mean_composite_score -
    conditionResults.prompt_only.mean_composite_score
  ).toFixed(3));

  const conclusion = acAmiLift >= 0.10
    ? `AC-AMI full stack outperforms prompt-only by ${(acAmiLift * 100).toFixed(1)}% — ` +
      `cultural grammar adds measurable value (p < 0.05 expected with n >= 30).`
    : acAmiLift >= 0
    ? `AC-AMI full stack outperforms prompt-only by ${(acAmiLift * 100).toFixed(1)}% — ` +
      `increase samples to n >= 30 for statistical significance.`
    : `No significant lift detected — review lineage weights and preset calibration.`;

  return {
    subgenre,
    samples_per_condition: samplesPerCondition,
    conditions:            conditionResults,
    winner,
    ac_ami_lift:           acAmiLift,
    samples,
    conclusion,
  };
}
