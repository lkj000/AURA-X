import { z } from "zod";
import { SubgenreEnum } from "@aura-x/ctl";

type Subgenre = z.infer<typeof SubgenreEnum>;

// ─── KEY ZONES ────────────────────────────────────────────────────────────────
// Preferred keys per subgenre, rooted in cultural performance history
// and the emotional register each subgenre occupies.

export const SUBGENRE_KEY_ZONES: Record<Subgenre, string[]> = {
  private_school:       ["F#m", "C#m", "Em", "Bm", "Abm"],
  bacardi:              ["Gm", "Am", "Dm", "Cm"],
  sgija:                ["Gm", "Fm", "Am", "Cm"],
  stixx_sgija:          ["Gm", "Fm", "Dm"],
  mbiraiano:            ["Dm", "Em", "Am", "Bm"],
  three_step:           ["Em", "Fm", "Gm", "Am"],
  gqom_fusion:          ["Cm", "Dm", "Fm"],
  hybrid_rnb_amapiano:  ["F#m", "Em", "Bm", "Dbm"],
};

// ─── PROGRESSION FAMILIES ────────────────────────────────────────────────────
// Chord movement archetypes per subgenre.
// maxChanges = max chord changes per 4 bars (reflects harmonic density).

export const SUBGENRE_PROGRESSIONS: Record<Subgenre, {
  preferred: string[];
  exemplars: string[];
  maxChanges: number;
}> = {
  private_school: {
    preferred:  ["i-VI-III-VII", "i-iv-VI-VII"],
    exemplars:  ["F#m7-Dmaj7-Amaj7-E", "C#m7-Amaj7-Emaj7-B"],
    maxChanges: 4,
  },
  bacardi: {
    preferred:  ["i-VII", "i"],
    exemplars:  ["Gm-F", "Gm"],
    maxChanges: 2,
  },
  sgija: {
    preferred:  ["i-VI-VII-i", "i-VII-VI"],
    exemplars:  ["Gm-Eb-F-Gm", "Am-F-G"],
    maxChanges: 3,
  },
  stixx_sgija: {
    preferred:  ["i-VII-VI-VII", "i-VI"],
    exemplars:  ["Gm-F-Eb-F", "Fm-Db"],
    maxChanges: 3,
  },
  mbiraiano: {
    preferred:  ["i-VI-i-VII", "i-iv-VI-VII"],
    exemplars:  ["Dm-Bb-Dm-C", "Am-Dm-F-G"],
    maxChanges: 3,
  },
  three_step: {
    preferred:  ["i-VI-VII", "i-iv-VII"],
    exemplars:  ["Em-C-D", "Fm-Db-Eb"],
    maxChanges: 3,
  },
  gqom_fusion: {
    preferred:  ["i", "i-VII"],
    exemplars:  ["Cm", "Cm-Bb"],
    maxChanges: 2,
  },
  hybrid_rnb_amapiano: {
    preferred:  ["vi-IV-I-V", "i-VI-III-VII"],
    exemplars:  ["F#m-D-A-E", "Em-C-G-D"],
    maxChanges: 5,
  },
};

// ─── EXTENSION POLICY ────────────────────────────────────────────────────────
// Base extension policy per subgenre — lineage modifiers applied in planner.

export const BASE_EXTENSION_POLICY: Record<Subgenre,
  "none" | "sevenths_only" | "full_extensions"> = {
  private_school:       "full_extensions",
  bacardi:              "none",
  sgija:                "sevenths_only",
  stixx_sgija:          "sevenths_only",
  mbiraiano:            "sevenths_only",
  three_step:           "sevenths_only",
  gqom_fusion:          "none",
  hybrid_rnb_amapiano:  "full_extensions",
};

// ─── VOICING STYLE ───────────────────────────────────────────────────────────

export const BASE_VOICING_STYLE: Record<Subgenre,
  "sparse" | "medium" | "dense"> = {
  private_school:       "sparse",
  bacardi:              "sparse",
  sgija:                "sparse",
  stixx_sgija:          "sparse",
  mbiraiano:            "medium",
  three_step:           "medium",
  gqom_fusion:          "sparse",
  hybrid_rnb_amapiano:  "medium",
};

// ─── HARMONIC RHYTHM ─────────────────────────────────────────────────────────

export const BASE_HARMONIC_RHYTHM: Record<Subgenre,
  "static" | "slow" | "medium"> = {
  private_school:       "slow",
  bacardi:              "static",
  sgija:                "slow",
  stixx_sgija:          "slow",
  mbiraiano:            "slow",
  three_step:           "slow",
  gqom_fusion:          "static",
  hybrid_rnb_amapiano:  "medium",
};
