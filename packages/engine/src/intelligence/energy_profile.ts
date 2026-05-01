// Groove Energy Profile — E-48
// Sums weighted binary stem layers into a normalized 16-step energy curve.
//
// Algorithm:
//   raw[i] = Σ (layer.weight × layer.pattern[i])   for each layer
//   curve  = raw / max(raw)   (or all-zero if max = 0)
//
// Stats: peakStep, meanEnergy, peakEnergy, activeSteps derived from curve.

import type { EnergyLayer, EnergyProfile } from "../types";

// ── Public API ────────────────────────────────────────────────────────────────

export function computeEnergyProfile(layers: EnergyLayer[]): EnergyProfile {
  const raw = new Array<number>(16).fill(0);

  for (const layer of layers) {
    const w   = layer.weight ?? 1.0;
    const pat = Array.from(layer.pattern).slice(0, 16);
    while (pat.length < 16) pat.push(0);
    for (let i = 0; i < 16; i++) raw[i] += w * (pat[i] === 1 ? 1 : 0);
  }

  const maxRaw = Math.max(...raw);
  const curve  = maxRaw > 0 ? raw.map((v) => v / maxRaw) : new Array(16).fill(0);

  const peakEnergy  = maxRaw > 0 ? 1.0 : 0;
  const peakStep    = maxRaw > 0 ? curve.indexOf(1.0) : -1;
  const meanEnergy  = curve.reduce((s, v) => s + v, 0) / 16;
  const activeSteps = curve.filter((v) => v > 0).length;

  return { curve, peakStep, meanEnergy, peakEnergy, activeSteps };
}
