import { CTLv1 } from "@aura-x/ctl";
import { MusicGenInput } from "@aura-x/replicate-client";

export type Mode2ConditioningResult = {
  input: MusicGenInput;
  prompt: string;         // the compiled MusicGen prompt
  duration: number;       // seconds
  notes: string[];        // conditioning decisions log
};

// ─── BPM → DURATION MAPPING ───────────────────────────
// MusicGen works best with loops aligned to musical bars.
// 30s at 110 BPM = ~55 bars (good loop length)
// We target 8, 16, or 32 bars depending on complexity.

function bpmToDuration(bpm: number, targetBars: 8 | 16 | 32 = 16): number {
  const secondsPerBar = (60 / bpm) * 4; // 4/4 time
  return Math.round(secondsPerBar * targetBars);
}

// ─── MUSICGEN PROMPT COMPILER ─────────────────────────
// Different from Suno export — MusicGen responds better to
// concise technical prompts (under 200 chars) than to
// long descriptive ones. We compile a focused prompt.

function compileMusicGenPrompt(ctl: CTLv1): { prompt: string; notes: string[] } {
  const { global, harmony, cultural_lineage } = ctl;
  const notes: string[] = [];
  const parts: string[] = [];

  // 1. Core genre + subgenre identity (most important for MusicGen)
  const subgenreLabels: Record<string, string> = {
    private_school:       "Amapiano private school, deep house influenced",
    bacardi:              "Amapiano Bacardi style, raw street energy",
    sgija:                "Amapiano Sgija, bouncy groove",
    stixx_sgija:          "Amapiano Stixx Sgija, deep log drum bounce",
    mbiraiano:            "Amapiano Mbiraiano, organic mbira fusion",
    three_step:           "Amapiano three-step, asymmetric groove",
    gqom_fusion:          "Amapiano Gqom fusion, dark tribal percussion",
    hybrid_rnb_amapiano:  "Amapiano R&B crossover, soulful groove",
  };
  parts.push(subgenreLabels[global.subgenre] ?? "Amapiano");
  notes.push(`Subgenre: ${global.subgenre}`);

  // 2. BPM (critical for MusicGen tempo conditioning)
  parts.push(`${global.bpm} BPM`);

  // 3. Key + mode
  parts.push(`key of ${global.key}`);

  // 4. Harmonic character (short)
  if (harmony.extension_policy === "full_extensions") {
    parts.push("jazz-influenced extended chords");
    notes.push("Extension policy: full → jazz chords added to prompt");
  } else if (harmony.extension_policy === "sevenths_only") {
    parts.push("seventh chords");
  }

  // 5. Dominant lineage (most influential source only)
  const lineageEntries = Object.entries(cultural_lineage)
    .filter(([, v]) => v !== undefined)
    .sort(([, a], [, b]) => (b?.weight ?? 0) - (a?.weight ?? 0));

  const topLineage = lineageEntries[0];
  if (topLineage) {
    const lineagePromptWords: Record<string, string> = {
      log_drum_innovation: "prominent log drum bass",
      deep_house:          "deep house atmosphere",
      bacardi:             "raw percussive energy",
      kwaito:              "kwaito groove feel",
      jazz:                "jazz harmony",
      lounge:              "lounge warmth",
      gqom:                "gqom percussion",
      mbira:               "mbira pluck texture",
    };
    const word = lineagePromptWords[topLineage[0]];
    if (word) {
      parts.push(word);
      notes.push(`Dominant lineage: ${topLineage[0]} (${topLineage[1]?.weight})`);
    }
  }

  // 6. Mix profile mood (short)
  const moodWords: Record<string, string> = {
    luxury_noir:       "late night noir",
    raw_street:        "raw street energy",
    bounce_club:       "club bounce energy",
    spiritual_organic: "organic spiritual warmth",
    dark_tribal:       "dark tribal intensity",
    crossover_rb:      "soulful R&B warmth",
  };
  const mood = moodWords[global.mix_profile];
  if (mood) parts.push(mood);

  // 7. Core instrumentation identifiers
  parts.push("log drum, piano, shakers, warm pads");

  const prompt = parts.join(", ");
  notes.push(`Final prompt length: ${prompt.length} chars`);

  return { prompt, notes };
}

// ─── TEMPERATURE MAPPING ──────────────────────────────
// Private School / luxury lanes: lower temperature (more structured)
// Raw / street lanes: slightly higher (more variation)
// Never go below 0.8 (too repetitive) or above 1.2 (too chaotic)

function computeTemperature(ctl: CTLv1): number {
  const subgenre = ctl.global.subgenre;
  const temps: Record<string, number> = {
    private_school:       0.85,
    bacardi:              1.0,
    sgija:                1.0,
    stixx_sgija:          1.05,
    mbiraiano:            0.9,
    three_step:           1.1,
    gqom_fusion:          1.0,
    hybrid_rnb_amapiano:  0.9,
  };
  return temps[subgenre] ?? 1.0;
}

// ─── CLASSIFIER FREE GUIDANCE MAPPING ────────────────
// Higher CFG = more prompt-adherent but less musical variation
// Lower CFG = more musical but may drift from prompt
// Amapiano needs moderate CFG — too high loses groove feel

function computeCFG(ctl: CTLv1): number {
  const logWeight = ctl.cultural_lineage.log_drum_innovation?.weight ?? 0.5;
  // Higher log drum innovation → higher CFG (enforce groove identity)
  if (logWeight >= 0.75) return 3.5;
  if (logWeight >= 0.55) return 3.0;
  return 2.5;
}

// ─── MAIN CONDITIONER ─────────────────────────────────

export function conditionForMode2(
  ctl: CTLv1,
  options: {
    targetBars?: 8 | 16 | 32;
    melodyUrl?: string;   // optional: melody conditioning audio
  } = {}
): Mode2ConditioningResult {
  const notes: string[] = [];

  const { prompt, notes: promptNotes } = compileMusicGenPrompt(ctl);
  notes.push(...promptNotes);

  const duration = bpmToDuration(
    ctl.global.bpm,
    options.targetBars ?? 16
  );
  notes.push(`Duration: ${duration}s (${options.targetBars ?? 16} bars at ${ctl.global.bpm} BPM)`);

  const temperature = computeTemperature(ctl);
  const cfg = computeCFG(ctl);
  notes.push(`Temperature: ${temperature}, CFG: ${cfg}`);

  const input: MusicGenInput = {
    prompt,
    duration,
    temperature,
    classifier_free_guidance: cfg,
    top_k: 250,
    top_p: 0.0,
    output_format: "wav",
    normalization_strategy: "peak",
    model_version: "stereo_melody",
    ...(options.melodyUrl ? { melody: options.melodyUrl } : {}),
  };

  return { input, prompt, duration, notes };
}
