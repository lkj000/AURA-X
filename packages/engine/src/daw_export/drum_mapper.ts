// MIDI Drum Mapper — E-55
// Maps logical drum parts to MIDI note numbers for four common layouts.
//
// Layouts:
//   gm      — General MIDI (channel 10, notes 35–81)
//   tr808   — Roland TR-808 / classic drum machine mapping
//   tr909   — Roland TR-909 style mapping
//   ableton — Ableton Live default drum rack mapping

import type { DrumPart, DrumLayout, DrumMapEntry, DrumMapResult } from "../types";

const PARTS: DrumPart[] = [
  "kick", "snare", "hihat_closed", "hihat_open",
  "clap", "rim", "tom_high", "tom_mid", "tom_low",
  "crash", "ride", "log_drum", "shaker", "perc",
];

type LayoutTable = Record<DrumPart, [number, string]>;   // [midiNote, name]

const LAYOUTS: Record<DrumLayout, LayoutTable> = {
  gm: {
    kick:         [36, "Bass Drum 1"],
    snare:        [38, "Acoustic Snare"],
    hihat_closed: [42, "Closed Hi-Hat"],
    hihat_open:   [46, "Open Hi-Hat"],
    clap:         [39, "Hand Clap"],
    rim:          [37, "Side Stick"],
    tom_high:     [50, "High Tom"],
    tom_mid:      [47, "Mid Tom"],
    tom_low:      [43, "Low Tom"],
    crash:        [49, "Crash Cymbal 1"],
    ride:         [51, "Ride Cymbal 1"],
    log_drum:     [56, "Cowbell"],
    shaker:       [70, "Maracas"],
    perc:         [60, "Hi Bongo"],
  },
  tr808: {
    kick:         [36, "808 Kick"],
    snare:        [40, "808 Snare"],
    hihat_closed: [42, "808 Closed HH"],
    hihat_open:   [46, "808 Open HH"],
    clap:         [39, "808 Clap"],
    rim:          [37, "808 Rim"],
    tom_high:     [50, "808 High Tom"],
    tom_mid:      [47, "808 Mid Tom"],
    tom_low:      [41, "808 Low Tom"],
    crash:        [49, "808 Cymbal"],
    ride:         [51, "808 Ride"],
    log_drum:     [35, "808 Low Kick"],
    shaker:       [69, "808 Shaker"],
    perc:         [62, "808 Perc"],
  },
  tr909: {
    kick:         [36, "909 Kick"],
    snare:        [38, "909 Snare"],
    hihat_closed: [42, "909 Closed HH"],
    hihat_open:   [46, "909 Open HH"],
    clap:         [39, "909 Clap"],
    rim:          [37, "909 Rim"],
    tom_high:     [48, "909 High Tom"],
    tom_mid:      [45, "909 Mid Tom"],
    tom_low:      [41, "909 Low Tom"],
    crash:        [49, "909 Crash"],
    ride:         [51, "909 Ride"],
    log_drum:     [56, "909 Cowbell"],
    shaker:       [70, "909 Shaker"],
    perc:         [63, "909 Rim Shot"],
  },
  ableton: {
    kick:         [36, "Kick"],
    snare:        [38, "Snare"],
    hihat_closed: [42, "Closed HH"],
    hihat_open:   [46, "Open HH"],
    clap:         [39, "Clap"],
    rim:          [37, "Rim"],
    tom_high:     [50, "High Tom"],
    tom_mid:      [47, "Mid Tom"],
    tom_low:      [43, "Low Tom"],
    crash:        [49, "Crash"],
    ride:         [55, "Ride"],
    log_drum:     [56, "Log Drum"],
    shaker:       [70, "Shaker"],
    perc:         [60, "Perc"],
  },
};

// ── Public API ────────────────────────────────────────────────────────────────

export function buildDrumMap(layout: DrumLayout): DrumMapResult {
  const table   = LAYOUTS[layout];
  const entries: DrumMapEntry[] = PARTS.map((part) => {
    const [midiNote, name] = table[part];
    return { part, midiNote, name };
  });
  return { layout, entries };
}

export function resolveDrumNote(part: DrumPart, layout: DrumLayout): number {
  return LAYOUTS[layout][part][0];
}
