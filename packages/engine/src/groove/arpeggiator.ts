// MIDI Arpeggiator — E-56
// Generates an arpeggiated note sequence from a chord.
//
// Modes:
//   up      — lowest to highest, cycling
//   down    — highest to lowest, cycling
//   up_down — up then back down, no endpoint repeat: [C,E,G,E] per cycle
//   down_up — down then back up, no endpoint repeat
//   random  — deterministic shuffle via seed (hashString-based Fisher-Yates)
//
// octaves: 1–4 — expands the note pool upward by adding +12n copies.
// steps: total ArpNote entries generated (defaults to pattern length).
// duration: each note lasts ticksPerStep × 0.9 ticks (10 % gap for articulation).

import type { ArpMode, ArpNote, ArpResult } from "../types";
import { hashString } from "../_utils";

export interface ArpOptions {
  notes?:        number[];  // MIDI note numbers (default [])
  mode?:         ArpMode;   // default "up"
  steps?:        number;    // total steps to emit (default = pattern length)
  octaves?:      number;    // 1–4 (default 1)
  ticksPerStep?: number;    // default 120 (16th note at 480 ppq)
  velocity?:     number;    // 1–127 (default 100)
  startTick?:    number;    // default 0
  seed?:         string;    // for random mode (default "arp")
}

function buildPattern(expanded: number[], mode: ArpMode, seed: string): number[] {
  switch (mode) {
    case "up":
      return [...expanded];
    case "down":
      return [...expanded].reverse();
    case "up_down": {
      if (expanded.length <= 1) return [...expanded];
      const rev = [...expanded].reverse().slice(1, -1);
      return [...expanded, ...rev];
    }
    case "down_up": {
      const down = [...expanded].reverse();
      if (down.length <= 1) return down;
      const up = [...expanded].slice(1, -1);
      return [...down, ...up];
    }
    case "random": {
      const arr = [...expanded];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(hashString(`${seed}-${i}`) * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateArpeggio(options: ArpOptions = {}): ArpResult {
  const raw       = options.notes       ?? [];
  const mode      = options.mode        ?? "up";
  const octaves   = Math.max(1, Math.min(4, Math.round(options.octaves      ?? 1)));
  const tps       = Math.max(1, Math.round(options.ticksPerStep ?? 120));
  const velocity  = Math.max(1, Math.min(127, Math.round(options.velocity   ?? 100)));
  const startTick = Math.max(0, Math.round(options.startTick   ?? 0));
  const seed      = options.seed ?? "arp";

  if (raw.length === 0) {
    return { notes: [], mode, steps: 0, octaves };
  }

  const sorted = [...new Set(
    raw.map((n) => Math.max(0, Math.min(127, Math.round(n))))
  )].sort((a, b) => a - b);

  const expanded: number[] = [];
  for (let o = 0; o < octaves; o++) {
    for (const n of sorted) {
      const note = n + o * 12;
      if (note <= 127) expanded.push(note);
    }
  }

  const pattern  = buildPattern(expanded, mode, seed);
  const patLen   = pattern.length;
  const steps    = Math.max(1, Math.round(options.steps ?? patLen));
  const durTicks = Math.max(1, Math.round(tps * 0.9));

  const notes: ArpNote[] = Array.from({ length: steps }, (_, i) => ({
    midiNote:      pattern[i % patLen],
    tick:          startTick + i * tps,
    durationTicks: durTicks,
    velocity,
  }));

  return { notes, mode, steps, octaves };
}
