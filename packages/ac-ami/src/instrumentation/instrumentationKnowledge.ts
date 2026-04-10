import { z } from "zod";
import { SubgenreEnum, InstrumentFamilyEnum } from "@aura-x/ctl";

type Subgenre       = z.infer<typeof SubgenreEnum>;
type InstrumentFamily = z.infer<typeof InstrumentFamilyEnum>;

// ─── LOG DRUM PATCH CLASSES ───────────────────────────────────────────────────
// Most culturally critical instrument decision.
// Wrong patch class = wrong identity regardless of groove.

export const LOG_DRUM_PATCH_BY_SUBGENRE: Record<Subgenre, string> = {
  private_school:       "private_school_soft_log",
  bacardi:              "bacardi_raw_log",
  sgija:                "sgija_bounce_log",
  stixx_sgija:          "deep_stixx_log",
  mbiraiano:            "private_school_soft_log", // softer in spiritual context
  three_step:           "sgija_bounce_log",        // bounce-adjacent
  gqom_fusion:          "gqom_fusion_log",
  hybrid_rnb_amapiano:  "private_school_soft_log", // smooth for crossover
};

// ─── KEYBOARD PATCH CLASSES ───────────────────────────────────────────────────
// Rhodes vs piano — each carries different cultural weight.
// Jazz/lounge lineage can upgrade piano lanes to Rhodes.

export const KEYBOARD_PATCH_BY_SUBGENRE: Record<Subgenre, {
  primary: string;
  family: InstrumentFamily;
}> = {
  private_school:       { primary: "warm_rhodes_luxury",   family: "rhodes" },
  bacardi:              { primary: "raw_street_piano_loop", family: "piano"  },
  sgija:                { primary: "soft_percussive_piano", family: "piano"  },
  stixx_sgija:          { primary: "soft_percussive_piano", family: "piano"  },
  mbiraiano:            { primary: "warm_rhodes_luxury",    family: "rhodes" },
  three_step:           { primary: "soft_percussive_piano", family: "piano"  },
  gqom_fusion:          { primary: "raw_street_piano_loop", family: "piano"  },
  hybrid_rnb_amapiano:  { primary: "warm_rhodes_luxury",    family: "rhodes" },
};

// ─── PAD PATCH CLASSES ───────────────────────────────────────────────────────

export const PAD_PATCH_BY_SUBGENRE: Record<Subgenre, string> = {
  private_school:       "luxury_noir_pad",
  bacardi:              "dark_haze_pad",
  sgija:                "dark_haze_pad",
  stixx_sgija:          "dark_haze_pad",
  mbiraiano:            "luxury_noir_pad",  // warmth for spiritual context
  three_step:           "dark_haze_pad",
  gqom_fusion:          "dark_haze_pad",
  hybrid_rnb_amapiano:  "luxury_noir_pad",
};

// ─── LOG DRUM BODY WEIGHT ─────────────────────────────────────────────────────
// How heavy and present the log drum sits in the mix (0–1).

export const LOG_DRUM_BODY_WEIGHT: Record<Subgenre, number> = {
  private_school:       0.70,
  bacardi:              0.90,
  sgija:                0.80,
  stixx_sgija:          0.88,
  mbiraiano:            0.65,
  three_step:           0.78,
  gqom_fusion:          0.92,
  hybrid_rnb_amapiano:  0.68,
};

// ─── FORBIDDEN TRAITS BY INSTRUMENT FAMILY ───────────────────────────────────
// Cultural anti-drift rules — applies regardless of subgenre.

export const FORBIDDEN_TRAITS_BY_FAMILY: Record<InstrumentFamily, string[]> = {
  log_drum:  ["trap_bass_808", "sub_only_sine", "edm_kick_punch", "four_floor_kick"],
  piano:     ["bright_pop_piano", "gospel_runs", "virtuosic_runs", "ballad_sustain"],
  rhodes:    ["overdriven_ep", "funky_clavinet_chop"],
  pads:      ["edm_swell", "trance_pad", "sharp_attack", "filter_cutoff_automation"],
  shakers:   ["trap_hihat_roll", "edm_hat_pattern", "pitched_hi_hat"],
  kick:      ["four_floor_dominance", "edm_kick_punch"],
  bass:      ["808_glide", "dubstep_wobble", "trap_808_glide"],
  stabs:     ["supersaw_stab", "trance_chord", "edm_chord_stab"],
  mbira:     ["generic_pluck_synth", "marimba_substitute"],
  vocals:    ["auto_tune_heavy", "pop_melisma"],
  fx:        ["edm_riser", "white_noise_sweep", "reverse_cymbal_edm"],
};
