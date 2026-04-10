import { CTLv1 } from "@aura-x/ctl";
import { ValidationIssue } from "../validators/types";

export type MutationId =
  | "reduce_piano_busyness"
  | "increase_pad_warmth"
  | "reduce_harmonic_richness"
  | "strengthen_log_innovation"
  | "reduce_deep_house_weight"
  | "increase_kwaito_spacing"
  | "make_log_patch_rawer"
  | "simplify_pads"
  | "increase_bounce";

export type MutationResult = {
  mutationId: MutationId;
  applied: boolean;
  reason: string;
  ctl: CTLv1;
};

// ─── ISSUE CODE → MUTATION MAPPING ───────────────────
// Each validator issue code maps to one or more mutations

const ISSUE_TO_MUTATIONS: Record<string, MutationId[]> = {
  style_piano_too_busy:                     ["reduce_piano_busyness"],
  style_pad_too_cold:                       ["increase_pad_warmth"],
  harmony_too_many_chord_changes:           ["reduce_harmonic_richness"],
  harmony_extensions_too_rich_for_raw_lane: ["reduce_harmonic_richness"],
  lineage_log_drum_innovation_too_low:      ["strengthen_log_innovation"],
  lineage_deep_house_too_high:              ["reduce_deep_house_weight"],
  lineage_bacardi_too_high_for_luxury:      ["reduce_deep_house_weight"],
  lineage_kwaito_too_low:                   ["increase_kwaito_spacing"],
  inst_log_patch_mismatch:                  ["make_log_patch_rawer"],
  inst_log_drum_body_too_low:               ["strengthen_log_innovation"],
  style_groove_too_aggressive:              ["simplify_pads"],
};

// ─── RECOMMEND MUTATIONS FROM ISSUES ─────────────────

export function recommendMutations(issues: ValidationIssue[]): MutationId[] {
  const seen = new Set<MutationId>();
  for (const issue of issues) {
    const mutations = ISSUE_TO_MUTATIONS[issue.code] ?? [];
    for (const m of mutations) seen.add(m);
  }
  return Array.from(seen);
}

// ─── APPLY A SINGLE MUTATION ──────────────────────────

export function applyMutation(ctl: CTLv1, mutationId: MutationId): MutationResult {
  switch (mutationId) {

    case "reduce_piano_busyness": {
      // Scale all piano_activity curve values down by 25%
      const scaledCurve = ctl.curves.piano_activity.map(p => ({
        ...p, value: parseFloat((p.value * 0.75).toFixed(3))
      }));
      return {
        mutationId,
        applied: true,
        reason: "Scaled piano_activity curves down 25%",
        ctl: {
          ...ctl,
          curves: { ...ctl.curves, piano_activity: scaledCurve },
        },
      };
    }

    case "increase_pad_warmth": {
      const liftedCurve = ctl.curves.pad_warmth.map(p => ({
        ...p, value: parseFloat(Math.max(p.value, 0.62).toFixed(3))
      }));
      const updatedInst = ctl.instrumentation.map(i => {
        if (i.family === "pads" && i.patch_class === "dark_haze_pad") {
          return { ...i, patch_class: "luxury_noir_pad",
                   timbre_class: "warm_analog_bed", body_weight: 0.65 };
        }
        return i;
      });
      return {
        mutationId,
        applied: true,
        reason: "Lifted pad_warmth curve floor to 0.62, upgraded dark pad to luxury_noir_pad",
        ctl: {
          ...ctl,
          curves: { ...ctl.curves, pad_warmth: liftedCurve },
          instrumentation: updatedInst,
        },
      };
    }

    case "reduce_harmonic_richness": {
      const currentExt = ctl.harmony.extension_policy;
      const newExt = currentExt === "full_extensions"
        ? "sevenths_only"
        : currentExt === "sevenths_only"
          ? "none"
          : "none";
      const newChanges = Math.max(1, ctl.harmony.max_chord_changes_per_4_bars - 1);
      return {
        mutationId,
        applied: true,
        reason: `Reduced chord changes to ${newChanges}, downgraded extensions to "${newExt}"`,
        ctl: {
          ...ctl,
          harmony: {
            ...ctl.harmony,
            max_chord_changes_per_4_bars: newChanges,
            extension_policy: newExt,
          },
        },
      };
    }

    case "strengthen_log_innovation": {
      const current = ctl.cultural_lineage.log_drum_innovation?.weight ?? 0.5;
      const newWeight = parseFloat(Math.min(1.0, current + 0.12).toFixed(3));
      const updatedInst = ctl.instrumentation.map(i => {
        if (i.family === "log_drum") {
          return { ...i, body_weight: parseFloat(Math.min(1.0, i.body_weight + 0.08).toFixed(2)) };
        }
        return i;
      });
      return {
        mutationId,
        applied: true,
        reason: `log_drum_innovation weight ${current} → ${newWeight}, log drum body_weight +0.08`,
        ctl: {
          ...ctl,
          cultural_lineage: {
            ...ctl.cultural_lineage,
            log_drum_innovation: {
              ...ctl.cultural_lineage.log_drum_innovation,
              weight: newWeight,
            },
          },
          instrumentation: updatedInst,
        },
      };
    }

    case "reduce_deep_house_weight": {
      const current = ctl.cultural_lineage.deep_house?.weight ?? 0.5;
      const newWeight = parseFloat(Math.max(0.15, current - 0.15).toFixed(3));
      return {
        mutationId,
        applied: true,
        reason: `deep_house weight ${current} → ${newWeight} (reduced atmospheric dominance)`,
        ctl: {
          ...ctl,
          cultural_lineage: {
            ...ctl.cultural_lineage,
            deep_house: {
              ...ctl.cultural_lineage.deep_house,
              weight: newWeight,
            },
          },
        },
      };
    }

    case "increase_kwaito_spacing": {
      const current = ctl.cultural_lineage.kwaito?.weight ?? 0.2;
      const newWeight = parseFloat(Math.min(0.65, current + 0.15).toFixed(3));
      return {
        mutationId,
        applied: true,
        reason: `kwaito weight ${current} → ${newWeight} (more repetition tolerance, vocal spacing)`,
        ctl: {
          ...ctl,
          cultural_lineage: {
            ...ctl.cultural_lineage,
            kwaito: {
              ...ctl.cultural_lineage.kwaito,
              weight: newWeight,
            },
          },
        },
      };
    }

    case "make_log_patch_rawer": {
      const updatedInst = ctl.instrumentation.map(i => {
        if (i.family !== "log_drum") return i;
        const subgenre = ctl.global.subgenre;
        const rawPatch = subgenre === "stixx_sgija"
          ? "deep_stixx_log"
          : subgenre === "sgija"
            ? "sgija_bounce_log"
            : "bacardi_raw_log";
        return {
          ...i,
          patch_class: rawPatch,
          body_weight: parseFloat(Math.min(1.0, i.body_weight + 0.05).toFixed(2)),
        };
      });
      return {
        mutationId,
        applied: true,
        reason: `Swapped log drum patch to subgenre-appropriate raw variant`,
        ctl: { ...ctl, instrumentation: updatedInst },
      };
    }

    case "simplify_pads": {
      const updatedInst = ctl.instrumentation.map(i => {
        if (i.family === "pads") {
          return { ...i, body_weight: parseFloat(Math.max(0.3, i.body_weight - 0.15).toFixed(2)) };
        }
        return i;
      });
      const reducedCurve = ctl.curves.pad_warmth.map(p => ({
        ...p, value: parseFloat(Math.max(0.2, p.value - 0.1).toFixed(3))
      }));
      return {
        mutationId,
        applied: true,
        reason: "Reduced pad body_weight by 0.15, pulled pad_warmth curves down 0.1",
        ctl: {
          ...ctl,
          instrumentation: updatedInst,
          curves: { ...ctl.curves, pad_warmth: reducedCurve },
        },
      };
    }

    case "increase_bounce": {
      const boostedCurve = ctl.curves.groove_aggression.map(p => ({
        ...p, value: parseFloat(Math.min(1.0, p.value + 0.15).toFixed(3))
      }));
      const kwaitoWeight = ctl.cultural_lineage.kwaito?.weight ?? 0.3;
      const newKwaito = parseFloat(Math.min(0.70, kwaitoWeight + 0.08).toFixed(3));
      return {
        mutationId,
        applied: true,
        reason: `groove_aggression +0.15, kwaito weight ${kwaitoWeight} → ${newKwaito}`,
        ctl: {
          ...ctl,
          curves: { ...ctl.curves, groove_aggression: boostedCurve },
          cultural_lineage: {
            ...ctl.cultural_lineage,
            kwaito: { ...ctl.cultural_lineage.kwaito, weight: newKwaito },
          },
        },
      };
    }

    default:
      return {
        mutationId,
        applied: false,
        reason: `Unknown mutation: ${mutationId}`,
        ctl,
      };
  }
}

// ─── APPLY MULTIPLE MUTATIONS IN SEQUENCE ─────────────

export function applyMutations(
  ctl: CTLv1,
  mutations: MutationId[]
): { ctl: CTLv1; log: MutationResult[] } {
  let current = ctl;
  const log: MutationResult[] = [];
  for (const m of mutations) {
    const result = applyMutation(current, m);
    log.push(result);
    if (result.applied) current = result.ctl;
  }
  return { ctl: current, log };
}

// ─── REPAIR LOOP ──────────────────────────────────────
// Validate → recommend mutations → apply → re-validate
// Up to maxIterations to prevent infinite loops

import { validateAll } from "../validators";

export function repairCTL(
  ctl: CTLv1,
  maxIterations = 3
): { ctl: CTLv1; iterations: number; log: MutationResult[]; passed: boolean } {
  let current = ctl;
  const fullLog: MutationResult[] = [];

  for (let i = 0; i < maxIterations; i++) {
    const result = validateAll(current);
    if (result.passed) {
      return { ctl: current, iterations: i, log: fullLog, passed: true };
    }
    const mutations = recommendMutations(result.issues);
    if (mutations.length === 0) break;
    const { ctl: repaired, log } = applyMutations(current, mutations);
    fullLog.push(...log);
    current = repaired;
  }

  const finalResult = validateAll(current);
  return {
    ctl: current,
    iterations: maxIterations,
    log: fullLog,
    passed: finalResult.passed,
  };
}
