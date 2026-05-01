// O.211 Perception Model
// Computes three core perceptual measures:
//   B_eff   — effective bandwidth (Bark scale, [0,1])
//   density — cognitive density (how much the ear must track, [0,1])
//   anchors — three Amapiano identity anchors: log_drum, harmonic, groove
//
// O.211 gate fires when all three constraints hold:
//   B_eff ∈ [0.20, 0.85], density ∈ [0.15, 0.75], max(anchor.strength) ≥ 0.40

import { clamp } from "../_utils";
import type {
  AudioFeatures,
  PerceptualAnchor, PerceptionReport,
  PerceptualAnchorType, DensityLabel,
} from "../types";

// ── Bark scale (Zwicker 1961 approximation) ───────────────────────────────────
// Maps Hz → critical band rate, valid for f ∈ [20, 20 000]
export function barkScale(hz: number): number {
  const f = Math.max(20, hz);
  return 13 * Math.atan(0.00076 * f) + 3.5 * Math.atan((f / 7500) ** 2);
}

const BARK_MAX = barkScale(20_000);   // ≈ 23.5

// ── O.211 constraint thresholds ───────────────────────────────────────────────
const B_EFF_MIN          = 0.20;
const B_EFF_MAX          = 0.85;
const DENSITY_MIN        = 0.15;
const DENSITY_MAX        = 0.75;
const ANCHOR_MIN_STRENGTH = 0.40;

// ── B_eff ─────────────────────────────────────────────────────────────────────
// Combines Bark-normalised centroid with energy spread across bands.
// High centroid + high-energy upper bands → wide B_eff.
export function computeBEff(features: AudioFeatures): number {
  const barkCentroid = barkScale(features.spectralCentroid) / BARK_MAX;
  const bandSpread   =
    0.45 * features.lowMidEnergy +
    0.35 * features.highEnergy +
    0.20 * features.subBassEnergy;
  return clamp(0.55 * barkCentroid + 0.45 * bandSpread);
}

// ── Perceptual density ────────────────────────────────────────────────────────
// Models cognitive load: energy level, spectral height, rhythmic complexity.
export function computePerceptualDensity(features: AudioFeatures): number {
  const spectralContrib = clamp(features.spectralCentroid / 4_000);
  return clamp(
    0.35 * features.energyRms +
    0.30 * spectralContrib +
    0.25 * features.groove.syncopationIndex +
    0.10 * features.highEnergy,
  );
}

// ── Anchor scoring ────────────────────────────────────────────────────────────

function scoreLogDrumAnchor(features: AudioFeatures): PerceptualAnchor {
  let strength: number;
  let clarity: number;

  if (features.logDrum?.isLogDrum) {
    strength = clamp(0.60 * features.logDrum.woodResonance + 0.40 * features.logDrum.confidence);
    clarity  = clamp(1 - features.logDrum.noiseRatio);
  } else if (features.logDrum) {
    strength = clamp(features.logDrum.confidence * 0.60 + features.subBassEnergy * 0.40);
    clarity  = clamp(1 - features.logDrum.noiseRatio * 1.5);
  } else {
    // Estimate from sub-bass presence alone
    strength = clamp(features.subBassEnergy * 1.5);
    clarity  = 0.25;
  }

  return { type: "log_drum", strength, clarity, isPresent: strength >= ANCHOR_MIN_STRENGTH };
}

function scoreHarmonicAnchor(features: AudioFeatures): PerceptualAnchor {
  let strength: number;
  let clarity: number;

  if (features.harmonic) {
    strength = clamp(
      0.60 * features.harmonic.amapianoCompatibility +
      0.40 * features.harmonic.harmonicRichness,
    );
    clarity = clamp(features.harmonic.harmonicRichness);
  } else {
    // Warm low-mid with limited high → some harmonic presence
    const warmth = features.lowMidEnergy > features.highEnergy ? 1.0 : 0.50;
    strength = clamp(features.lowMidEnergy * 1.8 * warmth);
    clarity  = 0.30;
  }

  return { type: "harmonic", strength, clarity, isPresent: strength >= ANCHOR_MIN_STRENGTH };
}

function scoreGrooveAnchor(features: AudioFeatures): PerceptualAnchor {
  const swing = features.groove.swingRatio;
  const sync  = features.groove.syncopationIndex;

  // All 8 Amapiano lanes use swing in [0.48, 0.58], centred around 0.52
  const swingInRange = swing >= 0.48 && swing <= 0.58;
  const swingScore   = swingInRange
    ? clamp(1 - Math.abs(swing - 0.52) / 0.06)
    : clamp(Math.max(0, 1 - Math.abs(swing - 0.52) / 0.10));

  // Valid Amapiano syncopation: [0.15, 0.70], centred around 0.40
  const syncScore = clamp(1 - Math.abs(sync - 0.40) / 0.35);

  const strength = clamp(0.55 * swingScore + 0.45 * syncScore);
  const clarity  = swingScore;

  return { type: "groove", strength, clarity, isPresent: strength >= ANCHOR_MIN_STRENGTH };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDensityLabel(d: number): DensityLabel {
  if (d < 0.25) return "sparse";
  if (d < 0.50) return "balanced";
  if (d < 0.70) return "dense";
  return "overcrowded";
}

function checkViolations(
  bEff: number,
  density: number,
  anchors: PerceptualAnchor[],
): string[] {
  const v: string[] = [];
  if (bEff < B_EFF_MIN)
    v.push(`B_eff ${bEff.toFixed(3)} below minimum ${B_EFF_MIN} — add harmonic content above 500 Hz`);
  if (bEff > B_EFF_MAX)
    v.push(`B_eff ${bEff.toFixed(3)} above maximum ${B_EFF_MAX} — reduce highs or add low-end weight`);
  if (density < DENSITY_MIN)
    v.push(`Density ${density.toFixed(3)} too sparse — add log drum and chord layers`);
  if (density > DENSITY_MAX)
    v.push(`Density ${density.toFixed(3)} overcrowded — remove conflicting elements`);
  const maxStrength = Math.max(...anchors.map((a) => a.strength));
  if (maxStrength < ANCHOR_MIN_STRENGTH)
    v.push(`No dominant anchor (max ${maxStrength.toFixed(3)} < ${ANCHOR_MIN_STRENGTH}) — strengthen log drum, harmonic pad, or groove`);
  return v;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function applyPerceptionModel(features: AudioFeatures): PerceptionReport {
  const bEff    = computeBEff(features);
  const density = computePerceptualDensity(features);

  const anchors: PerceptualAnchor[] = [
    scoreLogDrumAnchor(features),
    scoreHarmonicAnchor(features),
    scoreGrooveAnchor(features),
  ];

  const anchorStrengths: Record<PerceptualAnchorType, number> = {
    log_drum: anchors[0].strength,
    harmonic: anchors[1].strength,
    groove:   anchors[2].strength,
  };

  const dominantAnchor = (Object.keys(anchorStrengths) as PerceptualAnchorType[])
    .reduce((best, t) => anchorStrengths[t] > anchorStrengths[best] ? t : best);

  const violations = checkViolations(bEff, density, anchors);

  return {
    bEff,
    density,
    densityLabel:    toDensityLabel(density),
    anchors,
    anchorStrengths,
    dominantAnchor,
    passesGate:      violations.length === 0,
    violations,
  };
}
