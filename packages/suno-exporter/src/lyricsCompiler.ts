import { CTLv1 } from "@aura-x/ctl";
import { TRANSITION_DESCRIPTORS, VOCAL_PROFILE_DESCRIPTORS } from "./maps";

// Sparse Zulu-inflected placeholder phrases keyed by emotional profile.
// These are structural seeds — Suno fills in the actual performance.
const CHANT_PHRASES: Record<string, string[]> = {
  "late night introspection": ["Woza lapha", "Ebusuku obuhle", "Siyabamba", "Ngiyakhala"],
  "euphoric celebration":     ["Yebo, yebo", "Sicula sonke", "Siyajabula", "Amandla"],
  "melancholic longing":      ["Ngiyakhala", "Uyaphi", "Ngilinde wena", "Ekhaya"],
  "community joy":            ["Sisonke", "Ubuntu wethu", "Siyajabula", "Mzansi"],
  "spiritual elevation":      ["Haleluya", "Siyabonga", "Ndikhokhele", "Amandla"],
  "ancestral reverence":      ["Abaphansi", "Siyabonga", "Hamba kahle", "Ndikhokhele"],
  "romantic tension":         ["Ngiyakuthanda", "Woza lapha", "Ngicel ukubuya", "Oh"],
};

const DEFAULT_PHRASES = CHANT_PHRASES["late night introspection"];

// Map CTL section labels → standard Suno metatags
const SECTION_TAG: Record<string, string> = {
  intro:     "INTRO",
  verse:     "VERSE",
  drop:      "DROP",
  chorus:    "CHORUS",
  bridge:    "BRIDGE",
  breakdown: "BREAK",
  build:     "BUILD",
  outro:     "OUTRO",
  hook:      "HOOK",
};

export function compileLyricsPrompt(ctl: CTLv1): string {
  const { global, sections, cultural_lineage } = ctl;

  const lines: string[] = [];

  // ─── Vocal archetype directive (top of the lyrics field) ─────────────────────
  lines.push(VOCAL_PROFILE_DESCRIPTORS[global.vocal_profile]);

  // Kwaito influence → repetition doctrine
  const kwaitoWeight = cultural_lineage.kwaito?.weight ?? 0;
  if (kwaitoWeight >= 0.35) {
    lines.push("Favor repetition and space between lines — kwaito vocal logic");
  }

  // Log drum innovation → leave space directive
  const logWeight = cultural_lineage.log_drum_innovation?.weight ?? 0;
  if (logWeight >= 0.6) {
    lines.push("Vocals must leave space for the log drum — do not crowd the groove");
  }

  lines.push("");

  // ─── Section-by-section structure ────────────────────────────────────────────
  const phrases = CHANT_PHRASES[global.emotional_profile] ?? DEFAULT_PHRASES;
  let phraseIndex = 0;

  for (const section of sections) {
    const tag = SECTION_TAG[section.label.toLowerCase()] ?? section.label.toUpperCase();

    if (!section.vocal_active) {
      lines.push(`[${tag}]`);
      lines.push("instrumental, no vocals");
      lines.push("");
      continue;
    }

    const transition = TRANSITION_DESCRIPTORS[section.transition_out];
    lines.push(`[${tag}]`);

    // 2 sparse chant phrases per vocal section
    lines.push(phrases[phraseIndex % phrases.length]);
    phraseIndex++;
    lines.push(phrases[phraseIndex % phrases.length]);
    phraseIndex++;

    if (transition) {
      lines.push(`[${transition}]`);
    }
    lines.push("");
  }

  // Language guidance
  if (global.reference_style_tags.length > 0) {
    const langTags = global.reference_style_tags.filter((t) =>
      ["isiZulu", "ChiShona", "English", "Tsotsitaal", "Yoruba", "Kiswahili"].includes(t)
    );
    if (langTags.length > 0) {
      lines.push(`Language: ${langTags.join(" / ")}`);
    }
  }

  lines.push(`Emotional core: ${global.emotional_profile}`);

  return lines.join("\n").trim();
}
