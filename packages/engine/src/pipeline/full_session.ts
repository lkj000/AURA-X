// Full Session Engine — E-20
// End-to-end orchestrator. Takes a Lane + optional context and returns a
// FullSession with every engine module's output wired together:
//   E-07  grooves         — GrooveVariationSet
//   E-09  fingerprints    — PatternFingerprint per variant
//   E-10  arc             — ArrangementArc
//   E-13  humanized       — HumanizedPattern (main groove)
//   E-15  interpolated    — main→variation at alpha 0.5
//   E-12  samplePack      — SamplePack (evaluation-enriched when available)
//   E-11  mixSpec         — MixSpec (requires evaluation)
//   E-16  report          — ProductionReport (requires evaluation)
//   E-17  chords          — ChordProgression
//   E-19  chordMidi       — Binary MIDI buffer (chord progression)
//   groove MIDI           — Binary MIDI buffer (main groove, 4 bars)

import { generateGrooveVariations }       from "../groove/variation_engine";
import { fingerprintGroovePlan }          from "../groove/pattern_fingerprint";
import { interpolateGrooves }             from "../groove/groove_interpolator";
import { humanizePattern }               from "../groove/tempo_humanizer";
import { planArrangementArc }            from "../arrangement/arc_planner";
import { recommendSamples }              from "../intelligence/sample_recommender";
import { buildChordProgression }         from "../intelligence/chord_voicing";
import { generateMixSpec }               from "../mix/mix_spec";
import { generateProductionReport }      from "./production_report";
import { groovePlanToMidi }             from "../daw_export/midi_export";
import { exportChordProgressionToMidi }  from "../daw_export/chord_midi_export";
import { LANE_TARGETS }                  from "../types";
import type {
  Lane, AmapianEvaluation,
  GrooveVariationSet, GrooveVariationType,
  PatternFingerprint, GrooveInterpolation,
  HumanizedPattern, ArrangementArc,
  SamplePack, MixSpec, ChordProgression,
} from "../types";
import type { ProductionReport }         from "../types";

// ── Public API ────────────────────────────────────────────────────────────────

export interface FullSessionOptions {
  lane:        Lane;
  bpm?:        number;              // defaults to lane target BPM
  evaluation?: AmapianEvaluation;  // if provided, enriches mixSpec + report
  humanness?:  number;             // humanizer magnitude [0,1], default 0.5
}

export interface FullSession {
  lane:         Lane;
  bpm:          number;
  grooves:      GrooveVariationSet;
  fingerprints: Record<GrooveVariationType, PatternFingerprint>;
  arc:          ArrangementArc;
  humanized:    HumanizedPattern;
  interpolated: GrooveInterpolation;
  samplePack:   SamplePack;
  chords:       ChordProgression;
  mixSpec:      MixSpec | null;
  report:       ProductionReport | null;
  grooveMidi:   Buffer;
  chordMidi:    Buffer;
}

const GROOVE_VARIANTS: GrooveVariationType[] = ["main", "variation", "fill", "breakdown", "build"];

export function runFullSession(options: FullSessionOptions): FullSession {
  const { lane, evaluation } = options;
  const bpm       = options.bpm       ?? LANE_TARGETS[lane].bpm;
  const humanness = options.humanness ?? 0.5;

  // E-07 — groove variations
  const grooves = generateGrooveVariations(lane, { bpm });

  // E-09 — fingerprint every variant
  const fingerprints = Object.fromEntries(
    GROOVE_VARIANTS.map((v) => [v, fingerprintGroovePlan(grooves[v])]),
  ) as Record<GrooveVariationType, PatternFingerprint>;

  // E-10 — arrangement arc
  const arc = planArrangementArc(lane, { bpm });

  // E-13 — humanize the main groove
  const humanized = humanizePattern(grooves.main, { bpm, humanness });

  // E-15 — interpolate main → variation at midpoint
  const interpolated = interpolateGrooves(grooves.main, grooves.variation, { alpha: 0.5 });

  // E-12 — sample recommendations (enriched if evaluation present)
  const samplePack = recommendSamples(lane, { evaluation });

  // E-17 — chord progression
  const chords = buildChordProgression({ lane });

  // E-11 — mix spec (requires evaluation)
  const mixSpec = evaluation ? generateMixSpec(evaluation) : null;

  // E-16 — production report (requires evaluation)
  const report = evaluation ? generateProductionReport(evaluation) : null;

  // Groove MIDI (main, 4 bars)
  const grooveMidi = Buffer.from(groovePlanToMidi(grooves.main, bpm, 4));

  // E-19 — chord MIDI (2 loops, 4 beats per chord)
  const { buffer: chordMidi } = exportChordProgressionToMidi(chords, { bpm, repeat: 2 });

  return {
    lane,
    bpm,
    grooves,
    fingerprints,
    arc,
    humanized,
    interpolated,
    samplePack,
    chords,
    mixSpec,
    report,
    grooveMidi,
    chordMidi,
  };
}
