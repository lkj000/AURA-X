import { CTLv1, InstrumentSchema } from "@aura-x/ctl";
import { z } from "zod";
import {
  LOG_DRUM_PATCH_BY_SUBGENRE,
  KEYBOARD_PATCH_BY_SUBGENRE,
  PAD_PATCH_BY_SUBGENRE,
  LOG_DRUM_BODY_WEIGHT,
  FORBIDDEN_TRAITS_BY_FAMILY,
} from "./instrumentationKnowledge";

type Instrument = z.infer<typeof InstrumentSchema>;

export type InstrumentationPlannerOptions = {
  /** 0–1: how energetic the arrangement should be */
  intensity?: number;
  /** 0–1: higher = more Rhodes, warmer pads */
  warmth?: number;
  /** 0–1: higher = rawer log patch, less pad body */
  rawness?: number;
  vocalMode?: "chant" | "melodic" | "none";
  includeMbira?: boolean;
};

export function planInstrumentation(
  ctl: CTLv1,
  opts: InstrumentationPlannerOptions = {}
): Instrument[] {
  const { global, cultural_lineage } = ctl;
  const subgenre = global.subgenre;

  const warmth  = opts.warmth  ?? 0.5;
  const rawness = opts.rawness ?? 0.5;

  const jazzWeight    = cultural_lineage.jazz?.weight    ?? 0;
  const loungeWeight  = cultural_lineage.lounge?.weight  ?? 0;
  const bacardiWeight = cultural_lineage.bacardi?.weight ?? 0;

  const instruments: Instrument[] = [];

  // ─── 1. LOG DRUM — always first, always mono_centered ─────────────────────
  let logPatch = LOG_DRUM_PATCH_BY_SUBGENRE[subgenre];

  // Bacardi lineage >= 0.6 forces raw log even on luxury/soft lanes
  if (bacardiWeight >= 0.6 && logPatch === "private_school_soft_log") {
    logPatch = "bacardi_raw_log";
  }

  let logBodyWeight = LOG_DRUM_BODY_WEIGHT[subgenre];
  if (rawness >= 0.7) logBodyWeight = Math.min(1.0, logBodyWeight + 0.08);

  instruments.push({
    family:          "log_drum",
    patch_class:     logPatch,
    timbre_class:    "woody_pitched_percussive",
    cultural_role:   "groove_anchor",
    register:        "low_mid",
    stereo_profile:  "mono_centered",   // INVARIANT — log drum is never wide
    body_weight:     parseFloat(logBodyWeight.toFixed(2)),
    attack:          "instant",
    decay:           "short",
    forbidden_traits: FORBIDDEN_TRAITS_BY_FAMILY.log_drum,
  });

  // ─── 2. KEYBOARD (Rhodes or Piano) ───────────────────────────────────────
  let kbData = { ...KEYBOARD_PATCH_BY_SUBGENRE[subgenre] };

  // Jazz lineage >= 0.5 + warmth >= 0.6 → upgrade piano to Rhodes
  if (jazzWeight >= 0.5 && warmth >= 0.6 && kbData.family === "piano") {
    kbData = { primary: "warm_rhodes_luxury", family: "rhodes" };
  }
  // Lounge lineage >= 0.4 → replace raw piano with soft EP
  if (loungeWeight >= 0.4 && kbData.primary === "raw_street_piano_loop") {
    kbData = { primary: "soft_detuned_ep", family: "rhodes" };
  }

  instruments.push({
    family:          kbData.family,
    patch_class:     kbData.primary,
    timbre_class:    kbData.family === "rhodes"
      ? "warm_electric_keyboard"
      : "percussive_acoustic_piano",
    cultural_role:   "harmonic_anchor",
    register:        "mid",
    stereo_profile:  "mid_wide",
    body_weight:     kbData.family === "rhodes" ? 0.65 : 0.55,
    attack:          kbData.family === "rhodes" ? "medium" : "fast",
    decay:           "medium",
    forbidden_traits: kbData.family === "rhodes"
      ? FORBIDDEN_TRAITS_BY_FAMILY.rhodes
      : FORBIDDEN_TRAITS_BY_FAMILY.piano,
  });

  // ─── 3. PADS ──────────────────────────────────────────────────────────────
  let padPatch = PAD_PATCH_BY_SUBGENRE[subgenre];
  // High warmth overrides dark pad → luxury regardless of subgenre
  if (warmth >= 0.75) padPatch = "luxury_noir_pad";

  instruments.push({
    family:          "pads",
    patch_class:     padPatch,
    timbre_class:    padPatch === "luxury_noir_pad"
      ? "warm_analog_bed"
      : "dark_haze_texture",
    cultural_role:   "atmosphere_bed",
    register:        "mid_high",
    stereo_profile:  "wide",
    body_weight:     warmth >= 0.6 ? 0.68 : 0.50,
    attack:          "slow",
    decay:           "long",
    forbidden_traits: FORBIDDEN_TRAITS_BY_FAMILY.pads,
  });

  // ─── 4. SHAKERS ───────────────────────────────────────────────────────────
  instruments.push({
    family:          "shakers",
    patch_class:     rawness >= 0.6 ? "dry_constant_shaker" : "granular_shaker",
    timbre_class:    "organic_pulse",
    cultural_role:   "pulse_glue",
    register:        "high",
    stereo_profile:  "mid_wide",
    body_weight:     0.40,
    attack:          "instant",
    decay:           "short",
    forbidden_traits: FORBIDDEN_TRAITS_BY_FAMILY.shakers,
  });

  // ─── 5. MBIRA (Mbiraiano by default, or opt-in) ───────────────────────────
  const includeMbira = opts.includeMbira ?? (subgenre === "mbiraiano");
  if (includeMbira) {
    instruments.push({
      family:          "mbira",
      patch_class:     "mbira_organic_pluck",
      timbre_class:    "ancestral_tonal_pluck",
      cultural_role:   "ancestral_identity",
      register:        "mid",
      stereo_profile:  "mid_wide",
      body_weight:     0.60,
      attack:          "fast",
      decay:           "medium",
      forbidden_traits: FORBIDDEN_TRAITS_BY_FAMILY.mbira,
    });
  }

  // ─── 6. VOCALS ────────────────────────────────────────────────────────────
  const vocalMode = opts.vocalMode ?? "chant";
  if (vocalMode !== "none") {
    instruments.push({
      family:          "vocals",
      patch_class:     vocalMode === "melodic" ? "female_melodic" : "male_percussive_chant",
      timbre_class:    vocalMode === "melodic" ? "smooth_melodic_voice" : "percussive_chant_voice",
      cultural_role:   vocalMode === "melodic" ? "melodic_lead" : "rhythmic_chant",
      register:        "mid_high",
      stereo_profile:  "mid_wide",
      body_weight:     0.55,
      attack:          "medium",
      decay:           "medium",
      forbidden_traits: FORBIDDEN_TRAITS_BY_FAMILY.vocals,
    });
  }

  return instruments;
}

/** Returns a new CTL with instrumentation replaced by the planner output. Immutable. */
export function applyInstrumentationPlan(
  ctl: CTLv1,
  opts: InstrumentationPlannerOptions = {}
): CTLv1 {
  return { ...ctl, instrumentation: planInstrumentation(ctl, opts) };
}
