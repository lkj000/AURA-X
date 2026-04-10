/**
 * AC-AMI Preset Library — 8 canonical Amapiano subgenre blueprints.
 * Each preset is a fully-validated CTLv1 object encoding the cultural
 * intelligence of that subgenre: lineage weights, groove DNA, harmony
 * profile, instrumentation palette, and production constraints.
 *
 * These are the ground truth against which all planners and validators
 * are calibrated.
 */

import { createCTL, CTLv1 } from "../index";

// ─────────────────────────────────────────────────────────────────────────────
// 1. PRIVATE SCHOOL
// Deep house dominant. Restraint as luxury. Late-night elegance.
// Lineage invariant: deep_house >= 0.50, log_drum_innovation >= 0.45
// ─────────────────────────────────────────────────────────────────────────────
export const privateSchoolPreset: CTLv1 = createCTL({
  global: {
    title: "Private School Prototype",
    bpm: 112,
    key: "F#m",
    subgenre: "private_school",
    mix_profile: "luxury_noir",
    vocal_profile: "sparse_chant",
    emotional_profile: "late-night elegance, understated power",
    reference_style_tags: ["Kabza De Small", "DJ Maphorisa", "Ami Faku"],
    created_by: "okovanggo_ai",
  },
  sections: [
    { id: "ps_intro",     type: "intro",     label: "Intro",     start_bar: 0,  end_bar: 8,  purpose: "Pads only — atmosphere before the log drum",    energy_target: 0.25, log_drum_active: false, pad_active: true,  piano_active: false, vocal_active: false, transition_out: "log_drum_fill" },
    { id: "ps_drop",      type: "drop",      label: "Drop",      start_bar: 8,  end_bar: 24, purpose: "Log drum locks in, groove at full expression",   energy_target: 0.78, log_drum_active: true,  pad_active: true,  piano_active: true,  vocal_active: true,  transition_out: "filter_sweep" },
    { id: "ps_breakdown", type: "breakdown", label: "Breakdown", start_bar: 24, end_bar: 32, purpose: "Strip back to piano and pads — tension rebuild",  energy_target: 0.42, log_drum_active: false, pad_active: true,  piano_active: true,  vocal_active: false, transition_out: "log_drum_fill" },
    { id: "ps_outro",     type: "outro",     label: "Outro",     start_bar: 32, end_bar: 40, purpose: "Groove fades, pads sustain into the next track",  energy_target: 0.28, log_drum_active: true,  pad_active: true,  piano_active: false, vocal_active: false, transition_out: "fade" },
  ],
  curves: {
    energy:            [{ bar: 0, value: 0.22 }, { bar: 8, value: 0.78 }, { bar: 24, value: 0.42 }, { bar: 40, value: 0.25 }],
    log_drum_density:  [{ bar: 0, value: 0.00 }, { bar: 8, value: 0.70 }, { bar: 24, value: 0.00 }, { bar: 32, value: 0.60 }],
    bass_presence:     [{ bar: 0, value: 0.30 }, { bar: 8, value: 0.75 }],
    pad_warmth:        [{ bar: 0, value: 0.88 }, { bar: 40, value: 0.65 }],
    piano_activity:    [{ bar: 0, value: 0.00 }, { bar: 8, value: 0.32 }, { bar: 24, value: 0.55 }],
    vocal_presence:    [{ bar: 0, value: 0.00 }, { bar: 12, value: 0.42 }],
    groove_aggression: [{ bar: 0, value: 0.15 }, { bar: 8, value: 0.52 }],
    restraint:         [{ bar: 0, value: 0.92 }, { bar: 40, value: 0.72 }],
    tension:           [{ bar: 0, value: 0.10 }, { bar: 20, value: 0.65 }, { bar: 40, value: 0.18 }],
  },
  groove_patterns: [{
    id: "ps_groove_01",
    label: "Private School Main — refined, breath between hits",
    steps: ["K", "-", "x", "-", "L", "-", "x", "g", "K", "-", "x", "-", "L", "x", "-", "g"],
    microtiming: [0, 0, -3, 0, 0, 0, -3, 8, 0, 0, -3, 0, 0, 0, -3, 8],
    velocity:    [110, 0, 55, 0, 100, 0, 50, 35, 105, 0, 52, 0, 95, 0, 48, 32],
    swing: 0.56,
  }],
  harmony: {
    tonal_center: "F#",
    mode: "aeolian",
    preferred_progressions: ["i-VI-III-VII", "i-iv-III-VII"],
    exemplar_progressions: ["F#m7-Dmaj7-Amaj7-E7", "F#m9-Bm9-Amaj9-E9"],
    max_chord_changes_per_4_bars: 4,
    extension_policy: "full_extensions",
    voicing_style: "sparse",
    harmonic_rhythm: "slow",
  },
  instrumentation: [
    { family: "log_drum", patch_class: "private_school_soft_log",  timbre_class: "woody_pitched_percussive", cultural_role: "groove_anchor",   register: "low_mid",  stereo_profile: "mono_centered", body_weight: 0.75, attack: "instant", decay: "short",  forbidden_traits: ["trap_bass_808", "sub_only_sine", "edm_kick_punch"] },
    { family: "pads",     patch_class: "luxury_noir_pad",          timbre_class: "warm_analog_bed",         cultural_role: "atmosphere_bed",  register: "mid_high", stereo_profile: "wide",          body_weight: 0.65, attack: "slow",    decay: "long",   forbidden_traits: ["edm_swell", "trance_pad", "sharp_attack"] },
    { family: "piano",    patch_class: "jazz_electric_refined",    timbre_class: "warm_voiced_keys",        cultural_role: "melodic_ornament",register: "mid",      stereo_profile: "mid_wide",      body_weight: 0.38, attack: "fast",    decay: "medium", forbidden_traits: ["gospel_runs", "virtuosic_cascade", "bright_pop_piano"] },
    { family: "rhodes",   patch_class: "vintage_rhodes_warm",      timbre_class: "bell_tone_keys",          cultural_role: "harmonic_fill",   register: "mid",      stereo_profile: "mid_wide",      body_weight: 0.44, attack: "fast",    decay: "medium", forbidden_traits: ["harsh_treble", "digital_key"] },
  ],
  cultural_lineage: {
    deep_house:          { weight: 0.72, influences: ["harmonic_pacing", "atmospheric_restraint", "pad_identity"],        must_not: ["replace_log_drum", "four_on_floor_dominance"] },
    kwaito:              { weight: 0.22, influences: ["groove_attitude", "vocal_spacing"],                                must_not: ["override_harmonic_richness"] },
    jazz:                { weight: 0.55, influences: ["chord_extensions", "rhodes_warmth", "late_night_elegance"],        must_not: ["virtuosic_runs", "bebop_complexity"] },
    lounge:              { weight: 0.50, influences: ["pad_sophistication", "section_patience"],                          must_not: ["elevator_music_sweetness"] },
    bacardi:             { weight: 0.12, influences: ["percussive_undertone"],                                            must_not: ["override_luxury_restraint"] },
    dibacardi:           { weight: 0.08, influences: [],                                                                  must_not: [] },
    log_drum_innovation: { weight: 0.78, influences: ["low_end_authorship", "motif_identity", "drop_definition"],         must_not: ["generic_bass_replacement"] },
  },
  style_constraints: {
    max_piano_busyness:  0.38,
    min_pad_warmth:      0.62,
    max_perc_aggression: 0.55,
    preferred_keys:      ["F#m", "C#m", "Em"],
    forbidden_traits:    ["trap_hats", "edm_risers", "gospel_runs", "808_glide_replacing_log_drum", "four_on_floor_dominance", "bright_pop_piano"],
  },
  production_directives: {
    mix_priorities:       ["log_drum_front", "pad_warmth_bed", "piano_sparse_top"],
    arrangement_strategy: "subtractive elegance — space is an instrument",
    automation_hints:     ["filter_sweep_into_drop", "pad_swell_intro", "log_drum_fill_transition"],
    layering_rules:       ["log_drum_never_masked_by_bass", "piano_never_busier_than_groove"],
    master_target_lufs:   -10,
  },
  evaluation_targets: {
    authenticity_target:             0.88,
    subgenre_recognizability_target: 0.85,
    groove_clarity_target:           0.90,
    harmonic_density_target:         0.32,
    dj_mix_friendliness_target:      0.88,
    cultural_lineage_coherence:      0.85,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. BACARDI
// Raw energy. Log drum forward. Minimal harmonic richness. Street-born.
// Lineage invariant: bacardi >= 0.60, log_drum_innovation >= 0.45
// ─────────────────────────────────────────────────────────────────────────────
export const bacardiPreset: CTLv1 = createCTL({
  global: {
    title: "Bacardi Bounce Prototype",
    bpm: 118,
    key: "Gm",
    subgenre: "bacardi",
    mix_profile: "raw_street",
    vocal_profile: "percussive_only",
    emotional_profile: "street energy, raw momentum, unpolished power",
    reference_style_tags: ["Vigro Deep", "Focalistic", "Nkosazana Daughter"],
    created_by: "okovanggo_ai",
  },
  sections: [
    { id: "ba_intro",     type: "intro",     label: "Intro",     start_bar: 0,  end_bar: 4,  purpose: "Immediate log drum entry — no delay",         energy_target: 0.55, log_drum_active: true,  pad_active: false, piano_active: false, vocal_active: false, transition_out: "cut" },
    { id: "ba_drop",      type: "drop",      label: "Drop",      start_bar: 4,  end_bar: 20, purpose: "Full Bacardi bounce — all elements locked",   energy_target: 0.88, log_drum_active: true,  pad_active: true,  piano_active: false, vocal_active: true,  transition_out: "log_drum_fill" },
    { id: "ba_dj_loop",   type: "dj_loop",   label: "DJ Loop",   start_bar: 20, end_bar: 28, purpose: "Loop-ready 8 bars for DJ manipulation",       energy_target: 0.82, log_drum_active: true,  pad_active: true,  piano_active: false, vocal_active: false, transition_out: "cut" },
    { id: "ba_outro",     type: "outro",     label: "Outro",     start_bar: 28, end_bar: 36, purpose: "Log drum fades last — groove dissolves slow",  energy_target: 0.50, log_drum_active: true,  pad_active: false, piano_active: false, vocal_active: false, transition_out: "fade" },
  ],
  curves: {
    energy:            [{ bar: 0, value: 0.55 }, { bar: 4, value: 0.88 }, { bar: 28, value: 0.50 }, { bar: 36, value: 0.20 }],
    log_drum_density:  [{ bar: 0, value: 0.72 }, { bar: 4, value: 0.90 }, { bar: 28, value: 0.65 }],
    bass_presence:     [{ bar: 0, value: 0.70 }, { bar: 4, value: 0.85 }],
    pad_warmth:        [{ bar: 0, value: 0.35 }, { bar: 4, value: 0.50 }, { bar: 36, value: 0.30 }],
    piano_activity:    [{ bar: 0, value: 0.00 }, { bar: 36, value: 0.00 }],
    vocal_presence:    [{ bar: 0, value: 0.00 }, { bar: 6, value: 0.60 }],
    groove_aggression: [{ bar: 0, value: 0.70 }, { bar: 4, value: 0.88 }],
    restraint:         [{ bar: 0, value: 0.25 }, { bar: 36, value: 0.20 }],
    tension:           [{ bar: 0, value: 0.60 }, { bar: 16, value: 0.85 }, { bar: 36, value: 0.30 }],
  },
  groove_patterns: [{
    id: "ba_groove_01",
    label: "Bacardi Raw — dense ghost hits, relentless forward motion",
    steps: ["K", "g", "x", "-", "L", "g", "x", "g", "K", "-", "x", "g", "L", "g", "-", "g"],
    microtiming: [0, 8, -3, 0, 0, 5, -3, 10, 0, 0, -5, 8, 0, 5, 0, 10],
    velocity:    [115, 45, 70, 0, 105, 50, 65, 45, 110, 0, 65, 40, 100, 48, 0, 42],
    swing: 0.48,
  }],
  harmony: {
    tonal_center: "G",
    mode: "aeolian",
    preferred_progressions: ["i-VII", "i-iv"],
    exemplar_progressions: ["Gm7-F7", "Gm-Cm7"],
    max_chord_changes_per_4_bars: 2,
    extension_policy: "sevenths_only",
    voicing_style: "sparse",
    harmonic_rhythm: "slow",
  },
  instrumentation: [
    { family: "log_drum", patch_class: "bacardi_raw_log",           timbre_class: "punchy_raw_percussive",   cultural_role: "groove_anchor",   register: "low_mid",  stereo_profile: "mono_centered", body_weight: 0.88, attack: "instant", decay: "short",  forbidden_traits: ["soft_log", "pitched_melody_log", "gentle_decay"] },
    { family: "pads",     patch_class: "street_dark_pad",           timbre_class: "gritty_synth_bed",        cultural_role: "atmosphere_bed",  register: "mid",      stereo_profile: "mid_wide",      body_weight: 0.45, attack: "medium",  decay: "medium", forbidden_traits: ["luxury_pad", "warm_sine", "bright_pad"] },
    { family: "bass",     patch_class: "log_bass_raw_sub",          timbre_class: "sub_forward_bass",        cultural_role: "low_end_anchor",  register: "low",      stereo_profile: "mono_centered", body_weight: 0.80, attack: "instant", decay: "short",  forbidden_traits: ["808_glide", "trap_bass", "melodic_bass_run"] },
  ],
  cultural_lineage: {
    deep_house:          { weight: 0.35, influences: ["structural_patience"],                                             must_not: ["replace_raw_energy", "four_on_floor_dominance"] },
    kwaito:              { weight: 0.42, influences: ["groove_attitude", "repetition_logic", "street_energy"],           must_not: [] },
    jazz:                { weight: 0.18, influences: [],                                                                  must_not: ["add_harmonic_complexity"] },
    lounge:              { weight: 0.12, influences: [],                                                                  must_not: ["soften_rawness"] },
    bacardi:             { weight: 0.72, influences: ["log_drum_aggression", "minimal_harmony", "raw_bounce"],           must_not: ["luxury_restraint"] },
    dibacardi:           { weight: 0.58, influences: ["percussive_complexity", "syncopation_density"],                   must_not: [] },
    log_drum_innovation: { weight: 0.65, influences: ["forward_momentum", "density_variation", "ghost_note_identity"],  must_not: ["over_polish"] },
  },
  style_constraints: {
    max_piano_busyness:  0.15,
    min_pad_warmth:      0.30,
    max_perc_aggression: 0.90,
    preferred_keys:      ["Gm", "Am", "Dm", "Em"],
    forbidden_traits:    ["luxury_chord_richness", "jazz_extensions", "virtuosic_piano", "soft_log_drum", "gospel_runs"],
  },
  production_directives: {
    mix_priorities:       ["log_drum_dominant", "bass_sub_forward", "pads_supporting_only"],
    arrangement_strategy: "additive energy — every 4 bars adds weight",
    automation_hints:     ["log_drum_density_ramp", "filter_open_on_drop"],
    layering_rules:       ["log_drum_always_loudest", "no_melody_competing_with_groove"],
    master_target_lufs:   -8,
  },
  evaluation_targets: {
    authenticity_target:             0.82,
    subgenre_recognizability_target: 0.88,
    groove_clarity_target:           0.92,
    harmonic_density_target:         0.18,
    dj_mix_friendliness_target:      0.90,
    cultural_lineage_coherence:      0.82,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. SGIJA
// Kwaito-forward. Street bounce. More harmonic than Bacardi.
// Lineage invariant: kwaito >= 0.40, bacardi >= 0.30
// ─────────────────────────────────────────────────────────────────────────────
export const sgijaPreset: CTLv1 = createCTL({
  global: {
    title: "Sgija Street Prototype",
    bpm: 115,
    key: "Em",
    subgenre: "sgija",
    mix_profile: "bounce_club",
    vocal_profile: "medium_melodic",
    emotional_profile: "street confidence, kinetic bounce, communal energy",
    reference_style_tags: ["MFR Souls", "Da Muziqal Chef", "Yumbs"],
    created_by: "okovanggo_ai",
  },
  sections: [
    { id: "sg_intro",     type: "intro",     label: "Intro",     start_bar: 0,  end_bar: 6,  purpose: "Bass and log drum intro — crowd priming",        energy_target: 0.45, log_drum_active: true,  pad_active: false, piano_active: false, vocal_active: false, transition_out: "log_drum_fill" },
    { id: "sg_verse",     type: "verse",     label: "Verse",     start_bar: 6,  end_bar: 14, purpose: "Vocal enters over groove",                        energy_target: 0.70, log_drum_active: true,  pad_active: true,  piano_active: false, vocal_active: true,  transition_out: "cut" },
    { id: "sg_drop",      type: "drop",      label: "Drop",      start_bar: 14, end_bar: 28, purpose: "Full bounce — peak energy",                       energy_target: 0.88, log_drum_active: true,  pad_active: true,  piano_active: true,  vocal_active: true,  transition_out: "filter_sweep" },
    { id: "sg_outro",     type: "outro",     label: "Outro",     start_bar: 28, end_bar: 36, purpose: "Groove out — log drum fades",                     energy_target: 0.40, log_drum_active: true,  pad_active: true,  piano_active: false, vocal_active: false, transition_out: "fade" },
  ],
  curves: {
    energy:            [{ bar: 0, value: 0.45 }, { bar: 14, value: 0.88 }, { bar: 28, value: 0.40 }],
    log_drum_density:  [{ bar: 0, value: 0.60 }, { bar: 14, value: 0.82 }],
    bass_presence:     [{ bar: 0, value: 0.65 }, { bar: 14, value: 0.80 }],
    pad_warmth:        [{ bar: 0, value: 0.40 }, { bar: 6,  value: 0.60 }, { bar: 36, value: 0.45 }],
    piano_activity:    [{ bar: 0, value: 0.00 }, { bar: 14, value: 0.45 }],
    vocal_presence:    [{ bar: 0, value: 0.00 }, { bar: 6,  value: 0.65 }],
    groove_aggression: [{ bar: 0, value: 0.55 }, { bar: 14, value: 0.80 }],
    restraint:         [{ bar: 0, value: 0.45 }, { bar: 36, value: 0.35 }],
    tension:           [{ bar: 0, value: 0.40 }, { bar: 20, value: 0.75 }, { bar: 36, value: 0.25 }],
  },
  groove_patterns: [{
    id: "sg_groove_01",
    label: "Sgija Bounce — high-hat weave with ghost log hits",
    steps: ["K", "x", "-", "g", "L", "x", "g", "-", "K", "x", "-", "g", "L", "x", "g", "-"],
    microtiming: [0, -3, 0, 8, 0, -3, 8, 0, 0, -3, 0, 8, 0, -3, 8, 0],
    velocity:    [112, 60, 0, 40, 98, 58, 45, 0, 108, 58, 0, 38, 95, 55, 42, 0],
    swing: 0.52,
  }],
  harmony: {
    tonal_center: "E",
    mode: "aeolian",
    preferred_progressions: ["i-VI-VII", "i-iv-VII"],
    exemplar_progressions: ["Em7-Cmaj7-D7", "Em9-Am9-D9"],
    max_chord_changes_per_4_bars: 4,
    extension_policy: "sevenths_only",
    voicing_style: "medium",
    harmonic_rhythm: "medium",
  },
  instrumentation: [
    { family: "log_drum", patch_class: "sgija_bounce_log",          timbre_class: "mid_weight_percussive",   cultural_role: "groove_anchor",   register: "low_mid",  stereo_profile: "mono_centered", body_weight: 0.80, attack: "instant", decay: "short",  forbidden_traits: ["soft_log", "luxury_log"] },
    { family: "pads",     patch_class: "club_warm_pad",             timbre_class: "warm_synth_bed",          cultural_role: "atmosphere_bed",  register: "mid",      stereo_profile: "wide",          body_weight: 0.55, attack: "medium",  decay: "medium", forbidden_traits: ["luxury_pad", "clinical_pad"] },
    { family: "piano",    patch_class: "stab_keys_sgija",           timbre_class: "percussive_stab_keys",    cultural_role: "melodic_ornament",register: "mid",      stereo_profile: "mid_wide",      body_weight: 0.50, attack: "instant", decay: "short",  forbidden_traits: ["gospel_runs", "jazz_comping"] },
    { family: "bass",     patch_class: "walking_sub_bass",          timbre_class: "sub_groove_bass",         cultural_role: "low_end_anchor",  register: "low",      stereo_profile: "mono_centered", body_weight: 0.70, attack: "fast",    decay: "medium", forbidden_traits: ["trap_bass", "melodic_run"] },
  ],
  cultural_lineage: {
    deep_house:          { weight: 0.42, influences: ["harmonic_structure"],                                              must_not: ["replace_kwaito_attitude"] },
    kwaito:              { weight: 0.62, influences: ["groove_attitude", "repetition_logic", "bounce_identity"],         must_not: [] },
    jazz:                { weight: 0.25, influences: ["chord_color"],                                                     must_not: ["add_complexity"] },
    lounge:              { weight: 0.20, influences: [],                                                                  must_not: ["reduce_street_energy"] },
    bacardi:             { weight: 0.45, influences: ["percussive_motion", "log_drum_energy"],                           must_not: [] },
    dibacardi:           { weight: 0.38, influences: ["syncopated_hits"],                                                 must_not: [] },
    log_drum_innovation: { weight: 0.68, influences: ["groove_identity", "density_play"],                                must_not: ["generic_bass_replacement"] },
  },
  style_constraints: {
    max_piano_busyness:  0.55,
    min_pad_warmth:      0.40,
    max_perc_aggression: 0.80,
    preferred_keys:      ["Em", "Am", "Dm", "Gm"],
    forbidden_traits:    ["luxury_restraint", "jazz_complexity", "soft_log_drum", "gospel_runs"],
  },
  production_directives: {
    mix_priorities:       ["log_drum_dominant", "bass_groove", "pad_supporting"],
    arrangement_strategy: "energy builds every 8 bars — crowd response architecture",
    automation_hints:     ["hi_hat_density_build", "log_fill_every_8"],
    layering_rules:       ["log_drum_always_present", "stabs_support_not_lead"],
    master_target_lufs:   -9,
  },
  evaluation_targets: {
    authenticity_target:             0.84,
    subgenre_recognizability_target: 0.86,
    groove_clarity_target:           0.88,
    harmonic_density_target:         0.28,
    dj_mix_friendliness_target:      0.88,
    cultural_lineage_coherence:      0.82,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. STIXX SGIJA
// High-aggression Sgija variant. Dense ghost notes. Relentless.
// Lineage invariant: bacardi >= 0.40, kwaito >= 0.35
// ─────────────────────────────────────────────────────────────────────────────
export const stixxSgijaPreset: CTLv1 = createCTL({
  global: {
    title: "Stixx Sgija Prototype",
    bpm: 118,
    key: "Am",
    subgenre: "stixx_sgija",
    mix_profile: "bounce_club",
    vocal_profile: "percussive_only",
    emotional_profile: "hard bounce, aggressive groove, peak hour energy",
    reference_style_tags: ["Leak SA", "Mellow & Sleazy", "Boohle"],
    created_by: "okovanggo_ai",
  },
  sections: [
    { id: "sx_intro",   type: "intro",   label: "Intro",   start_bar: 0,  end_bar: 4,  purpose: "Log drum immediate — no warmup",                     energy_target: 0.65, log_drum_active: true,  pad_active: false, piano_active: false, vocal_active: false, transition_out: "cut" },
    { id: "sx_drop",    type: "drop",    label: "Drop",    start_bar: 4,  end_bar: 20, purpose: "Stixx bounce at full velocity — dense ghost grid",   energy_target: 0.92, log_drum_active: true,  pad_active: true,  piano_active: false, vocal_active: true,  transition_out: "log_drum_fill" },
    { id: "sx_dj_loop", type: "dj_loop", label: "DJ Loop", start_bar: 20, end_bar: 28, purpose: "8-bar loop for extended DJ play",                    energy_target: 0.88, log_drum_active: true,  pad_active: true,  piano_active: false, vocal_active: false, transition_out: "cut" },
    { id: "sx_outro",   type: "outro",   label: "Outro",   start_bar: 28, end_bar: 34, purpose: "Short exit — energy sustained until cut",            energy_target: 0.70, log_drum_active: true,  pad_active: false, piano_active: false, vocal_active: false, transition_out: "cut" },
  ],
  curves: {
    energy:            [{ bar: 0, value: 0.65 }, { bar: 4, value: 0.92 }, { bar: 28, value: 0.70 }],
    log_drum_density:  [{ bar: 0, value: 0.80 }, { bar: 4, value: 0.95 }],
    bass_presence:     [{ bar: 0, value: 0.75 }, { bar: 4, value: 0.90 }],
    pad_warmth:        [{ bar: 0, value: 0.28 }, { bar: 4, value: 0.42 }, { bar: 34, value: 0.25 }],
    piano_activity:    [{ bar: 0, value: 0.00 }, { bar: 34, value: 0.00 }],
    vocal_presence:    [{ bar: 0, value: 0.00 }, { bar: 4, value: 0.50 }],
    groove_aggression: [{ bar: 0, value: 0.75 }, { bar: 4, value: 0.95 }],
    restraint:         [{ bar: 0, value: 0.18 }, { bar: 34, value: 0.15 }],
    tension:           [{ bar: 0, value: 0.70 }, { bar: 16, value: 0.90 }, { bar: 34, value: 0.50 }],
  },
  groove_patterns: [{
    id: "sx_groove_01",
    label: "Stixx Sgija — ghost-dense, relentless velocity",
    steps: ["K", "g", "x", "g", "L", "g", "x", "g", "K", "g", "x", "g", "L", "g", "x", "g"],
    microtiming: [0, 5, -5, 8, 0, 5, -5, 10, 0, 5, -5, 8, 0, 5, -5, 10],
    velocity:    [118, 48, 72, 42, 108, 52, 68, 45, 115, 48, 70, 40, 105, 50, 65, 42],
    swing: 0.50,
  }],
  harmony: {
    tonal_center: "A",
    mode: "aeolian",
    preferred_progressions: ["i-VII", "i-iv-VII"],
    exemplar_progressions: ["Am7-G7", "Am7-Dm7-G7"],
    max_chord_changes_per_4_bars: 2,
    extension_policy: "sevenths_only",
    voicing_style: "sparse",
    harmonic_rhythm: "slow",
  },
  instrumentation: [
    { family: "log_drum", patch_class: "stixx_hard_log",      timbre_class: "hard_punchy_percussive", cultural_role: "groove_anchor",  register: "low_mid",  stereo_profile: "mono_centered", body_weight: 0.92, attack: "instant", decay: "short",  forbidden_traits: ["soft_log", "pitched_log", "luxury_log"] },
    { family: "pads",     patch_class: "dark_synth_pad",      timbre_class: "dark_gritty_bed",       cultural_role: "atmosphere_bed", register: "mid",      stereo_profile: "mid_wide",      body_weight: 0.38, attack: "fast",    decay: "medium", forbidden_traits: ["warm_pad", "luxury_pad"] },
    { family: "bass",     patch_class: "aggro_sub_bass",      timbre_class: "hard_sub_bass",         cultural_role: "low_end_anchor", register: "low",      stereo_profile: "mono_centered", body_weight: 0.85, attack: "instant", decay: "short",  forbidden_traits: ["melodic_bass", "808_glide"] },
  ],
  cultural_lineage: {
    deep_house:          { weight: 0.35, influences: [],                                                                  must_not: ["soften_the_hit"] },
    kwaito:              { weight: 0.55, influences: ["repetition_logic", "street_aggression"],                          must_not: [] },
    jazz:                { weight: 0.15, influences: [],                                                                  must_not: ["add_harmony"] },
    lounge:              { weight: 0.10, influences: [],                                                                  must_not: ["reduce_aggression"] },
    bacardi:             { weight: 0.65, influences: ["log_drum_density", "ghost_note_grid", "raw_bounce"],              must_not: [] },
    dibacardi:           { weight: 0.55, influences: ["syncopated_aggression"],                                          must_not: [] },
    log_drum_innovation: { weight: 0.72, influences: ["ghost_motif_density", "velocity_shaping"],                        must_not: ["over_polish"] },
  },
  style_constraints: {
    max_piano_busyness:  0.10,
    min_pad_warmth:      0.25,
    max_perc_aggression: 0.95,
    preferred_keys:      ["Am", "Em", "Dm"],
    forbidden_traits:    ["warm_pad", "piano_melody", "jazz_voicing", "gospel_runs", "luxury_log"],
  },
  production_directives: {
    mix_priorities:       ["log_drum_dominant", "sub_bass_forward", "everything_else_supporting"],
    arrangement_strategy: "maximalist groove — density is the statement",
    automation_hints:     ["log_ghost_density_ramp", "filter_open_instant"],
    layering_rules:       ["ghost_notes_audible_in_mix", "log_never_masked"],
    master_target_lufs:   -8,
  },
  evaluation_targets: {
    authenticity_target:             0.80,
    subgenre_recognizability_target: 0.90,
    groove_clarity_target:           0.88,
    harmonic_density_target:         0.15,
    dj_mix_friendliness_target:      0.92,
    cultural_lineage_coherence:      0.80,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. MBIRAIANO
// Zimbabwe mbira cultural fusion. Cyclical, spiritual, pentatonic-adjacent.
// Lineage invariant: mbira.weight >= 0.70
// ─────────────────────────────────────────────────────────────────────────────
export const mbiraianoPreset: CTLv1 = createCTL({
  global: {
    title: "Mbiraiano Prototype",
    bpm: 109,
    key: "Dm",
    subgenre: "mbiraiano",
    mix_profile: "spiritual_organic",
    vocal_profile: "medium_melodic",
    emotional_profile: "ancestral resonance, cyclical meditation, cultural bridge",
    reference_style_tags: ["Shasha", "Msaki", "Thandiswa Mazwai"],
    created_by: "okovanggo_ai",
  },
  sections: [
    { id: "mb_intro",     type: "intro",     label: "Intro",     start_bar: 0,  end_bar: 8,  purpose: "Mbira motif establishes cyclical theme",      energy_target: 0.30, log_drum_active: false, pad_active: true,  piano_active: false, vocal_active: false, transition_out: "log_drum_fill" },
    { id: "mb_verse",     type: "verse",     label: "Verse",     start_bar: 8,  end_bar: 16, purpose: "Log drum enters under mbira — grounding",    energy_target: 0.55, log_drum_active: true,  pad_active: true,  piano_active: false, vocal_active: true,  transition_out: "cut" },
    { id: "mb_drop",      type: "drop",      label: "Drop",      start_bar: 16, end_bar: 28, purpose: "Full spiritual expression — mbira + groove", energy_target: 0.72, log_drum_active: true,  pad_active: true,  piano_active: false, vocal_active: true,  transition_out: "echo_out" },
    { id: "mb_outro",     type: "outro",     label: "Outro",     start_bar: 28, end_bar: 36, purpose: "Cyclical fade — mbira outlasts everything",   energy_target: 0.32, log_drum_active: false, pad_active: true,  piano_active: false, vocal_active: false, transition_out: "fade" },
  ],
  curves: {
    energy:            [{ bar: 0, value: 0.30 }, { bar: 16, value: 0.72 }, { bar: 28, value: 0.32 }],
    log_drum_density:  [{ bar: 0, value: 0.00 }, { bar: 8,  value: 0.55 }, { bar: 28, value: 0.00 }],
    bass_presence:     [{ bar: 0, value: 0.35 }, { bar: 16, value: 0.60 }],
    pad_warmth:        [{ bar: 0, value: 0.78 }, { bar: 36, value: 0.72 }],
    piano_activity:    [{ bar: 0, value: 0.00 }, { bar: 36, value: 0.00 }],
    vocal_presence:    [{ bar: 0, value: 0.00 }, { bar: 8,  value: 0.60 }],
    groove_aggression: [{ bar: 0, value: 0.20 }, { bar: 16, value: 0.55 }],
    restraint:         [{ bar: 0, value: 0.80 }, { bar: 36, value: 0.82 }],
    tension:           [{ bar: 0, value: 0.20 }, { bar: 20, value: 0.58 }, { bar: 36, value: 0.22 }],
  },
  groove_patterns: [{
    id: "mb_groove_01",
    label: "Mbiraiano — cyclical, melodic log hits mirroring mbira motif",
    steps: ["K", "-", "x", "L", "-", "x", "g", "-", "K", "-", "x", "L", "-", "x", "-", "g"],
    microtiming: [0, 0, -3, 3, 0, -3, 5, 0, 0, 0, -3, 3, 0, -3, 0, 8],
    velocity:    [108, 0, 55, 80, 0, 52, 40, 0, 105, 0, 55, 78, 0, 50, 0, 38],
    swing: 0.55,
  }],
  harmony: {
    tonal_center: "D",
    mode: "dorian",
    preferred_progressions: ["i-IV", "i-VII-IV"],
    exemplar_progressions: ["Dm7-G7", "Dm7-C7-G7"],
    max_chord_changes_per_4_bars: 2,
    extension_policy: "sevenths_only",
    voicing_style: "sparse",
    harmonic_rhythm: "static",
  },
  instrumentation: [
    { family: "mbira",    patch_class: "shona_mbira_electric",   timbre_class: "metallic_tine_pluck",   cultural_role: "cultural_identity_lead", register: "mid",      stereo_profile: "wide",          body_weight: 0.75, attack: "instant", decay: "medium", forbidden_traits: ["kalimba_substitute", "generic_pluck", "eurodance_melody"] },
    { family: "log_drum", patch_class: "mbiraiano_melodic_log",  timbre_class: "woody_pitched_percussive", cultural_role: "groove_anchor",       register: "low_mid",  stereo_profile: "mono_centered", body_weight: 0.62, attack: "instant", decay: "short",  forbidden_traits: ["trap_bass_808", "aggressive_log"] },
    { family: "pads",     patch_class: "organic_warm_pad",       timbre_class: "spiritual_sine_bed",    cultural_role: "atmosphere_bed",         register: "mid_high", stereo_profile: "wide",          body_weight: 0.70, attack: "slow",    decay: "long",   forbidden_traits: ["synthetic_pad", "sharp_attack"] },
    { family: "vocals",   patch_class: "southern_african_vocal", timbre_class: "organic_melodic_vocal", cultural_role: "cultural_voice",         register: "mid_high", stereo_profile: "mid_wide",      body_weight: 0.60, attack: "medium",  decay: "medium", forbidden_traits: ["autotuned_pop", "trap_vocal"] },
  ],
  cultural_lineage: {
    deep_house:          { weight: 0.30, influences: ["structural_patience"],                                             must_not: ["override_mbira_identity"] },
    kwaito:              { weight: 0.35, influences: ["groove_foundation"],                                               must_not: [] },
    jazz:                { weight: 0.32, influences: ["harmonic_color", "dorian_warmth"],                                 must_not: ["bebop_complexity"] },
    lounge:              { weight: 0.28, influences: ["organic_warmth"],                                                  must_not: [] },
    bacardi:             { weight: 0.15, influences: [],                                                                  must_not: ["override_spiritual_tone"] },
    dibacardi:           { weight: 0.10, influences: [],                                                                  must_not: [] },
    log_drum_innovation: { weight: 0.55, influences: ["melodic_percussion"],                                              must_not: ["generic_bass_replacement"] },
    mbira:               { weight: 0.85, influences: ["shona_tine_motif", "cyclical_repetition", "ancestral_resonance"], must_not: ["generic_pluck_for_mbira", "kalimba_substitute"] },
  },
  style_constraints: {
    max_piano_busyness:  0.20,
    min_pad_warmth:      0.65,
    max_perc_aggression: 0.50,
    preferred_keys:      ["Dm", "Gm", "Am", "Em"],
    forbidden_traits:    ["generic_pluck_for_mbira", "kalimba_substitute", "eurodance_melody", "trap_hats", "gospel_runs"],
  },
  production_directives: {
    mix_priorities:       ["mbira_identity_forward", "pad_warmth_bed", "log_drum_grounding"],
    arrangement_strategy: "cyclical patience — motifs repeat and evolve slowly",
    automation_hints:     ["mbira_wide_pan_slow_mod", "pad_reverb_tail_long"],
    layering_rules:       ["mbira_never_masked", "log_drum_supports_mbira"],
    master_target_lufs:   -11,
  },
  evaluation_targets: {
    authenticity_target:             0.90,
    subgenre_recognizability_target: 0.88,
    groove_clarity_target:           0.82,
    harmonic_density_target:         0.25,
    dj_mix_friendliness_target:      0.75,
    cultural_lineage_coherence:      0.90,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. 3-STEP
// Three-step log drum pattern is the identity. Shuffle groove. Log-heavy.
// Lineage invariant: log_drum_innovation >= 0.65
// ─────────────────────────────────────────────────────────────────────────────
export const threeStepPreset: CTLv1 = createCTL({
  global: {
    title: "3-Step Prototype",
    bpm: 113,
    key: "C#m",
    subgenre: "three_step",
    mix_profile: "bounce_club",
    vocal_profile: "sparse_chant",
    emotional_profile: "hypnotic shuffle, rhythmic obsession, step-locked trance",
    reference_style_tags: ["Tyler ICU", "Scorpion Kings", "Sol Generation"],
    created_by: "okovanggo_ai",
  },
  sections: [
    { id: "ts_intro",     type: "intro",     label: "Intro",     start_bar: 0,  end_bar: 6,  purpose: "3-step pattern introduced bare — groove only",  energy_target: 0.40, log_drum_active: true,  pad_active: false, piano_active: false, vocal_active: false, transition_out: "log_drum_fill" },
    { id: "ts_drop",      type: "drop",      label: "Drop",      start_bar: 6,  end_bar: 22, purpose: "Full 3-step expression — hypnotic lock-in",    energy_target: 0.82, log_drum_active: true,  pad_active: true,  piano_active: true,  vocal_active: true,  transition_out: "filter_sweep" },
    { id: "ts_breakdown", type: "breakdown", label: "Breakdown", start_bar: 22, end_bar: 28, purpose: "Pattern stripped to bare log hits",             energy_target: 0.50, log_drum_active: true,  pad_active: false, piano_active: false, vocal_active: false, transition_out: "log_drum_fill" },
    { id: "ts_outro",     type: "outro",     label: "Outro",     start_bar: 28, end_bar: 36, purpose: "Pattern fades with pad sustain",                energy_target: 0.30, log_drum_active: true,  pad_active: true,  piano_active: false, vocal_active: false, transition_out: "fade" },
  ],
  curves: {
    energy:            [{ bar: 0, value: 0.40 }, { bar: 6, value: 0.82 }, { bar: 22, value: 0.50 }, { bar: 36, value: 0.28 }],
    log_drum_density:  [{ bar: 0, value: 0.65 }, { bar: 6, value: 0.82 }, { bar: 22, value: 0.50 }],
    bass_presence:     [{ bar: 0, value: 0.55 }, { bar: 6, value: 0.75 }],
    pad_warmth:        [{ bar: 0, value: 0.50 }, { bar: 6, value: 0.68 }, { bar: 36, value: 0.55 }],
    piano_activity:    [{ bar: 0, value: 0.00 }, { bar: 6, value: 0.38 }],
    vocal_presence:    [{ bar: 0, value: 0.00 }, { bar: 8, value: 0.45 }],
    groove_aggression: [{ bar: 0, value: 0.50 }, { bar: 6, value: 0.75 }],
    restraint:         [{ bar: 0, value: 0.60 }, { bar: 36, value: 0.55 }],
    tension:           [{ bar: 0, value: 0.35 }, { bar: 16, value: 0.72 }, { bar: 36, value: 0.20 }],
  },
  groove_patterns: [{
    id: "ts_groove_01",
    label: "3-Step — two log drum clusters per bar creating the three-step feel",
    steps: ["K", "-", "-", "L", "x", "-", "L", "-", "K", "-", "-", "L", "x", "-", "L", "g"],
    microtiming: [0, 0, 0, -3, -3, 0, 0, 8, 0, 0, 0, -3, -3, 0, 0, 8],
    velocity:    [112, 0, 0, 95, 60, 0, 90, 40, 108, 0, 0, 92, 58, 0, 88, 38],
    swing: 0.54,
  }],
  harmony: {
    tonal_center: "C#",
    mode: "aeolian",
    preferred_progressions: ["i-VI-VII", "i-iv-VI"],
    exemplar_progressions: ["C#m7-Amaj7-B7", "C#m9-F#m9-Amaj9"],
    max_chord_changes_per_4_bars: 4,
    extension_policy: "full_extensions",
    voicing_style: "sparse",
    harmonic_rhythm: "slow",
  },
  instrumentation: [
    { family: "log_drum", patch_class: "three_step_pattern_log",   timbre_class: "mid_forward_percussive", cultural_role: "groove_anchor_primary", register: "low_mid",  stereo_profile: "mono_centered", body_weight: 0.85, attack: "instant", decay: "short",  forbidden_traits: ["soft_log", "luxury_log"] },
    { family: "pads",     patch_class: "warm_resonant_pad",        timbre_class: "warm_analog_bed",       cultural_role: "atmosphere_bed",       register: "mid_high", stereo_profile: "wide",          body_weight: 0.60, attack: "slow",    decay: "long",   forbidden_traits: ["edm_swell", "sharp_attack"] },
    { family: "piano",    patch_class: "minimal_stab_piano",       timbre_class: "percussive_stab_keys",  cultural_role: "melodic_ornament",     register: "mid",      stereo_profile: "mid_wide",      body_weight: 0.42, attack: "instant", decay: "short",  forbidden_traits: ["gospel_runs", "busy_comping"] },
  ],
  cultural_lineage: {
    deep_house:          { weight: 0.55, influences: ["harmonic_patience", "groove_lock"],                                must_not: ["replace_log_pattern_identity"] },
    kwaito:              { weight: 0.45, influences: ["repetition_logic", "groove_attitude"],                            must_not: [] },
    jazz:                { weight: 0.38, influences: ["chord_extensions"],                                                must_not: ["add_complexity"] },
    lounge:              { weight: 0.32, influences: ["sophistication"],                                                  must_not: [] },
    bacardi:             { weight: 0.28, influences: ["percussive_energy"],                                               must_not: [] },
    dibacardi:           { weight: 0.22, influences: [],                                                                  must_not: [] },
    log_drum_innovation: { weight: 0.78, influences: ["three_step_pattern_identity", "motif_hypnosis", "density_play"],  must_not: ["generic_bass_replacement"] },
  },
  style_constraints: {
    max_piano_busyness:  0.42,
    min_pad_warmth:      0.55,
    max_perc_aggression: 0.72,
    preferred_keys:      ["C#m", "F#m", "Bm"],
    forbidden_traits:    ["trap_hats", "edm_risers", "gospel_runs", "four_on_floor_dominance"],
  },
  production_directives: {
    mix_priorities:       ["log_drum_pattern_clarity", "pad_warmth_supporting", "piano_sparse"],
    arrangement_strategy: "pattern repetition as hypnosis — the 3-step IS the track",
    automation_hints:     ["log_velocity_subtle_vary", "pad_filter_slow_open"],
    layering_rules:       ["three_step_pattern_always_audible", "no_element_louder_than_log"],
    master_target_lufs:   -10,
  },
  evaluation_targets: {
    authenticity_target:             0.86,
    subgenre_recognizability_target: 0.90,
    groove_clarity_target:           0.92,
    harmonic_density_target:         0.30,
    dj_mix_friendliness_target:      0.86,
    cultural_lineage_coherence:      0.82,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. GQOM FUSION
// Gqom lineage dominant. Dark, tribal, minimal harmony. Sub-heavy.
// Lineage invariant: gqom.weight >= 0.65
// ─────────────────────────────────────────────────────────────────────────────
export const gqomFusionPreset: CTLv1 = createCTL({
  global: {
    title: "Gqom Fusion Prototype",
    bpm: 122,
    key: "Bm",
    subgenre: "gqom_fusion",
    mix_profile: "dark_tribal",
    vocal_profile: "percussive_only",
    emotional_profile: "dark tribal energy, percussive dominance, Durban night",
    reference_style_tags: ["Distruction Boyz", "DJ Lag", "Bongane Sax"],
    created_by: "okovanggo_ai",
  },
  sections: [
    { id: "gq_intro",   type: "intro",   label: "Intro",   start_bar: 0,  end_bar: 4,  purpose: "Kick + log drum grid — no melody",                    energy_target: 0.55, log_drum_active: true,  pad_active: false, piano_active: false, vocal_active: false, transition_out: "cut" },
    { id: "gq_drop",    type: "drop",    label: "Drop",    start_bar: 4,  end_bar: 20, purpose: "Gqom fusion at full tribal expression",              energy_target: 0.90, log_drum_active: true,  pad_active: true,  piano_active: false, vocal_active: true,  transition_out: "log_drum_fill" },
    { id: "gq_dj_loop", type: "dj_loop", label: "DJ Loop", start_bar: 20, end_bar: 28, purpose: "8-bar tribal loop for DJ mixing",                     energy_target: 0.86, log_drum_active: true,  pad_active: false, piano_active: false, vocal_active: false, transition_out: "cut" },
    { id: "gq_outro",   type: "outro",   label: "Outro",   start_bar: 28, end_bar: 34, purpose: "Pattern degrades — kick persists last",               energy_target: 0.55, log_drum_active: true,  pad_active: false, piano_active: false, vocal_active: false, transition_out: "fade" },
  ],
  curves: {
    energy:            [{ bar: 0, value: 0.55 }, { bar: 4, value: 0.90 }, { bar: 28, value: 0.55 }],
    log_drum_density:  [{ bar: 0, value: 0.70 }, { bar: 4, value: 0.90 }],
    bass_presence:     [{ bar: 0, value: 0.80 }, { bar: 4, value: 0.92 }],
    pad_warmth:        [{ bar: 0, value: 0.20 }, { bar: 4, value: 0.35 }, { bar: 34, value: 0.18 }],
    piano_activity:    [{ bar: 0, value: 0.00 }, { bar: 34, value: 0.00 }],
    vocal_presence:    [{ bar: 0, value: 0.00 }, { bar: 6,  value: 0.48 }],
    groove_aggression: [{ bar: 0, value: 0.78 }, { bar: 4, value: 0.92 }],
    restraint:         [{ bar: 0, value: 0.18 }, { bar: 34, value: 0.15 }],
    tension:           [{ bar: 0, value: 0.72 }, { bar: 16, value: 0.90 }, { bar: 34, value: 0.55 }],
  },
  groove_patterns: [{
    id: "gq_groove_01",
    label: "Gqom Fusion — minimal, hard quantized tribal grid",
    steps: ["K", "-", "-", "-", "L", "-", "-", "g", "K", "-", "-", "-", "L", "-", "g", "-"],
    microtiming: [0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 8, 0],
    velocity:    [120, 0, 0, 0, 110, 0, 0, 50, 118, 0, 0, 0, 108, 0, 45, 0],
    swing: 0.45,
  }],
  harmony: {
    tonal_center: "B",
    mode: "aeolian",
    preferred_progressions: ["i", "i-VII"],
    exemplar_progressions: ["Bm7", "Bm7-A7"],
    max_chord_changes_per_4_bars: 1,
    extension_policy: "none",
    voicing_style: "sparse",
    harmonic_rhythm: "static",
  },
  instrumentation: [
    { family: "log_drum", patch_class: "gqom_hard_log",       timbre_class: "hard_tribal_percussive", cultural_role: "groove_anchor",  register: "low_mid",  stereo_profile: "mono_centered", body_weight: 0.90, attack: "instant", decay: "short",  forbidden_traits: ["soft_log", "luxury_log", "melodic_log"] },
    { family: "kick",     patch_class: "gqom_hard_kick",      timbre_class: "sub_kick_hard",          cultural_role: "tribal_pulse",   register: "low",      stereo_profile: "mono_centered", body_weight: 0.92, attack: "instant", decay: "short",  forbidden_traits: ["pop_kick", "trap_kick"] },
    { family: "pads",     patch_class: "dark_tribal_drone",   timbre_class: "sub_drone_dark",         cultural_role: "tension_bed",    register: "low_mid",  stereo_profile: "mono_centered", body_weight: 0.50, attack: "fast",    decay: "long",   forbidden_traits: ["warm_pad", "luxury_pad", "bright_pad"] },
  ],
  cultural_lineage: {
    deep_house:          { weight: 0.32, influences: [],                                                                  must_not: ["replace_tribal_energy"] },
    kwaito:              { weight: 0.42, influences: ["street_energy"],                                                   must_not: [] },
    jazz:                { weight: 0.12, influences: [],                                                                  must_not: ["add_harmony"] },
    lounge:              { weight: 0.08, influences: [],                                                                  must_not: [] },
    bacardi:             { weight: 0.30, influences: ["percussive_density"],                                              must_not: [] },
    dibacardi:           { weight: 0.28, influences: [],                                                                  must_not: [] },
    log_drum_innovation: { weight: 0.65, influences: ["tribal_motif_identity"],                                           must_not: ["over_polish"] },
    gqom:                { weight: 0.78, influences: ["durban_tribal_bass", "minimal_harmony", "hard_quantize_grid"],    must_not: ["luxury_restraint", "jazz_extensions"] },
  },
  style_constraints: {
    max_piano_busyness:  0.05,
    min_pad_warmth:      0.18,
    max_perc_aggression: 0.95,
    preferred_keys:      ["Bm", "Dm", "Am"],
    forbidden_traits:    ["warm_pad", "piano_melody", "jazz_voicing", "gospel_runs", "luxury_log", "soft_log"],
  },
  production_directives: {
    mix_priorities:       ["kick_sub_dominant", "log_drum_hard", "nothing_melodic"],
    arrangement_strategy: "tribal minimalism — subtraction is the move",
    automation_hints:     ["sub_bass_sidechain_tight", "reverb_off_on_percussives"],
    layering_rules:       ["kick_and_log_never_masked", "no_warm_elements"],
    master_target_lufs:   -7,
  },
  evaluation_targets: {
    authenticity_target:             0.78,
    subgenre_recognizability_target: 0.92,
    groove_clarity_target:           0.90,
    harmonic_density_target:         0.08,
    dj_mix_friendliness_target:      0.94,
    cultural_lineage_coherence:      0.84,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. HYBRID R&B AMAPIANO
// R&B crossover. Rhodes-led. Smoother groove. Jazz harmony forward.
// Lineage invariant: jazz >= 0.45, deep_house >= 0.40
// ─────────────────────────────────────────────────────────────────────────────
export const hybridRnbPreset: CTLv1 = createCTL({
  global: {
    title: "Hybrid R&B Prototype",
    bpm: 106,
    key: "Am",
    subgenre: "hybrid_rnb_amapiano",
    mix_profile: "crossover_rb",
    vocal_profile: "dense_call_response",
    emotional_profile: "sensual sophistication, R&B warmth meets amapiano groove",
    reference_style_tags: ["Sun-El Musician", "Miriam Makeba (spirit)", "Samthing Soweto"],
    created_by: "okovanggo_ai",
  },
  sections: [
    { id: "rb_intro",     type: "intro",     label: "Intro",     start_bar: 0,  end_bar: 8,  purpose: "Rhodes and vocals before groove enters",     energy_target: 0.28, log_drum_active: false, pad_active: true,  piano_active: true,  vocal_active: true,  transition_out: "log_drum_fill" },
    { id: "rb_verse",     type: "verse",     label: "Verse",     start_bar: 8,  end_bar: 16, purpose: "Log drum enters under R&B vocal structure",  energy_target: 0.60, log_drum_active: true,  pad_active: true,  piano_active: true,  vocal_active: true,  transition_out: "cut" },
    { id: "rb_chorus",    type: "chorus",    label: "Chorus",    start_bar: 16, end_bar: 28, purpose: "Full crossover expression — Rhodes leads",   energy_target: 0.78, log_drum_active: true,  pad_active: true,  piano_active: true,  vocal_active: true,  transition_out: "filter_sweep" },
    { id: "rb_outro",     type: "outro",     label: "Outro",     start_bar: 28, end_bar: 36, purpose: "Vocal ad-libs over fading groove",            energy_target: 0.35, log_drum_active: false, pad_active: true,  piano_active: true,  vocal_active: true,  transition_out: "fade" },
  ],
  curves: {
    energy:            [{ bar: 0, value: 0.28 }, { bar: 16, value: 0.78 }, { bar: 28, value: 0.35 }],
    log_drum_density:  [{ bar: 0, value: 0.00 }, { bar: 8, value: 0.55 }, { bar: 28, value: 0.00 }],
    bass_presence:     [{ bar: 0, value: 0.40 }, { bar: 16, value: 0.70 }],
    pad_warmth:        [{ bar: 0, value: 0.80 }, { bar: 36, value: 0.75 }],
    piano_activity:    [{ bar: 0, value: 0.55 }, { bar: 16, value: 0.70 }, { bar: 36, value: 0.50 }],
    vocal_presence:    [{ bar: 0, value: 0.60 }, { bar: 16, value: 0.85 }],
    groove_aggression: [{ bar: 0, value: 0.20 }, { bar: 16, value: 0.55 }],
    restraint:         [{ bar: 0, value: 0.75 }, { bar: 36, value: 0.70 }],
    tension:           [{ bar: 0, value: 0.15 }, { bar: 20, value: 0.55 }, { bar: 36, value: 0.20 }],
  },
  groove_patterns: [{
    id: "rb_groove_01",
    label: "Hybrid R&B — loose, vocal-supporting groove with high swing",
    steps: ["K", "-", "x", "-", "-", "x", "g", "-", "K", "-", "x", "-", "L", "-", "x", "g"],
    microtiming: [0, 0, -3, 0, 0, -5, 5, 0, 0, 0, -3, 0, 0, 0, -3, 8],
    velocity:    [105, 0, 58, 0, 0, 55, 42, 0, 102, 0, 55, 0, 92, 0, 50, 38],
    swing: 0.58,
  }],
  harmony: {
    tonal_center: "A",
    mode: "dorian",
    preferred_progressions: ["i-IV-VII", "i-VI-III-VII"],
    exemplar_progressions: ["Am9-Dmaj9-G9", "Am7-Fmaj7-Em7-Am7"],
    max_chord_changes_per_4_bars: 4,
    extension_policy: "full_extensions",
    voicing_style: "medium",
    harmonic_rhythm: "medium",
  },
  instrumentation: [
    { family: "rhodes",   patch_class: "rb_rhodes_warm_lead",   timbre_class: "bell_tone_keys",          cultural_role: "melodic_lead",    register: "mid",      stereo_profile: "mid_wide",      body_weight: 0.68, attack: "fast",    decay: "medium", forbidden_traits: ["digital_key", "harsh_treble"] },
    { family: "log_drum", patch_class: "rb_smooth_log",         timbre_class: "smooth_percussive",       cultural_role: "groove_anchor",   register: "low_mid",  stereo_profile: "mono_centered", body_weight: 0.60, attack: "instant", decay: "short",  forbidden_traits: ["aggressive_log", "trap_bass"] },
    { family: "pads",     patch_class: "rb_warm_analog_pad",    timbre_class: "warm_analog_bed",         cultural_role: "atmosphere_bed",  register: "mid_high", stereo_profile: "wide",          body_weight: 0.70, attack: "slow",    decay: "long",   forbidden_traits: ["dark_pad", "gritty_pad"] },
    { family: "bass",     patch_class: "rb_melodic_bass",       timbre_class: "warm_melodic_bass",       cultural_role: "low_end_anchor",  register: "low",      stereo_profile: "mono_centered", body_weight: 0.62, attack: "fast",    decay: "medium", forbidden_traits: ["trap_bass", "808_glide"] },
    { family: "vocals",   patch_class: "rb_lead_vocal",         timbre_class: "smooth_rb_vocal",         cultural_role: "lead_expression", register: "mid_high", stereo_profile: "mid_wide",      body_weight: 0.75, attack: "medium",  decay: "medium", forbidden_traits: ["autotuned_trap", "percussive_only"] },
  ],
  cultural_lineage: {
    deep_house:          { weight: 0.55, influences: ["harmonic_pacing", "groove_patience"],                              must_not: ["replace_rb_warmth"] },
    kwaito:              { weight: 0.20, influences: ["groove_foundation"],                                               must_not: [] },
    jazz:                { weight: 0.62, influences: ["chord_extensions", "rhodes_identity", "harmonic_richness"],       must_not: ["bebop_complexity", "virtuosic_runs"] },
    lounge:              { weight: 0.52, influences: ["sophistication", "vocal_space"],                                   must_not: [] },
    bacardi:             { weight: 0.10, influences: [],                                                                  must_not: ["raw_energy"] },
    dibacardi:           { weight: 0.08, influences: [],                                                                  must_not: [] },
    log_drum_innovation: { weight: 0.55, influences: ["groove_identity_supporting"],                                      must_not: ["compete_with_rhodes"] },
  },
  style_constraints: {
    max_piano_busyness:  0.65,
    min_pad_warmth:      0.68,
    max_perc_aggression: 0.50,
    preferred_keys:      ["Am", "Dm", "Em", "Gm"],
    forbidden_traits:    ["trap_hats", "edm_risers", "aggressive_log", "gospel_runs", "808_glide"],
  },
  production_directives: {
    mix_priorities:       ["rhodes_lead", "vocal_presence", "log_drum_supporting"],
    arrangement_strategy: "vocal-led arrangement — groove supports, Rhodes leads",
    automation_hints:     ["rhodes_chorus_intro", "vocal_reverb_long", "log_warm_mix"],
    layering_rules:       ["vocals_always_present", "rhodes_never_below_log_drum"],
    master_target_lufs:   -11,
  },
  evaluation_targets: {
    authenticity_target:             0.84,
    subgenre_recognizability_target: 0.82,
    groove_clarity_target:           0.80,
    harmonic_density_target:         0.52,
    dj_mix_friendliness_target:      0.78,
    cultural_lineage_coherence:      0.84,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// PRESET REGISTRY
// ─────────────────────────────────────────────────────────────────────────────
export const ALL_PRESETS: CTLv1[] = [
  privateSchoolPreset,
  bacardiPreset,
  sgijaPreset,
  stixxSgijaPreset,
  mbiraianoPreset,
  threeStepPreset,
  gqomFusionPreset,
  hybridRnbPreset,
];

export const PRESET_MAP: Record<string, CTLv1> = {
  private_school:        privateSchoolPreset,
  bacardi:               bacardiPreset,
  sgija:                 sgijaPreset,
  stixx_sgija:           stixxSgijaPreset,
  mbiraiano:             mbiraianoPreset,
  three_step:            threeStepPreset,
  gqom_fusion:           gqomFusionPreset,
  hybrid_rnb_amapiano:   hybridRnbPreset,
};
