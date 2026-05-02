import { CTLv1 } from "@aura-x/ctl";
import { compileStylePrompt } from "./styleCompiler";
import { compileLyricsPrompt } from "./lyricsCompiler";

export type SunoBundle = {
  mode: "mode_1_suno";
  track_title: string;
  subgenre: string;
  bpm: number;
  key: string;
  style_prompt: string;
  lyrics_prompt: string;
  style_prompt_length: number;
  lyrics_prompt_length: number;
  warnings: string[];
  compiled_at: string;
};

export function exportForSuno(ctl: CTLv1): SunoBundle {
  const warnings: string[] = [];

  if (ctl.global.generation_mode !== "mode_1_suno") {
    warnings.push(
      `CTL generation_mode is "${ctl.global.generation_mode}" — ` +
      `this exporter is Mode 1 only. Exporting anyway.`
    );
  }

  const style_prompt = compileStylePrompt(ctl);
  const lyrics_prompt = compileLyricsPrompt(ctl);

  if (style_prompt.length > 1000) {
    warnings.push(`Style prompt is ${style_prompt.length} chars — Suno recommends under 1000`);
  }
  if (lyrics_prompt.length > 3000) {
    warnings.push(`Lyrics prompt is ${lyrics_prompt.length} chars — Suno recommends under 3000`);
  }

  return {
    mode: "mode_1_suno",
    track_title: ctl.global.title,
    subgenre: ctl.global.subgenre,
    bpm: ctl.global.bpm,
    key: ctl.global.key,
    style_prompt,
    lyrics_prompt,
    style_prompt_length: style_prompt.length,
    lyrics_prompt_length: lyrics_prompt.length,
    warnings,
    compiled_at: new Date().toISOString(),
  };
}

export { compileStylePrompt, compileLyricsPrompt };
export type { CTLv1 };
