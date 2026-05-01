// Sample Recommendation Engine — E-12
// Generates a culturally-grounded SamplePack for a given Amapiano lane.
// Each pack contains exactly 6 SampleRecommendations — one per SampleRole —
// with lane-specific descriptions, searchable tags, BPM window, and key hints.
// Optional AmapianEvaluation tunes confidence scores against measured signals.

import { clamp } from "../_utils";
import { LANE_TARGETS } from "../types";
import { CULTURAL_PROFILES } from "../cultural/cultural_profiles";
import type { Lane, AmapianEvaluation, SampleRole, SampleRecommendation, SamplePack } from "../types";

// ── Per-lane sample knowledge base ───────────────────────────────────────────

interface RoleSpec {
  description: string;
  tags:        string[];
  baseConf:    number;   // prior confidence without evaluation
}

type LaneKnowledge = Record<SampleRole, RoleSpec>;

const LANE_KNOWLEDGE: Record<Lane, LaneKnowledge> = {
  private_school: {
    log_drum:   { description: "Warm sub-tone log drum, 110 Hz fundamental, long tail", tags: ["log_drum", "warm", "110hz", "sub", "long_tail"], baseConf: 0.92 },
    chord_stab:  { description: "Sparse Rhodes piano stab, minor 7th voicing, reverb tail", tags: ["rhodes", "piano", "minor7", "sparse", "luxury"], baseConf: 0.90 },
    bassline:    { description: "Slow rolling sub-bass, note-held quarter-note motion", tags: ["sub_bass", "slow", "rolling", "warm", "quarter_note"], baseConf: 0.88 },
    top_loop:    { description: "Brushed hi-hat loop, loose 16th subdivisions at ~112 BPM", tags: ["hi_hat", "brushed", "loose", "112bpm", "shuffle"], baseConf: 0.85 },
    atmosphere:  { description: "Soft noir pad, slow-attack strings, wide stereo field", tags: ["pad", "strings", "noir", "wide", "slow_attack"], baseConf: 0.87 },
    fx:          { description: "Downward vinyl pitch sweep, 4-bar tension release", tags: ["vinyl", "pitch_sweep", "down", "tension", "4bar"], baseConf: 0.80 },
  },

  sgija: {
    log_drum:   { description: "Hard-attack log drum, 105 Hz, sharp transient, dry", tags: ["log_drum", "hard", "105hz", "dry", "sharp_transient"], baseConf: 0.94 },
    chord_stab:  { description: "Staccato piano chord, beat-2 emphasis, community energy", tags: ["piano", "staccato", "beat2", "raw", "street"], baseConf: 0.88 },
    bassline:    { description: "Driving kick-synced sub-bass, syncopated 8th-note pattern", tags: ["sub_bass", "syncopated", "8th_note", "driving", "punch"], baseConf: 0.90 },
    top_loop:    { description: "Dense 8th-note shaker loop, township percussive feel", tags: ["shaker", "8th_note", "dense", "township", "percussive"], baseConf: 0.87 },
    atmosphere:  { description: "Street reverb room tail, mid-forward mono character", tags: ["room", "mono", "mid_forward", "street", "raw"], baseConf: 0.82 },
    fx:          { description: "Air-horn riser, 2-bar community anthem marker", tags: ["air_horn", "riser", "2bar", "community", "anthem"], baseConf: 0.78 },
  },

  bacardi: {
    log_drum:   { description: "Compressed log drum, 108 Hz, fast decay, club-ready punch", tags: ["log_drum", "compressed", "108hz", "fast_decay", "club"], baseConf: 0.93 },
    chord_stab:  { description: "Short analog synth stab, euphoric minor chord, 118 BPM lock", tags: ["synth", "analog", "minor", "stab", "euphoric"], baseConf: 0.87 },
    bassline:    { description: "Club driving bassline, continuous 8th pulse, side-chained sub", tags: ["sub_bass", "sidechain", "8th_pulse", "driving", "club"], baseConf: 0.91 },
    top_loop:    { description: "Fast closed hi-hat 16th loop, club grid, bright timbre", tags: ["hi_hat", "16th", "closed", "bright", "club_grid"], baseConf: 0.88 },
    atmosphere:  { description: "Euphoric club reverb tail, long decay, wide stereo image", tags: ["reverb", "long_decay", "wide", "euphoric", "club"], baseConf: 0.85 },
    fx:          { description: "Club siren sweep, 1-bar drop marker, full-band energy", tags: ["siren", "sweep", "1bar", "drop", "full_band"], baseConf: 0.82 },
  },

  stixx_sgija: {
    log_drum:   { description: "Staccato log drum burst, 107 Hz, aggressive swing push", tags: ["log_drum", "staccato", "107hz", "aggressive", "swing"], baseConf: 0.93 },
    chord_stab:  { description: "Gritty piano stab, minor 2nd tension, hard-quantised", tags: ["piano", "minor2", "gritty", "hard_quantised", "street"], baseConf: 0.86 },
    bassline:    { description: "Punchy staccato sub, syncopated 16th rhythm, East Rand energy", tags: ["sub_bass", "staccato", "16th", "punchy", "syncopated"], baseConf: 0.89 },
    top_loop:    { description: "Hard-hit shaker, aggressive 16th subdivisions, swung grid", tags: ["shaker", "hard_hit", "16th", "aggressive", "swung"], baseConf: 0.86 },
    atmosphere:  { description: "Urban concrete room, short mono reverb, mid-aggressive", tags: ["room", "short", "mono", "urban", "aggressive"], baseConf: 0.80 },
    fx:          { description: "Hard-gate LFO chop, 1-bar rhythmic tension fill", tags: ["lfo_chop", "gate", "1bar", "tension", "rhythmic"], baseConf: 0.78 },
  },

  mbiraiano: {
    log_drum:   { description: "Soft log drum, 112 Hz, gentle attack, mbira-adjacent resonance", tags: ["log_drum", "soft", "112hz", "gentle", "resonance"], baseConf: 0.90 },
    chord_stab:  { description: "Mbira lamellaphone stab, pentatonic voicing, ancestral warmth", tags: ["mbira", "lamellaphone", "pentatonic", "ancestral", "warm"], baseConf: 0.95 },
    bassline:    { description: "Warm thumb-bass motion, melodic 8th-note pattern, organic feel", tags: ["bass", "thumb", "melodic", "organic", "8th_note"], baseConf: 0.88 },
    top_loop:    { description: "Shaker and hosho (gourd rattle) loop, Shona rhythmic pattern", tags: ["shaker", "hosho", "gourd", "shona", "organic"], baseConf: 0.90 },
    atmosphere:  { description: "Spiritual hall reverb, long decay, warm low-mid bloom", tags: ["hall", "reverb", "spiritual", "warm", "long_decay"], baseConf: 0.92 },
    fx:          { description: "Mbira harmonic overtone swell, 4-bar ancestral call", tags: ["mbira", "overtone", "swell", "4bar", "spiritual"], baseConf: 0.88 },
  },

  three_step: {
    log_drum:   { description: "Triplet-feel log drum, 110 Hz, polyrhythmic accent pattern", tags: ["log_drum", "triplet", "110hz", "polyrhythmic", "accent"], baseConf: 0.91 },
    chord_stab:  { description: "Jazz-inflected piano chord, maj9 or min11 voicing, sophisticated", tags: ["piano", "jazz", "maj9", "min11", "sophisticated"], baseConf: 0.92 },
    bassline:    { description: "Walking-style sub-bass, quarter-note precision, jazz structure", tags: ["bass", "walking", "quarter_note", "jazz", "precise"], baseConf: 0.89 },
    top_loop:    { description: "Brushed snare + rim triplet loop, structured jazz grid", tags: ["snare", "brush", "rim", "triplet", "jazz_grid"], baseConf: 0.87 },
    atmosphere:  { description: "Club-jazz reverb room, medium decay, balanced stereo", tags: ["room", "jazz", "medium_decay", "balanced", "stereo"], baseConf: 0.85 },
    fx:          { description: "Vinyl crackle layer, nostalgic texture, 8-bar loop", tags: ["vinyl", "crackle", "nostalgic", "8bar", "texture"], baseConf: 0.82 },
  },

  gqom_fusion: {
    log_drum:   { description: "Industrial log drum, 115 Hz, machine-hard transient, zero tail", tags: ["log_drum", "industrial", "115hz", "machine", "hard"], baseConf: 0.93 },
    chord_stab:  { description: "Dark minor cluster, detuned synth pad, Durban tribal energy", tags: ["synth", "dark", "minor_cluster", "detuned", "tribal"], baseConf: 0.88 },
    bassline:    { description: "Hard dark sub, straight 8th grid, industrial Durban character", tags: ["sub_bass", "dark", "straight_8th", "industrial", "durban"], baseConf: 0.91 },
    top_loop:    { description: "Hard metallic hi-hat, straight 16th, dark quantised machine feel", tags: ["hi_hat", "metallic", "16th", "dark", "quantised"], baseConf: 0.87 },
    atmosphere:  { description: "Industrial cave reverb, long dark decay, mono grit", tags: ["reverb", "industrial", "dark", "long_decay", "mono"], baseConf: 0.86 },
    fx:          { description: "Dark bass drop sub-thump, 2-bar tribal impact", tags: ["sub_thump", "dark", "2bar", "tribal", "impact"], baseConf: 0.84 },
  },

  hybrid_rnb_amapiano: {
    log_drum:   { description: "Smooth log drum, 110 Hz, RnB-friendly medium attack, warm tail", tags: ["log_drum", "smooth", "110hz", "rnb", "warm"], baseConf: 0.89 },
    chord_stab:  { description: "Lush Rhodes/Wurlitzer stab, minor 9th, vocal-friendly harmony", tags: ["rhodes", "wurlitzer", "minor9", "lush", "vocal_friendly"], baseConf: 0.92 },
    bassline:    { description: "Smooth melodic bass, afrobeats-inflected pattern, crossover feel", tags: ["bass", "melodic", "afrobeats", "smooth", "crossover"], baseConf: 0.90 },
    top_loop:    { description: "Light shaker + tambourine blend, accessible 16th groove", tags: ["shaker", "tambourine", "16th", "light", "accessible"], baseConf: 0.87 },
    atmosphere:  { description: "Lush plate reverb, warm vocal-space, romantic wide image", tags: ["plate", "reverb", "warm", "vocal_space", "romantic"], baseConf: 0.90 },
    fx:          { description: "Smooth pitch-rise transition, 2-bar crossover bridge marker", tags: ["pitch_rise", "smooth", "2bar", "crossover", "transition"], baseConf: 0.85 },
  },
};

const ROLE_ORDER: SampleRole[] = ["log_drum", "chord_stab", "bassline", "top_loop", "atmosphere", "fx"];

// ── Public API ────────────────────────────────────────────────────────────────

export interface RecommenderOptions {
  evaluation?: AmapianEvaluation;
}

export function recommendSamples(lane: Lane, options: RecommenderOptions = {}): SamplePack {
  const profile  = CULTURAL_PROFILES[lane];
  const targets  = LANE_TARGETS[lane];
  const ev       = options.evaluation;
  const knowledge = LANE_KNOWLEDGE[lane];

  // Confidence modifiers from evaluation when available
  const authMod  = ev ? clamp(ev.laneScores.overallAuthenticity - 0.5) * 0.1  : 0;
  const cultMod  = ev ? clamp(ev.cultural.alignmentScore        - 0.5) * 0.08 : 0;

  const recommendations: SampleRecommendation[] = ROLE_ORDER.map((role) => {
    const spec = knowledge[role];
    return {
      role,
      description: spec.description,
      tags:        spec.tags,
      confidence:  clamp(spec.baseConf + authMod + cultMod),
      bpmRange:    profile.bpmRange as [number, number],
      keyHints:    [...profile.keyBias],
    };
  });

  const culturalTags = [
    ...profile.lineage,
    profile.geoOrigin,
    profile.mixProfile,
    profile.tempoFeel,
  ];

  return {
    lane,
    recommendations,
    culturalTags,
    totalCount: recommendations.length,
  };
}
