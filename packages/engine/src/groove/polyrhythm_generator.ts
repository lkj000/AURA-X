// Polyrhythm Layer Generator — E-44
// Generates two independent Euclidean layers that share a common bar length,
// producing a classical cross-rhythm (e.g. 3:4, 4:3, 3:2).
//
// Each layer:
//   pattern  — Euclidean(hits, steps) binary rhythm
//   tickGrid — tick position of each step:  round(i × ticksPerBar / steps)
//
// Default: 3-against-4 (layerA: 3 steps, layerB: 4 steps, both fully active)

import { generateEuclidean }                  from "./euclidean_rhythm";
import type { PolyrhythmLayer, PolyrhythmResult } from "../types";

export interface PolyrhythmOptions {
  hitsA?:       number;   // default = stepsA (fully active)
  stepsA?:      number;   // default 3
  offsetA?:     number;   // default 0 — Euclidean rotation for layer A
  hitsB?:       number;   // default = stepsB
  stepsB?:      number;   // default 4
  offsetB?:     number;   // default 0 — Euclidean rotation for layer B
  ticksPerBar?: number;   // default 1920 (480 PPQ × 4 beats)
}

function buildLayer(
  hits: number, steps: number, offset: number, ticksPerBar: number,
): PolyrhythmLayer {
  const { pattern } = generateEuclidean(hits, steps, { offset });
  const tickGrid    = Array.from({ length: steps }, (_, i) =>
    Math.round((i * ticksPerBar) / steps),
  );
  return { hits, steps, pattern, tickGrid };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generatePolyrhythm(options: PolyrhythmOptions = {}): PolyrhythmResult {
  const stepsA      = Math.max(1, Math.round(options.stepsA      ?? 3));
  const stepsB      = Math.max(1, Math.round(options.stepsB      ?? 4));
  const hitsA       = Math.max(0, Math.min(stepsA, Math.round(options.hitsA  ?? stepsA)));
  const hitsB       = Math.max(0, Math.min(stepsB, Math.round(options.hitsB  ?? stepsB)));
  const offsetA     = options.offsetA     ?? 0;
  const offsetB     = options.offsetB     ?? 0;
  const ticksPerBar = Math.max(1, Math.round(options.ticksPerBar ?? 1920));

  const layerA = buildLayer(hitsA, stepsA, offsetA, ticksPerBar);
  const layerB = buildLayer(hitsB, stepsB, offsetB, ticksPerBar);

  return { layerA, layerB, ticksPerBar, ratio: `${stepsA}:${stepsB}` };
}
