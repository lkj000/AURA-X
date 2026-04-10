import { z } from "zod";

// ─────────────────────────────────────────────
// BLOCK 1 — ENUMS
// ─────────────────────────────────────────────

export const SubgenreEnum = z.enum([
  "private_school",
  "bacardi",
  "sgija",
  "stixx_sgija",
  "mbiraiano",
  "three_step",
  "gqom_fusion",
  "hybrid_rnb_amapiano",
]);

export const GenerationModeEnum = z.enum(["mode_1_suno", "mode_2_musicgen", "mode_3_suno_api"]);

export const MixProfileEnum = z.enum([
  "luxury_noir", "raw_street", "bounce_club",
  "spiritual_organic", "dark_tribal", "crossover_rb",
]);

export const VocalProfileEnum = z.enum([
  "sparse_chant", "medium_melodic", "dense_call_response",
  "percussive_only", "none",
]);

// ─────────────────────────────────────────────
// BLOCK 2 — GLOBAL
// ─────────────────────────────────────────────

export const CTLGlobalSchema = z.object({
  title: z.string(),
  bpm: z.number().min(95).max(130),
  key: z.string(),
  mode: z.string(),
  genre: z.literal("amapiano"),
  subgenre: SubgenreEnum,
  mix_profile: MixProfileEnum,
  vocal_profile: VocalProfileEnum,
  generation_mode: GenerationModeEnum,
  emotional_profile: z.string(),
  reference_style_tags: z.array(z.string()),
  created_by: z.string(),
  created_at: z.string().datetime(),
});

// ─────────────────────────────────────────────
// BLOCK 3 — SECTIONS
// ─────────────────────────────────────────────

export const SectionTypeEnum = z.enum([
  "intro", "verse", "chorus", "drop",
  "breakdown", "dj_loop", "bridge", "outro",
]);

export const SectionSchema = z.object({
  id: z.string(),
  type: SectionTypeEnum,
  label: z.string(),
  start_bar: z.number().int().min(0),
  end_bar: z.number().int().min(1),
  purpose: z.string(),
  energy_target: z.number().min(0).max(1),
  log_drum_active: z.boolean(),
  pad_active: z.boolean(),
  piano_active: z.boolean(),
  vocal_active: z.boolean(),
  transition_out: z.enum(["cut", "fade", "log_drum_fill", "filter_sweep", "echo_out"]),
  notes: z.string().optional(),
});

// ─────────────────────────────────────────────
// BLOCK 4 — CURVES
// ─────────────────────────────────────────────

export const CurvePointSchema = z.object({
  bar: z.number().int().min(0),
  value: z.number().min(0).max(1),
});

export const CTLCurvesSchema = z.object({
  energy:            z.array(CurvePointSchema),
  log_drum_density:  z.array(CurvePointSchema),
  bass_presence:     z.array(CurvePointSchema),
  pad_warmth:        z.array(CurvePointSchema),
  piano_activity:    z.array(CurvePointSchema),
  vocal_presence:    z.array(CurvePointSchema),
  groove_aggression: z.array(CurvePointSchema),
  restraint:         z.array(CurvePointSchema),
  tension:           z.array(CurvePointSchema),
});

// ─────────────────────────────────────────────
// BLOCK 5 — GROOVE PATTERNS
// ─────────────────────────────────────────────

export const StepTokenEnum = z.enum([
  "K", "L", "g", "x", "C", "R", "-",
]);

export const GroovePatternSchema = z.object({
  id: z.string(),
  label: z.string(),
  steps: z.array(StepTokenEnum).length(16),
  microtiming: z.array(z.number()).length(16),
  velocity: z.array(z.number().min(0).max(127)).length(16),
  swing: z.number().min(0).max(1),
  variation_of: z.string().optional(),
});

// ─────────────────────────────────────────────
// BLOCK 6 — HARMONY PROFILE
// ─────────────────────────────────────────────

export const HarmonyProfileSchema = z.object({
  tonal_center: z.string(),
  mode: z.string(),
  preferred_progressions: z.array(z.string()),
  exemplar_progressions: z.array(z.string()),
  max_chord_changes_per_4_bars: z.number().int().min(1).max(8),
  extension_policy: z.enum(["none", "sevenths_only", "full_extensions"]),
  voicing_style: z.enum(["sparse", "medium", "dense"]),
  harmonic_rhythm: z.enum(["static", "slow", "medium"]),
});

// ─────────────────────────────────────────────
// BLOCK 7 — INSTRUMENTATION
// ─────────────────────────────────────────────

export const InstrumentFamilyEnum = z.enum([
  "log_drum", "piano", "rhodes", "pads",
  "shakers", "kick", "bass", "stabs",
  "mbira", "vocals", "fx",
]);

export const InstrumentSchema = z.object({
  family: InstrumentFamilyEnum,
  patch_class: z.string(),
  timbre_class: z.string(),
  cultural_role: z.string(),
  register: z.string(),
  stereo_profile: z.enum(["mono_centered", "wide", "mid_wide", "hard_pan_left", "hard_pan_right"]),
  body_weight: z.number().min(0).max(1),
  attack: z.enum(["instant", "fast", "medium", "slow"]),
  decay: z.enum(["short", "medium", "long"]),
  forbidden_traits: z.array(z.string()),
});

// ─────────────────────────────────────────────
// BLOCK 8 — CULTURAL LINEAGE
// ─────────────────────────────────────────────

export const LineageSourceSchema = z.object({
  weight: z.number().min(0).max(1),
  influences: z.array(z.string()),
  must_not: z.array(z.string()),
});

export const CulturalLineageSchema = z.object({
  deep_house:          LineageSourceSchema,
  kwaito:              LineageSourceSchema,
  jazz:                LineageSourceSchema,
  lounge:              LineageSourceSchema,
  bacardi:             LineageSourceSchema,
  dibacardi:           LineageSourceSchema,
  log_drum_innovation: LineageSourceSchema,
  gqom:                LineageSourceSchema.optional(),
  mbira:               LineageSourceSchema.optional(),
});

// ─────────────────────────────────────────────
// BLOCK 9 — STYLE CONSTRAINTS
// ─────────────────────────────────────────────

export const StyleConstraintsSchema = z.object({
  max_piano_busyness:    z.number().min(0).max(1),
  min_pad_warmth:        z.number().min(0).max(1),
  max_perc_aggression:   z.number().min(0).max(1),
  preferred_keys:        z.array(z.string()),
  forbidden_traits:      z.array(z.string()),
});

// ─────────────────────────────────────────────
// BLOCK 10 — PRODUCTION DIRECTIVES
// ─────────────────────────────────────────────

export const ProductionDirectivesSchema = z.object({
  mix_priorities:       z.array(z.string()),
  arrangement_strategy: z.string(),
  automation_hints:     z.array(z.string()),
  layering_rules:       z.array(z.string()),
  master_target_lufs:   z.number().min(-20).max(-6),
});

// ─────────────────────────────────────────────
// BLOCK 11 — EVALUATION TARGETS
// ─────────────────────────────────────────────

export const EvaluationTargetsSchema = z.object({
  authenticity_target:             z.number().min(0).max(1),
  subgenre_recognizability_target: z.number().min(0).max(1),
  groove_clarity_target:           z.number().min(0).max(1),
  harmonic_density_target:         z.number().min(0).max(1),
  dj_mix_friendliness_target:      z.number().min(0).max(1),
  cultural_lineage_coherence:      z.number().min(0).max(1),
});

// ─────────────────────────────────────────────
// BLOCK 12 — ROOT CTL_v1 SCHEMA
// ─────────────────────────────────────────────

export const CTLv1Schema = z.object({
  schema_version: z.literal("ctl_v1"),
  global: CTLGlobalSchema,
  sections: z.array(SectionSchema).min(1),
  curves: CTLCurvesSchema,
  groove_patterns: z.array(GroovePatternSchema).min(1),
  harmony: HarmonyProfileSchema,
  instrumentation: z.array(InstrumentSchema).min(1),
  cultural_lineage: CulturalLineageSchema,
  style_constraints: StyleConstraintsSchema,
  production_directives: ProductionDirectivesSchema,
  evaluation_targets: EvaluationTargetsSchema,
});

export type CTLv1 = z.infer<typeof CTLv1Schema>;

// ─────────────────────────────────────────────
// BLOCK 13 — FACTORY FUNCTION
// ─────────────────────────────────────────────

type CreateCTLInput = Omit<Partial<CTLv1>, "global"> & {
  global: Partial<z.infer<typeof CTLGlobalSchema>> & {
    title: string;
    bpm: number;
    key: string;
    subgenre: z.infer<typeof SubgenreEnum>;
    created_by: string;
  };
};

export function createCTL(overrides: CreateCTLInput): CTLv1 {
  const now = new Date().toISOString();
  const base: CTLv1 = {
    schema_version: "ctl_v1",
    global: {
      genre: "amapiano",
      mode: "aeolian",
      mix_profile: "luxury_noir",
      vocal_profile: "sparse_chant",
      generation_mode: "mode_1_suno",
      emotional_profile: "late-night elegance",
      reference_style_tags: [],
      created_at: now,
      ...overrides.global,
    },
    sections: overrides.sections ?? [{
      id: "intro_01",
      type: "intro",
      label: "Intro",
      start_bar: 0,
      end_bar: 8,
      purpose: "Establish atmosphere, withhold drop",
      energy_target: 0.3,
      log_drum_active: false,
      pad_active: true,
      piano_active: false,
      vocal_active: false,
      transition_out: "log_drum_fill",
    }],
    curves: overrides.curves ?? {
      energy:            [{ bar: 0, value: 0.2 }, { bar: 16, value: 0.8 }],
      log_drum_density:  [{ bar: 0, value: 0.0 }, { bar: 8,  value: 0.7 }],
      bass_presence:     [{ bar: 0, value: 0.3 }, { bar: 16, value: 0.8 }],
      pad_warmth:        [{ bar: 0, value: 0.8 }, { bar: 32, value: 0.6 }],
      piano_activity:    [{ bar: 0, value: 0.1 }, { bar: 8,  value: 0.4 }],
      vocal_presence:    [{ bar: 0, value: 0.0 }, { bar: 12, value: 0.5 }],
      groove_aggression: [{ bar: 0, value: 0.2 }, { bar: 16, value: 0.6 }],
      restraint:         [{ bar: 0, value: 0.9 }, { bar: 32, value: 0.4 }],
      tension:           [{ bar: 0, value: 0.1 }, { bar: 24, value: 0.7 }],
    },
    groove_patterns: overrides.groove_patterns ?? [{
      id: "default_groove_01",
      label: "Default Amapiano Groove",
      steps: ["K", "-", "x", "-", "L", "-", "x", "g", "K", "-", "x", "-", "L", "x", "-", "g"],
      microtiming: [0, 0, -5, 0, 0, 0, 0, 8, 0, 0, -3, 0, 0, 0, 12, 8],
      velocity: [110, 0, 60, 0, 95, 0, 55, 40, 100, 0, 58, 0, 90, 50, 0, 38],
      swing: 0.56,
    }],
    harmony: overrides.harmony ?? {
      tonal_center: overrides.global.key?.replace("m", "") ?? "F#",
      mode: "aeolian",
      preferred_progressions: ["i-VI-III-VII"],
      exemplar_progressions: ["F#m7-Dmaj7-Amaj7-E"],
      max_chord_changes_per_4_bars: 4,
      extension_policy: "full_extensions",
      voicing_style: "sparse",
      harmonic_rhythm: "slow",
    },
    instrumentation: overrides.instrumentation ?? [
      {
        family: "log_drum",
        patch_class: "private_school_soft_log",
        timbre_class: "woody_pitched_percussive",
        cultural_role: "groove_anchor",
        register: "low_mid",
        stereo_profile: "mono_centered",
        body_weight: 0.75,
        attack: "instant",
        decay: "short",
        forbidden_traits: ["trap_bass_808", "sub_only_sine", "edm_kick_punch"],
      },
      {
        family: "pads",
        patch_class: "luxury_noir_pad",
        timbre_class: "warm_analog_bed",
        cultural_role: "atmosphere_bed",
        register: "mid_high",
        stereo_profile: "wide",
        body_weight: 0.6,
        attack: "slow",
        decay: "long",
        forbidden_traits: ["edm_swell", "trance_pad", "sharp_attack"],
      },
    ],
    cultural_lineage: overrides.cultural_lineage ?? {
      deep_house:          { weight: 0.72, influences: ["harmonic_pacing", "atmospheric_restraint", "pad_identity"], must_not: ["replace_log_drum", "four_on_floor_dominance"] },
      kwaito:              { weight: 0.38, influences: ["groove_attitude", "vocal_spacing", "repetition_logic"], must_not: ["override_harmonic_richness"] },
      jazz:                { weight: 0.52, influences: ["chord_extensions", "rhodes_warmth", "late_night_elegance"], must_not: ["virtuosic_runs", "bebop_complexity"] },
      lounge:              { weight: 0.44, influences: ["pad_sophistication", "section_patience"], must_not: ["elevator_music_sweetness"] },
      bacardi:             { weight: 0.18, influences: ["percussive_motion"], must_not: ["override_luxury_restraint"] },
      dibacardi:           { weight: 0.14, influences: ["raw_energy_undertone"], must_not: [] },
      log_drum_innovation: { weight: 0.78, influences: ["low_end_authorship", "motif_identity", "drop_definition"], must_not: ["generic_bass_replacement"] },
    },
    style_constraints: overrides.style_constraints ?? {
      max_piano_busyness:  0.4,
      min_pad_warmth:      0.6,
      max_perc_aggression: 0.6,
      preferred_keys:      ["F#m", "C#m", "Em", "Dm", "Gm", "Am"],
      forbidden_traits:    [
        "trap_hats", "edm_risers", "supersaw", "gospel_runs",
        "virtuosic_piano", "808_glide_replacing_log_drum",
        "four_on_floor_dominance", "bright_pop_piano",
        "eurodance_melody", "generic_pluck_for_mbira",
      ],
    },
    production_directives: overrides.production_directives ?? {
      mix_priorities:       ["log_drum_front", "pad_warmth_bed", "piano_sparse_top"],
      arrangement_strategy: "subtractive elegance — space is an instrument",
      automation_hints:     ["filter_sweep_into_drop", "pad_swell_intro", "log_drum_fill_transition"],
      layering_rules:       ["log_drum_never_masked_by_bass", "piano_never_busier_than_groove"],
      master_target_lufs:   -10,
    },
    evaluation_targets: overrides.evaluation_targets ?? {
      authenticity_target:             0.85,
      subgenre_recognizability_target: 0.80,
      groove_clarity_target:           0.90,
      harmonic_density_target:         0.35,
      dj_mix_friendliness_target:      0.85,
      cultural_lineage_coherence:      0.80,
    },
  };
  return CTLv1Schema.parse(base);
}

export * from "./presets";
