// Cultural Profiles — E-04
// Static knowledge base: lineage, geo-origin, emotional tone, production markers,
// mix profile, and key bias for all 8 Amapiano subgenres.

import type { CulturalProfile, Lane } from "../types";

export const CULTURAL_PROFILES: Record<Lane, CulturalProfile> = {
  private_school: {
    lane:              "private_school",
    lineage:           ["deep_house", "kwaito", "piano_ballad"],
    geoOrigin:         "Johannesburg, Sandton / Soweto",
    emotionalProfile:  ["luxury", "aspiration", "calm_confidence"],
    productionMarkers: ["slow_bpm", "sparse_percussion", "piano_prominence", "warm_sub_bass"],
    mixProfile:        "luxury_noir",
    bpmRange:          [109, 115],
    keyBias:           ["Am", "Dm", "Em", "Fm"],
    tempoFeel:         "slow",
  },

  sgija: {
    lane:              "sgija",
    lineage:           ["kwaito", "bacardi_circuit", "house"],
    geoOrigin:         "Johannesburg, Alexandra / Tembisa",
    emotionalProfile:  ["raw_energy", "street_swagger", "communal_joy"],
    productionMarkers: ["dense_percussion", "log_drum_heavy", "syncopated_rhythm", "driving_energy"],
    mixProfile:        "raw_street",
    bpmRange:          [112, 117],
    keyBias:           ["Gm", "Cm", "Dm"],
    tempoFeel:         "mid",
  },

  bacardi: {
    lane:              "bacardi",
    lineage:           ["house", "electronic_dance", "kwaito"],
    geoOrigin:         "Johannesburg, club circuit",
    emotionalProfile:  ["euphoria", "aggressive_energy", "party_vibes"],
    productionMarkers: ["fast_bpm", "dense_hats", "driving_bass", "club_energy"],
    mixProfile:        "bounce_club",
    bpmRange:          [116, 122],
    keyBias:           ["Am", "Cm", "Fm"],
    tempoFeel:         "fast",
  },

  stixx_sgija: {
    lane:              "stixx_sgija",
    lineage:           ["sgija", "electronic", "grime_influences"],
    geoOrigin:         "Johannesburg, East Rand",
    emotionalProfile:  ["aggression", "street_dominance", "urban_toughness"],
    productionMarkers: ["staccato_log_drum", "hard_kick", "syncopated_push", "aggressive_swing"],
    mixProfile:        "raw_street",
    bpmRange:          [113, 118],
    keyBias:           ["Cm", "Fm", "Gm"],
    tempoFeel:         "mid",
  },

  mbiraiano: {
    lane:              "mbiraiano",
    lineage:           ["mbira_dza_vadzimu", "shona_music", "amapiano"],
    geoOrigin:         "Zimbabwe / diaspora",
    emotionalProfile:  ["ancestral_connection", "spiritual_warmth", "cultural_pride"],
    productionMarkers: ["melodic_mbira_layers", "spiritual_ambience", "warm_keys", "gentle_percussion"],
    mixProfile:        "spiritual_organic",
    bpmRange:          [108, 114],
    keyBias:           ["Am", "Em", "Dm"],
    tempoFeel:         "slow",
  },

  three_step: {
    lane:              "three_step",
    lineage:           ["jazz", "private_school_amapiano", "deep_house"],
    geoOrigin:         "Johannesburg, Pretoria",
    emotionalProfile:  ["sophistication", "rhythmic_precision", "intellectual_energy"],
    productionMarkers: ["triplet_grid", "polyrhythmic_layers", "balanced_dynamics", "structured_arrangement"],
    mixProfile:        "luxury_noir",
    bpmRange:          [111, 115],
    keyBias:           ["Dm", "Am", "Gm"],
    tempoFeel:         "slow",
  },

  gqom_fusion: {
    lane:              "gqom_fusion",
    lineage:           ["gqom", "tribal_house", "electronic"],
    geoOrigin:         "Durban, KwaZulu-Natal",
    emotionalProfile:  ["dark_intensity", "urban_grittiness", "primal_drive"],
    productionMarkers: ["machine_percussion", "dark_bassline", "industrial_texture", "hard_quantise"],
    mixProfile:        "dark_tribal",
    bpmRange:          [117, 122],
    keyBias:           ["Cm", "Fm", "Bbm"],
    tempoFeel:         "fast",
  },

  hybrid_rnb_amapiano: {
    lane:              "hybrid_rnb_amapiano",
    lineage:           ["rnb", "afrobeats", "amapiano"],
    geoOrigin:         "Pan-African, diaspora",
    emotionalProfile:  ["romantic", "crossover_appeal", "modern_afro"],
    productionMarkers: ["melodic_hooks", "smooth_bassline", "vocal_friendly", "accessible_structure"],
    mixProfile:        "crossover_rb",
    bpmRange:          [110, 115],
    keyBias:           ["Am", "Dm", "Gm", "Em"],
    tempoFeel:         "slow",
  },
};
