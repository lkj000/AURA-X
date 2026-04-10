import { z } from "zod";
import { GroovePatternSchema } from "@aura-x/ctl";

export type GroovePattern = z.infer<typeof GroovePatternSchema>;

// ─── PRIVATE SCHOOL ──────────────────────────────────────────────────────────
// Restrained, space-driven, soft log entry. Swing lifts gently.

export const PRIVATE_SCHOOL_GROOVE_1: GroovePattern = {
  id: "ps_groove_01",
  label: "Private School — Restrained",
  steps:       ["K","-","x","-","L","-","x","-","K","-","x","-","L","-","x","-"],
  microtiming: [0, 0, -3, 0, 2, 0, -2, 0, 0, 0, -3, 0, 4, 0, -2, 0],
  velocity:    [108, 0, 55, 0, 85, 0, 52, 0, 100, 0, 55, 0, 80, 0, 50, 0],
  swing: 0.54,
};

export const PRIVATE_SCHOOL_GROOVE_2: GroovePattern = {
  id: "ps_groove_02",
  label: "Private School — Late Night Sparse",
  steps:       ["K","-","x","-","L","-","-","g","K","-","x","-","L","-","x","g"],
  microtiming: [0, 0, -4, 0, 0, 0, 0, 10, 0, 0, -3, 0, 2, 0, -2, 8],
  velocity:    [110, 0, 52, 0, 88, 0, 0, 35, 102, 0, 54, 0, 82, 0, 50, 32],
  swing: 0.56,
};

// ─── BACARDI ─────────────────────────────────────────────────────────────────
// Raw, minimal, heavy log body. No ghost decoration. Swing <= 0.52.

export const BACARDI_GROOVE_1: GroovePattern = {
  id: "bac_groove_01",
  label: "Bacardi — Raw Minimal",
  steps:       ["K","-","x","-","L","-","x","-","K","-","x","-","L","-","-","-"],
  microtiming: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  velocity:    [115, 0, 60, 0, 100, 0, 58, 0, 108, 0, 58, 0, 95, 0, 0, 0],
  swing: 0.50,
};

export const BACARDI_GROOVE_2: GroovePattern = {
  id: "bac_groove_02",
  label: "Bacardi — Heavy Body",
  steps:       ["K","-","x","-","L","L","x","-","K","-","x","-","L","-","-","-"],
  microtiming: [0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  velocity:    [118, 0, 62, 0, 105, 85, 60, 0, 110, 0, 60, 0, 98, 0, 0, 0],
  swing: 0.50,
};

// ─── SGIJA ───────────────────────────────────────────────────────────────────
// Bounce-oriented, g-g-L motion, woody log phrasing. Swing >= 0.55.

export const SGIJA_GROOVE_1: GroovePattern = {
  id: "sgija_groove_01",
  label: "Sgija — Classic Bounce",
  steps:       ["K","-","x","g","L","g","x","-","K","-","x","g","L","x","-","g"],
  microtiming: [0, 0, -4, 8, 0, 6, -2, 0, 0, 0, -4, 8, 2, -2, 0, 10],
  velocity:    [112, 0, 58, 38, 92, 40, 55, 0, 105, 0, 56, 36, 88, 52, 0, 35],
  swing: 0.58,
};

export const SGIJA_GROOVE_2: GroovePattern = {
  id: "sgija_groove_02",
  label: "Sgija — Late Kick Bounce",
  steps:       ["K","-","x","-","L","g","x","-","-","K","x","g","L","x","-","g"],
  microtiming: [0, 0, -3, 0, 0, 8, -2, 0, 0, 4, -3, 9, 2, -2, 0, 10],
  velocity:    [110, 0, 56, 0, 90, 38, 54, 0, 0, 95, 55, 35, 86, 50, 0, 33],
  swing: 0.58,
};

// ─── STIXX SGIJA ─────────────────────────────────────────────────────────────
// Dense ghost-note movement. 3 variation patterns (the richest family).

export const STIXX_GROOVE_1: GroovePattern = {
  id: "stixx_groove_01",
  label: "Stixx Sgija — Deep Bounce Primary",
  steps:       ["K","g","x","g","L","g","x","g","K","g","x","g","L","g","x","g"],
  microtiming: [0, 6, -4, 9, 0, 7, -3, 10, 0, 5, -4, 8, 2, 7, -2, 11],
  velocity:    [112, 32, 58, 30, 95, 35, 55, 28, 106, 30, 56, 28, 90, 33, 52, 26],
  swing: 0.60,
};

export const STIXX_GROOVE_2: GroovePattern = {
  id: "stixx_groove_02",
  label: "Stixx Sgija — Deep Bounce Variation",
  steps:       ["K","g","x","-","L","g","L","g","K","-","x","g","L","g","x","g"],
  microtiming: [0, 7, -4, 0, 0, 8, 5, 10, 0, 0, -4, 9, 2, 7, -2, 11],
  velocity:    [114, 33, 58, 0, 96, 36, 80, 28, 108, 0, 56, 29, 91, 34, 52, 27],
  swing: 0.60,
};

export const STIXX_GROOVE_3: GroovePattern = {
  id: "stixx_groove_03",
  label: "Stixx Sgija — Minimal Bounce",
  steps:       ["K","-","x","-","L","g","x","-","K","g","x","-","L","g","x","g"],
  microtiming: [0, 0, -4, 0, 0, 8, -3, 0, 0, 6, -4, 0, 2, 7, -2, 11],
  velocity:    [112, 0, 58, 0, 95, 35, 55, 0, 106, 30, 56, 0, 90, 33, 52, 26],
  swing: 0.58,
};

// ─── MBIRAIANO ───────────────────────────────────────────────────────────────
// Organic feel, slightly looser swing, ancestral cyclical motion.

export const MBIRAIANO_GROOVE_1: GroovePattern = {
  id: "mbira_groove_01",
  label: "Mbiraiano — Organic Pulse",
  steps:       ["K","-","x","-","L","-","x","g","K","-","x","-","L","g","x","-"],
  microtiming: [0, 0, -5, 0, 2, 0, -3, 12, 0, 0, -5, 0, 4, 10, -3, 0],
  velocity:    [105, 0, 52, 0, 82, 0, 50, 33, 98, 0, 50, 0, 78, 30, 48, 0],
  swing: 0.57,
};

// ─── THREE-STEP ──────────────────────────────────────────────────────────────
// Asymmetric, off-grid. The log drum pattern IS the identity.

export const THREE_STEP_GROOVE_1: GroovePattern = {
  id: "3step_groove_01",
  label: "Three-Step — Off-Grid Primary",
  steps:       ["K","-","x","K","-","L","x","-","K","-","x","-","L","K","x","-"],
  microtiming: [0, 0, -4, -8, 0, 0, -3, 0, 0, 0, -4, 0, 0, -6, -3, 0],
  velocity:    [110, 0, 55, 80, 0, 90, 53, 0, 108, 0, 54, 0, 88, 75, 52, 0],
  swing: 0.52,
};

// ─── GQOM FUSION ─────────────────────────────────────────────────────────────
// Dark tribal, sub-bass aligned, hard quantized. Swing <= 0.52.

export const GQOM_GROOVE_1: GroovePattern = {
  id: "gqom_groove_01",
  label: "Gqom Fusion — Dark Tribal",
  steps:       ["K","-","x","-","K","L","x","-","K","-","x","-","L","-","x","-"],
  microtiming: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  velocity:    [120, 0, 62, 0, 115, 100, 60, 0, 118, 0, 60, 0, 98, 0, 58, 0],
  swing: 0.50,
};

// ─── HYBRID R&B ──────────────────────────────────────────────────────────────
// Smooth bounce for crossover. Vocal-supporting groove.

export const HYBRID_RNB_GROOVE_1: GroovePattern = {
  id: "rnb_groove_01",
  label: "Hybrid R&B — Smooth Amapiano",
  steps:       ["K","-","x","-","L","-","x","g","K","-","x","-","L","-","x","g"],
  microtiming: [0, 0, -3, 0, 2, 0, -2, 9, 0, 0, -3, 0, 3, 0, -2, 8],
  velocity:    [108, 0, 54, 0, 86, 0, 52, 32, 100, 0, 52, 0, 82, 0, 50, 30],
  swing: 0.55,
};

// ─── PATTERN REGISTRY ────────────────────────────────────────────────────────

export const GROOVE_LIBRARY: Record<string, GroovePattern> = {
  ps_groove_01:      PRIVATE_SCHOOL_GROOVE_1,
  ps_groove_02:      PRIVATE_SCHOOL_GROOVE_2,
  bac_groove_01:     BACARDI_GROOVE_1,
  bac_groove_02:     BACARDI_GROOVE_2,
  sgija_groove_01:   SGIJA_GROOVE_1,
  sgija_groove_02:   SGIJA_GROOVE_2,
  stixx_groove_01:   STIXX_GROOVE_1,
  stixx_groove_02:   STIXX_GROOVE_2,
  stixx_groove_03:   STIXX_GROOVE_3,
  mbira_groove_01:   MBIRAIANO_GROOVE_1,
  "3step_groove_01": THREE_STEP_GROOVE_1,
  gqom_groove_01:    GQOM_GROOVE_1,
  rnb_groove_01:     HYBRID_RNB_GROOVE_1,
};

export const ALL_PATTERNS = Object.values(GROOVE_LIBRARY);
