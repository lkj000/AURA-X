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

const SECTION_TAG: Record<string, string> = {
  intro:         "INTRO",
  verse:         "VERSE",
  drop:          "DROP",
  chorus:        "CHORUS",
  bridge:        "BRIDGE",
  breakdown:     "BREAK",
  build:         "BUILD",
  outro:         "OUTRO",
  dj_loop:       "DJ LOOP",
  // chant-first section types
  hook_fragment: "HOOK",
  question:      "SPOKEN",
  adlib:         "AD-LIB",
  chant_groove:  "CHANT",
  melodic_rap:   "VERSE",
};

export function compileLyricsPrompt(ctl: CTLv1): string {
  const { global, sections, cultural_lineage, cultural_vocabulary } = ctl;

  const lines: string[] = [];

  // Vocal archetype directive
  lines.push(VOCAL_PROFILE_DESCRIPTORS[global.vocal_profile]);

  // Arrangement style directive (chant-first / hook-driven)
  if (cultural_vocabulary?.arrangement_style === "chant_first") {
    lines.push("Chant-first structure: open with hook fragment, not verse — texture before narrative");
  } else if (cultural_vocabulary?.arrangement_style === "hook_driven") {
    lines.push("Hook-driven structure: hook fragment is the primary identity — repeat and vary");
  }

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

  // Vocabulary bank counters
  const vocab = cultural_vocabulary;
  let phraseIndex = 0;
  let fragIndex = 0;
  let qIndex = 0;
  let adlibIndex = 0;
  let crIndex = 0;

  const phrases = CHANT_PHRASES[global.emotional_profile] ?? DEFAULT_PHRASES;

  for (const section of sections) {
    const tag = SECTION_TAG[section.type] ?? section.label.toUpperCase();

    if (!section.vocal_active) {
      lines.push(`[${tag}]`);
      lines.push("instrumental, no vocals");
      lines.push("");
      continue;
    }

    lines.push(`[${tag}]`);

    switch (section.type) {
      case "hook_fragment": {
        const frags = vocab?.hook_fragments ?? [];
        const a = frags[fragIndex % (frags.length || 1)] ?? phrases[phraseIndex % phrases.length];
        const b = frags[(fragIndex + 1) % (frags.length || 1)] ?? phrases[(phraseIndex + 1) % phrases.length];
        lines.push(a);
        lines.push(b);
        fragIndex += 2;
        break;
      }
      case "question": {
        const qs = vocab?.question_bank ?? [];
        const q = qs[qIndex % (qs.length || 1)] ?? phrases[phraseIndex % phrases.length];
        lines.push(q);
        lines.push("[pause — no answer, let the groove respond]");
        qIndex++;
        phraseIndex++;
        break;
      }
      case "adlib": {
        const bank = vocab?.adlib_bank ?? [];
        if (bank.length > 0) {
          lines.push(`${bank[adlibIndex % bank.length]}  ${bank[(adlibIndex + 1) % bank.length]}`);
          lines.push(bank[(adlibIndex + 2) % bank.length]);
        } else {
          lines.push(phrases[phraseIndex % phrases.length]);
          phraseIndex++;
        }
        adlibIndex += 3;
        break;
      }
      case "chant_groove": {
        const crs = vocab?.call_response ?? [];
        if (crs.length > 0) {
          const cr = crs[crIndex % crs.length];
          lines.push(`[Call]: ${cr.call}`);
          lines.push(`[Response]: ${cr.response}`);
          if (cr.response_style) {
            lines.push(`[${cr.response_style}]`);
          }
        } else {
          lines.push(phrases[phraseIndex % phrases.length]);
          phraseIndex++;
          lines.push(phrases[phraseIndex % phrases.length]);
          phraseIndex++;
        }
        crIndex++;
        break;
      }
      case "melodic_rap": {
        lines.push("[melodic rap — baritone lead, lyrical flow over groove]");
        lines.push("[turntable scratches enter]");
        break;
      }
      default: {
        lines.push(phrases[phraseIndex % phrases.length]);
        phraseIndex++;
        lines.push(phrases[phraseIndex % phrases.length]);
        phraseIndex++;
      }
    }

    const transition = TRANSITION_DESCRIPTORS[section.transition_out];
    if (transition) {
      lines.push(`[${transition}]`);
    }
    lines.push("");
  }

  // Language tags — vocabulary takes priority over reference_style_tags filter
  const KNOWN_LANGS = new Set([
    "isiZulu", "ChiShona", "English", "Tsotsitaal",
    "Yoruba", "Kiswahili", "Setswana", "township_slang",
  ]);
  const langTags = vocab?.language_tags?.length
    ? vocab.language_tags
    : global.reference_style_tags.filter((t) => KNOWN_LANGS.has(t));

  if (langTags.length > 0) {
    lines.push(`Language: ${langTags.join(" / ")}`);
  }

  lines.push(`Emotional core: ${global.emotional_profile}`);

  return lines.join("\n").trim();
}
