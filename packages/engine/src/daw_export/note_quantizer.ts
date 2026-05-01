// Note Quantizer — E-46
// Snaps MidiNoteEvent startTick positions to the nearest musical grid with
// variable strength.
//
// gridTicks = ticksPerBeat × 4 / denominator
//   "1/4"  → 480 × 4/4  = 480 ticks
//   "1/8"  → 480 × 4/8  = 240 ticks
//   "1/16" → 480 × 4/16 = 120 ticks  (default)
//   "1/32" → 480 × 4/32 =  60 ticks
//
// quantizedTick = max(0, startTick + round((nearest − startTick) × strength))
// shift         = quantizedTick − startTick

import type { MidiNoteEvent, QuantizeResolution, QuantizeNoteResult } from "../types";

export interface QuantizeNoteOptions {
  resolution?:   QuantizeResolution;   // default "1/16"
  strength?:     number;               // default 1.0 — [0, 1]
  ticksPerBeat?: number;               // default 480
}

const DENOMINATORS: Record<QuantizeResolution, number> = {
  "1/4": 4, "1/8": 8, "1/16": 16, "1/32": 32,
};

// ── Public API ────────────────────────────────────────────────────────────────

export function quantizeNotes(
  notes: MidiNoteEvent[],
  options: QuantizeNoteOptions = {},
): QuantizeNoteResult {
  const resolution  = options.resolution   ?? "1/16";
  const strength    = Math.max(0, Math.min(1, options.strength    ?? 1.0));
  const tpb         = Math.max(1, Math.round(options.ticksPerBeat ?? 480));
  const gridTicks   = (tpb * 4) / DENOMINATORS[resolution];

  const originalTicks: number[] = [];
  const shiftedTicks:  number[] = [];
  const quantized: MidiNoteEvent[] = notes.map((note) => {
    const orig    = note.startTick;
    const nearest = Math.round(orig / gridTicks) * gridTicks;
    const shift   = Math.round((nearest - orig) * strength);
    const newTick = Math.max(0, orig + shift);
    originalTicks.push(orig);
    shiftedTicks.push(newTick - orig);
    return { ...note, startTick: newTick };
  });

  return { notes: quantized, originalTicks, shiftedTicks, strength };
}
