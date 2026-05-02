import Anthropic from "@anthropic-ai/sdk";
import { CTLv1 } from "@aura-x/ctl";
import { exportForSuno } from "@aura-x/suno-exporter";

const MODEL = "claude-haiku-4-5-20251001";

// Compact CTL → plain-language summary for the LLM context window
function summarizeCTL(ctl: CTLv1): string {
  const { global, sections, cultural_lineage, instrumentation, harmony, style_constraints, production_directives } = ctl;

  const lineageLines: string[] = [];
  const lineageKeys = ["deep_house", "kwaito", "jazz", "lounge", "bacardi", "dibacardi", "log_drum_innovation", "gqom", "mbira"] as const;
  for (const k of lineageKeys) {
    const entry = cultural_lineage[k];
    if (entry && entry.weight >= 0.25) {
      lineageLines.push(`${k.replace(/_/g, " ")} (${entry.weight})`);
    }
  }

  const sectionSummary = sections
    .map(s => `${s.label}(${s.end_bar - s.start_bar}bars,vocal=${s.vocal_active})`)
    .join(" → ");

  const topInst = instrumentation.slice(0, 4)
    .map(i => i.patch_class.replace(/_/g, " "))
    .join(", ");

  const forbidden = style_constraints.forbidden_traits
    .map(t => t.replace(/_/g, " "))
    .join(", ");

  return [
    `SUBGENRE: ${global.subgenre.replace(/_/g, " ")}`,
    `BPM: ${global.bpm} | KEY: ${global.key} | MODE: ${global.mode}`,
    `EMOTIONAL PROFILE: ${global.emotional_profile}`,
    `VOCAL PROFILE: ${global.vocal_profile.replace(/_/g, " ")}`,
    `MIX PROFILE: ${global.mix_profile.replace(/_/g, " ")}`,
    `CULTURAL LINEAGE: ${lineageLines.join(", ") || "none specified"}`,
    `INSTRUMENTATION: ${topInst || "standard amapiano palette"}`,
    `HARMONY: ${harmony.exemplar_progressions.slice(0, 2).join(" | ")} — ${harmony.voicing_style.replace(/_/g, " ")}, ${harmony.extension_policy.replace(/_/g, " ")}, ${harmony.harmonic_rhythm.replace(/_/g, " ")}`,
    `SONG STRUCTURE: ${sectionSummary}`,
    `FORBIDDEN: ${forbidden || "none"}`,
    `ARRANGEMENT: ${production_directives.arrangement_strategy.replace(/_/g, " ")}`,
    `MIX PRIORITIES: ${production_directives.mix_priorities.map(p => p.replace(/_/g, " ")).join(", ")}`,
  ].join("\n");
}

const SYSTEM_PROMPT = `You are a Suno AI prompt expert specialising in African electronic music — specifically Amapiano and its subgenres.

Given a structured CTL (Compositional Template Layer) description of a track, you write TWO outputs:

1. STYLE_PROMPT — the Suno style field (≤1000 characters)
   Rules:
   - Comma-separated tags only, NO full sentences
   - Lead with genre identity (e.g. "amapiano", "deep amapiano", "bacardi amapiano")
   - Include: subgenre variant, key instruments, BPM feel, cultural roots, mood, mix texture, era/region markers
   - Use Suno-recognised music vocabulary: "log drum", "log drums", "kwaito bass", "deep house pads", "mbira pluck", "gqom kick", "rhodes piano", "warm pads", "boom bap snare", "lo-fi", "organic", "raw street energy"
   - Keep it under 1000 characters — 600-800 is ideal
   - NO forbidden elements from the CTL

2. LYRICS_PROMPT — the Suno custom lyrics / metatag field
   Rules:
   - Use ONLY these Suno section tags: [INTRO], [VERSE], [PRE-CHORUS], [CHORUS], [DROP], [BUILD], [BREAK], [BRIDGE], [OUTRO]
   - Instrumental sections: tag + "instrumental" on next line
   - Vocal sections: 2-4 sparse lines of actual lyrics/chants (Zulu, English, or mix) that match the emotional profile
   - Zulu/Nguni phrases encouraged: woza, yebo, ubuntu, mzansi, ebusuku, amandla, siyabamba, etc.
   - Keep lines short and rhythmically sparse — amapiano vocals breathe, they don't crowd
   - After all sections: one line "Emotional core: {profile}"

Respond with EXACTLY this JSON structure (no markdown, no extra text):
{"style_prompt":"...", "lyrics_prompt":"..."}`;

export type LLMCompileResult = {
  style_prompt: string;
  lyrics_prompt: string;
  source: "llm" | "static";
};

export async function compileSunoPromptsWithLLM(
  ctl: CTLv1
): Promise<LLMCompileResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return compileSunoPromptsStatic(ctl);
  }

  const client = new Anthropic({ apiKey });
  const ctlSummary = summarizeCTL(ctl);

  try {
    const message = await client.messages.create({
      model:      MODEL,
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Generate Suno prompts for this track:\n\n${ctlSummary}`,
        },
      ],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "";
    const parsed = JSON.parse(raw) as { style_prompt: string; lyrics_prompt: string };

    if (!parsed.style_prompt || !parsed.lyrics_prompt) {
      throw new Error("LLM response missing required fields");
    }

    // Enforce hard limit — truncate at word boundary if needed
    let style = parsed.style_prompt;
    if (style.length > 1000) {
      style = style.slice(0, 997) + "...";
    }

    return { style_prompt: style, lyrics_prompt: parsed.lyrics_prompt, source: "llm" };
  } catch {
    return compileSunoPromptsStatic(ctl);
  }
}

function compileSunoPromptsStatic(ctl: CTLv1): LLMCompileResult {
  const bundle = exportForSuno(ctl);
  return {
    style_prompt:  bundle.style_prompt,
    lyrics_prompt: bundle.lyrics_prompt,
    source: "static",
  };
}
