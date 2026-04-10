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

export function compileStylePrompt(ctl: CTLv1): string {
  const { global, harmony, instrumentation, cultural_lineage, style_constraints, production_directives } = ctl;

  const parts: string[] = [];

  // 1. Core identity
  parts.push(SUBGENRE_DESCRIPTORS[global.subgenre]);
  parts.push(`${global.bpm} BPM, ${global.key}`);
  parts.push(MIX_PROFILE_DESCRIPTORS[global.mix_profile]);
  parts.push(`Emotional character: ${global.emotional_profile}`);

  // 2. Cultural lineage — translate weights → verbal emphasis, never expose numbers
  const lineageParts: string[] = [];
  const sources = [
    "deep_house", "kwaito", "jazz", "lounge",
    "bacardi", "dibacardi", "log_drum_innovation", "gqom", "mbira",
  ] as const;
  for (const src of sources) {
    const entry = cultural_lineage[src];
    if (!entry) continue;
    if (entry.weight >= 0.6) {
      lineageParts.push(`strong ${LINEAGE_DESCRIPTORS[src]}`);
    } else if (entry.weight >= 0.35) {
      lineageParts.push(LINEAGE_DESCRIPTORS[src]);
    }
  }
  if (lineageParts.length > 0) {
    parts.push("Cultural lineage: " + lineageParts.join("; "));
  }

  // 3. Instrumentation — translate patch_class codes → musical descriptions
  const instParts: string[] = [];
  for (const inst of instrumentation) {
    const desc = PATCH_CLASS_DESCRIPTORS[inst.patch_class];
    if (desc) instParts.push(desc);
  }
  if (instParts.length > 0) {
    parts.push("Instrumentation: " + instParts.join(", "));
  }

  // 4. Harmonic language
  parts.push(
    `Harmony: ${EXTENSION_POLICY_DESCRIPTORS[harmony.extension_policy]}, ` +
    `${VOICING_STYLE_DESCRIPTORS[harmony.voicing_style]}, ` +
    `${HARMONIC_RHYTHM_DESCRIPTORS[harmony.harmonic_rhythm]}`
  );
  if (harmony.exemplar_progressions.length > 0) {
    parts.push(`Chord progression: ${harmony.exemplar_progressions[0]}`);
  }

  // 5. Production directives
  parts.push(`Production: ${production_directives.arrangement_strategy}`);
  if (production_directives.mix_priorities.length > 0) {
    parts.push("Mix focus: " + production_directives.mix_priorities.join(", ").replace(/_/g, " "));
  }

  // 6. Vocals
  parts.push(VOCAL_PROFILE_DESCRIPTORS[global.vocal_profile]);

  // 7. Anti-drift — forbidden traits → avoidance instructions
  const forbidden = style_constraints.forbidden_traits
    .map((t) => t.replace(/_/g, " "))
    .join(", ");
  if (forbidden) {
    parts.push(`Avoid: ${forbidden}`);
  }

  return parts.join(". ");
}
