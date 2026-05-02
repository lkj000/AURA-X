import { CTLv1 } from "@aura-x/ctl";
import {
  SUBGENRE_DESCRIPTORS,
  MIX_PROFILE_DESCRIPTORS,
  VOCAL_PROFILE_DESCRIPTORS,
  EXTENSION_POLICY_DESCRIPTORS,
  VOICING_STYLE_DESCRIPTORS,
  HARMONIC_RHYTHM_DESCRIPTORS,
  PATCH_CLASS_DESCRIPTORS,
  LINEAGE_DESCRIPTORS,
} from "./maps";

const SUNO_STYLE_LIMIT = 1000;

export function compileStylePrompt(ctl: CTLv1): string {
  const { global, harmony, instrumentation, cultural_lineage, style_constraints, production_directives } = ctl;

  // ─── Required parts (always included — most Suno-critical) ───────────────────
  const required: string[] = [
    SUBGENRE_DESCRIPTORS[global.subgenre],
    `${global.bpm} BPM, ${global.key}`,
    MIX_PROFILE_DESCRIPTORS[global.mix_profile],
    `Emotional character: ${global.emotional_profile}`,
    VOCAL_PROFILE_DESCRIPTORS[global.vocal_profile],
  ];

  const forbidden = style_constraints.forbidden_traits
    .map((t) => t.replace(/_/g, " "))
    .join(", ");
  if (forbidden) required.push(`Avoid: ${forbidden}`);

  // ─── Optional parts (added greedily until limit reached) ─────────────────────
  const optional: string[] = [];

  // Harmony
  optional.push(
    `Harmony: ${EXTENSION_POLICY_DESCRIPTORS[harmony.extension_policy]}, ` +
    `${VOICING_STYLE_DESCRIPTORS[harmony.voicing_style]}, ` +
    `${HARMONIC_RHYTHM_DESCRIPTORS[harmony.harmonic_rhythm]}`
  );
  if (harmony.exemplar_progressions.length > 0) {
    optional.push(`Chord progression: ${harmony.exemplar_progressions[0]}`);
  }

  // Instrumentation — top 3, compact form to stay within char budget
  const INST_COMPACT: Record<string, string> = {
    private_school_soft_log: "woody pitched log drum",
    bacardi_raw_log:         "heavy raw log drum",
    sgija_bounce_log:        "bouncy woody log drum",
    deep_stixx_log:          "Stixx ghost-note log drum",
    gqom_fusion_log:         "dark sub log drum",
    warm_rhodes_luxury:      "warm Rhodes piano",
    dry_jazz_ep:             "dry jazz electric piano",
    soft_detuned_ep:         "soft detuned electric piano",
    soft_percussive_piano:   "sparse acoustic piano",
    raw_street_piano_loop:   "minimal piano loop",
    luxury_noir_pad:         "wide analog pad",
    dark_haze_pad:           "dark hazy pad",
    dry_constant_shaker:     "constant 16th shaker",
    granular_shaker:         "granular textured shaker",
    dark_offbeat_stab:       "dark offbeat stab",
    mbira_organic_pluck:     "organic mbira",
  };
  const instParts = instrumentation.slice(0, 3)
    .map((inst) => INST_COMPACT[inst.patch_class] ?? PATCH_CLASS_DESCRIPTORS[inst.patch_class])
    .filter(Boolean);
  if (instParts.length > 0) {
    optional.push("Instrumentation: " + instParts.join(", "));
  }

  // Cultural lineage — compact form, strong signals only
  const LINEAGE_COMPACT: Record<string, string> = {
    deep_house:          "deep-house influence",
    kwaito:              "kwaito groove",
    jazz:                "jazz chords",
    lounge:              "lounge pads",
    bacardi:             "bacardi energy",
    dibacardi:           "raw energy",
    log_drum_innovation: "log drum innovation",
    gqom:                "gqom percussion",
    mbira:               "mbira lineage",
  };
  const lineageParts: string[] = [];
  const sources = [
    "deep_house", "kwaito", "jazz", "lounge",
    "bacardi", "dibacardi", "log_drum_innovation", "gqom", "mbira",
  ] as const;
  for (const src of sources) {
    const entry = cultural_lineage[src];
    if (!entry) continue;
    if (entry.weight >= 0.6) {
      lineageParts.push(`strong ${LINEAGE_COMPACT[src]}`);
    } else if (entry.weight >= 0.35) {
      lineageParts.push(LINEAGE_COMPACT[src]);
    }
  }
  if (lineageParts.length > 0) {
    optional.push("Cultural lineage: " + lineageParts.join(", "));
  }

  // Production directives
  optional.push(`Production: ${production_directives.arrangement_strategy}`);
  if (production_directives.mix_priorities.length > 0) {
    optional.push("Mix focus: " + production_directives.mix_priorities.join(", ").replace(/_/g, " "));
  }

  // ─── Assemble: required always present, optional added until limit ────────────
  let result = required.join(". ");

  for (const part of optional) {
    const candidate = `${result}. ${part}`;
    if (candidate.length <= SUNO_STYLE_LIMIT) {
      result = candidate;
    }
  }

  return result;
}
