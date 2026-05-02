// Tempo Ramp Generator — E-54
// Produces a BPM automation map with one point per bar across a range.
//
// Shapes (t ∈ [0, 1]):
//   linear      → bpm = startBpm + t × (endBpm − startBpm)
//   exponential → bpm = startBpm × (endBpm / startBpm)^t
//                       (degrades to linear when startBpm = endBpm)
//
// Points: one per bar boundary, indices 0 … totalBars (inclusive).
// tick(bar) = (startBar + bar) × ticksPerBeat × beatsPerBar

import type { TempoRampShape, TempoMap } from "../types";

export interface TempoRampOptions {
  startBpm?:     number;          // default 114
  endBpm?:       number;          // default 114
  startBar?:     number;          // default 0
  totalBars?:    number;          // default 16 — number of bars to span
  shape?:        TempoRampShape;  // default "linear"
  ticksPerBeat?: number;          // default 480
  beatsPerBar?:  number;          // default 4
}

function interpolate(shape: TempoRampShape, t: number, start: number, end: number): number {
  if (shape === "exponential" && start > 0 && end > 0) {
    return start * Math.pow(end / start, t);
  }
  return start + t * (end - start);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateTempoRamp(options: TempoRampOptions = {}): TempoMap {
  const startBpm   = Math.max(20, options.startBpm    ?? 114);
  const endBpm     = Math.max(20, options.endBpm      ?? 114);
  const startBar   = Math.max(0,  Math.round(options.startBar   ?? 0));
  const totalBars  = Math.max(1,  Math.round(options.totalBars  ?? 16));
  const shape      = options.shape       ?? "linear";
  const tpb        = Math.max(1, Math.round(options.ticksPerBeat ?? 480));
  const bpb        = Math.max(1, Math.round(options.beatsPerBar  ?? 4));
  const ticksPerBar = tpb * bpb;

  const points = Array.from({ length: totalBars + 1 }, (_, i) => {
    const t   = totalBars > 0 ? i / totalBars : 0;
    const bpm = Math.round(interpolate(shape, t, startBpm, endBpm) * 10) / 10;
    const tick = (startBar + i) * ticksPerBar;
    return { bar: startBar + i, tick, bpm };
  });

  return { points, startBpm, endBpm, shape, totalBars, ticksPerBeat: tpb, beatsPerBar: bpb };
}
