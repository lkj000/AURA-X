export const SUBGENRE_DESCRIPTORS: Record<string, string> = {
  private_school:      "Private School Amapiano — luxurious, restrained, deep-house-derived, late-night elegance",
  bacardi:             "Bacardi Amapiano — raw street energy, minimal harmony, heavy log drum body",
  sgija:               "Sgija Amapiano — bounce-first groove, woody log phrasing, repetitive chant motion",
  stixx_sgija:         "Stixx Sgija — authored deep bounce, ghost-note log movement, maximum log drum identity",
  mbiraiano:           "Mbiraiano — organic mbira-centered fusion, ancestral spiritual atmosphere",
  three_step:          "Three-Step Amapiano — rhythmic innovation, asymmetric off-grid patterns",
  gqom_fusion:         "Gqom-Amapiano fusion — dark tribal percussion, sub-bass authority, club intensity",
  hybrid_rnb_amapiano: "Hybrid R&B × Amapiano — soulful hook-forward crossover, groove-centered intimacy",
};

export const MIX_PROFILE_DESCRIPTORS: Record<string, string> = {
  luxury_noir:       "late-night noir atmosphere, restrained and emotionally rich",
  raw_street:        "raw street-functional energy, stripped and direct",
  bounce_club:       "dance-floor bounce energy, groove-forward and percussive",
  spiritual_organic: "organic spiritual warmth, ancestral and meditative",
  dark_tribal:       "dark tribal intensity, primal and club-ready",
  crossover_rb:      "soulful crossover warmth, intimate and radio-conscious",
};

export const VOCAL_PROFILE_DESCRIPTORS: Record<string, string> = {
  sparse_chant:        "sparse Zulu-inflected chant, leave space between phrases",
  medium_melodic:      "melodic vocals with mid-density phrasing",
  dense_call_response: "dense call-and-response chant arrangement",
  percussive_only:     "percussive vocal stabs only, no sustained melody",
  none:                "instrumental, no vocals",
};

export const EXTENSION_POLICY_DESCRIPTORS: Record<string, string> = {
  none:            "static chords only, no extensions",
  sevenths_only:   "seventh chords (maj7, min7) — warm but restrained",
  full_extensions: "extended harmony (9ths, 11ths, 13ths) — jazz-influenced richness",
};

export const VOICING_STYLE_DESCRIPTORS: Record<string, string> = {
  sparse: "sparse open voicings — space is the harmony",
  medium: "medium-density voicings — balanced chord body",
  dense:  "dense close voicings — full harmonic presence",
};

export const HARMONIC_RHYTHM_DESCRIPTORS: Record<string, string> = {
  static: "static harmony — one chord for extended periods, groove drives motion",
  slow:   "slow harmonic movement — changes every 4–8 bars",
  medium: "medium harmonic movement — changes every 2–4 bars",
};

export const PATCH_CLASS_DESCRIPTORS: Record<string, string> = {
  private_school_soft_log: "soft deep woody pitched log drum, mono-centered, short decay",
  bacardi_raw_log:         "raw heavy log drum, punchy body, dry attack",
  sgija_bounce_log:        "bouncy woody log drum, groove-forward, mid-body",
  deep_stixx_log:          "deep authored Stixx log drum, ghost-note density, full variation",
  gqom_fusion_log:         "dark sub-heavy log drum, tribal weight, minimal pitch",
  warm_rhodes_luxury:      "warm Rhodes electric piano, soft attack, sustaining warmth",
  dry_jazz_ep:             "dry jazz electric piano, percussive and restrained",
  soft_detuned_ep:         "soft detuned electric piano, slightly wobbly warmth",
  soft_percussive_piano:   "soft percussive acoustic piano, sparse syncopated phrasing",
  raw_street_piano_loop:   "raw street piano loop, minimal and repetitive",
  luxury_noir_pad:         "warm analog pad bed, wide stereo, slow attack, atmosphere carrier",
  dark_haze_pad:           "dark hazy pad, ominous undertone, low warmth",
  dry_constant_shaker:     "dry constant 16th-note shaker, pulse glue",
  granular_shaker:         "granular textured shaker, organic pulse feel",
  dark_offbeat_stab:       "dark staccato offbeat stab, short and punctuating",
  mbira_organic_pluck:     "organic mbira pluck, ancestral tonal identity",
};

export const LINEAGE_DESCRIPTORS: Record<string, string> = {
  deep_house:          "deep-house-derived harmonic pacing and atmospheric restraint",
  kwaito:              "kwaito groove attitude and vocal spacing logic",
  jazz:                "jazz-influenced chord extensions and late-night elegance",
  lounge:              "lounge-derived pad sophistication and section patience",
  bacardi:             "bacardi raw percussive motion and street energy",
  dibacardi:           "diBacardi raw energy undertone",
  log_drum_innovation: "log drum innovation as primary identity anchor",
  gqom:                "gqom dark tribal percussion influence",
  mbira:               "mbira ancestral tonal lineage",
};

export const TRANSITION_DESCRIPTORS: Record<string, string> = {
  cut:           "hard cut",
  fade:          "smooth fade",
  log_drum_fill: "log drum fill leading into next section",
  filter_sweep:  "filter sweep transition",
  echo_out:      "echo tail out",
};
