import { CTLv1, HarmonyProfileSchema } from "@aura-x/ctl";
import { z } from "zod";
import { buildChordProgression, generateInversions } from "@aura-x/engine";
import type { ChordProgression, InversionSet, Lane } from "@aura-x/engine";
import {
  SUBGENRE_KEY_ZONES,
  SUBGENRE_PROGRESSIONS,
  BASE_EXTENSION_POLICY,
  BASE_VOICING_STYLE,
  BASE_HARMONIC_RHYTHM,
} from "./harmonyKnowledge";

// ─── Chord transposition utilities ───────────────────────────────────────────
const CHROMATIC = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"] as const;
const ENHARMONIC: Record<string, string> = {
  Db:"C#", Eb:"D#", Fb:"E", Gb:"F#", Ab:"G#", Bb:"A#", Cb:"B",
};

function noteIndex(note: string): number {
  const n = ENHARMONIC[note] ?? note;
  return CHROMATIC.indexOf(n as typeof CHROMATIC[number]);
}

function transposeChord(chord: string, semitones: number): string {
  if (semitones === 0) return chord;
  const m = chord.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return chord;
  const idx = noteIndex(m[1]);
  if (idx < 0) return chord;
  return CHROMATIC[((idx + semitones) % 12 + 12) % 12] + m[2];
}

function transposeProgression(prog: string, semitones: number): string {
  if (semitones === 0) return prog;
  return prog.split("-").map(c => transposeChord(c, semitones)).join("-");
}

export type HarmonyPlan = z.infer<typeof HarmonyProfileSchema>;

export type HarmonyPlannerOptions = {
  /** Override key selection (e.g. "F#m" or "F#") */
  forceKey?: string;
  /** 0–1: boosts lounge/jazz warmth → richer voicing */
  warmth?: number;
  /** 0–1: boosts extension policy richness */
  harmonicRichness?: number;
};

export function planHarmony(
  ctl: CTLv1,
  opts: HarmonyPlannerOptions = {}
): HarmonyPlan {
  const { global, cultural_lineage } = ctl;
  const subgenre = global.subgenre;

  // ─── 1. KEY / TONAL CENTER ────────────────────────────────────────────────
  const preferredKeys = SUBGENRE_KEY_ZONES[subgenre];
  let tonicCenter: string;

  if (opts.forceKey) {
    tonicCenter = opts.forceKey.replace(/m$/, "");
  } else if (global.key) {
    // Always honour the requested key — preferred zone is for defaults only
    tonicCenter = global.key.replace(/m$/, "");
  } else {
    tonicCenter = preferredKeys[0].replace(/m$/, "");
  }

  // ─── 2. PROGRESSION + CHORD DENSITY ─────────────────────────────────────
  const progData = SUBGENRE_PROGRESSIONS[subgenre];
  // Semitone offset from subgenre home key so exemplar chords transpose correctly
  const homeRoot  = preferredKeys[0].replace(/m$/, "");
  const xpose     = (noteIndex(tonicCenter) - noteIndex(homeRoot) + 12) % 12;
  let maxChanges = progData.maxChanges;

  // Bacardi inheritance reduces chord density (less movement = more groove)
  const bacardiWeight = cultural_lineage.bacardi?.weight ?? 0;
  if (bacardiWeight >= 0.5) {
    maxChanges = Math.max(1, maxChanges - 1);
  }

  // Hybrid R&B with low deep_house anchor can push further
  if (subgenre === "hybrid_rnb_amapiano") {
    const deepHouseWeight = cultural_lineage.deep_house?.weight ?? 0;
    if (deepHouseWeight < 0.4) maxChanges = Math.min(8, maxChanges + 1);
  }

  // ─── 3. EXTENSION POLICY ─────────────────────────────────────────────────
  let extensionPolicy = BASE_EXTENSION_POLICY[subgenre];

  const jazzWeight    = cultural_lineage.jazz?.weight ?? 0;
  const richness      = opts.harmonicRichness ?? 0.5;

  // Jazz lineage + explicit richness request → unlock full extensions
  if (jazzWeight >= 0.5 && richness >= 0.6) {
    extensionPolicy = "full_extensions";
  } else if (jazzWeight >= 0.3 && extensionPolicy === "none") {
    extensionPolicy = "sevenths_only";
  }

  // Heavy bacardi lineage strips extensions back (except R&B crossover)
  if (bacardiWeight >= 0.6 && subgenre !== "hybrid_rnb_amapiano") {
    extensionPolicy = "none";
  }

  // ─── 4. VOICING STYLE ────────────────────────────────────────────────────
  let voicingStyle = BASE_VOICING_STYLE[subgenre];

  const warmth      = opts.warmth ?? 0.5;
  const loungeWeight = cultural_lineage.lounge?.weight ?? 0;
  if (warmth >= 0.7 && loungeWeight >= 0.4) {
    voicingStyle = "medium";
  }

  // ─── 5. HARMONIC RHYTHM ──────────────────────────────────────────────────
  let harmonicRhythm = BASE_HARMONIC_RHYTHM[subgenre];

  const deepHouseWeight = cultural_lineage.deep_house?.weight ?? 0;
  // Deep house patience reins in medium → slow
  if (deepHouseWeight >= 0.7 && harmonicRhythm === "medium") {
    harmonicRhythm = "slow";
  }

  // ─── 6. MODE ─────────────────────────────────────────────────────────────
  // Mbiraiano uses dorian for its characteristic warmth and modal colour.
  // All other subgenres default to aeolian.
  const mode = subgenre === "mbiraiano" ? "dorian" : "aeolian";

  return HarmonyProfileSchema.parse({
    tonal_center:                 tonicCenter,
    mode,
    preferred_progressions:       progData.preferred,
    exemplar_progressions:        progData.exemplars.map(p => transposeProgression(p, xpose)),
    max_chord_changes_per_4_bars: maxChanges,
    extension_policy:             extensionPolicy,
    voicing_style:                voicingStyle,
    harmonic_rhythm:              harmonicRhythm,
  });
}

/** Returns a new CTL with harmony replaced by the planner output. Immutable. */
export function applyHarmonyPlan(ctl: CTLv1, opts: HarmonyPlannerOptions = {}): CTLv1 {
  return { ...ctl, harmony: planHarmony(ctl, opts) };
}

// ── Engine-backed voicing layer ───────────────────────────────────────────────

export type HarmonyPlanWithVoicings = HarmonyPlan & {
  /** Concrete MIDI voicings for all 4 chords in this lane's progression */
  voicings:   ChordProgression;
  /** Root + all valid close-position inversions per voicing */
  inversions: InversionSet[];
};

/**
 * Full harmony pipeline: abstract CTL plan + concrete MIDI voicings + inversions.
 * planHarmony → buildChordProgression → generateInversions per chord.
 */
export function planHarmonyWithVoicings(
  ctl: CTLv1,
  opts: HarmonyPlannerOptions = {}
): HarmonyPlanWithVoicings {
  const plan      = planHarmony(ctl, opts);
  const lane      = ctl.global.subgenre as Lane;
  const voicings  = buildChordProgression({ lane });
  const inversions = voicings.voicings.map((v: { notes: number[] }) => generateInversions({ notes: v.notes }));
  return { ...plan, voicings, inversions };
}
