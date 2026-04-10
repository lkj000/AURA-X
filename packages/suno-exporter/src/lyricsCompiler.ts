import { CTLv1 } from "@aura-x/ctl";
import { TRANSITION_DESCRIPTORS, VOCAL_PROFILE_DESCRIPTORS } from "./maps";

export function compileLyricsPrompt(ctl: CTLv1): string {
  const { global, sections, cultural_lineage } = ctl;

  const parts: string[] = [];

  // 1. Vocal doctrine from vocal profile
  parts.push(VOCAL_PROFILE_DESCRIPTORS[global.vocal_profile]);

  // 2. Kwaito influence → repetition doctrine
  const kwaitoWeight = cultural_lineage.kwaito?.weight ?? 0;
  if (kwaitoWeight >= 0.35) {
    parts.push("Favor repetition and space between lines — kwaito vocal logic");
  }

  // 3. Log drum innovation → leave space directive
  const logWeight = cultural_lineage.log_drum_innovation?.weight ?? 0;
  if (logWeight >= 0.6) {
    parts.push("Vocals must leave space for the log drum — do not crowd the groove");
  }

  // 4. Section-by-section architecture
  const sectionLines: string[] = ["\nSection architecture:"];
  for (const section of sections) {
    if (!section.vocal_active) {
      sectionLines.push(`[${section.label.toUpperCase()}] — instrumental, no vocals`);
      continue;
    }
    const transition = TRANSITION_DESCRIPTORS[section.transition_out];
    sectionLines.push(
      `[${section.label.toUpperCase()}] — ${section.purpose}. ` +
      `Energy: ${Math.round(section.energy_target * 100)}%. ` +
      `Transition: ${transition}.`
    );
  }
  parts.push(sectionLines.join("\n"));

  // 5. Language guidance from reference tags
  if (global.reference_style_tags.length > 0) {
    const langTags = global.reference_style_tags.filter((t) =>
      ["isiZulu", "ChiShona", "English", "Tsotsitaal", "Yoruba", "Kiswahili"].includes(t)
    );
    if (langTags.length > 0) {
      parts.push(`\nLanguage: ${langTags.join(" / ")}`);
    }
  }

  // 6. Emotional anchor
  parts.push(`Emotional core: ${global.emotional_profile}`);

  return parts.join(". ");
}
