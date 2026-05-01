// Tempo Humanizer — E-13
// Converts a GroovePlan into a HumanizedPattern by applying swing-aware
// per-hit timing offsets and velocity variation.
//
// Timing model:
//   step grid  = 60_000 / (bpm * 4) ms per 16th-note step
//   swing      = even off-beat steps (1,3,5,…) pushed late by swingRatio
//   laidback   = global +offset for "laidback_hat_pull" microtiming
//   forward    = global −offset for "forward_shuffle" microtiming
//   per-voice  = voice-specific jitter proportional to humanness
//
// Velocity model:
//   deterministic per-step pseudo-noise via FNV-1a hash of (lane+step+voice)
//   scaled to [1−0.3×humanness, 1+0.3×humanness]

import { clamp, hashString } from "../_utils";
import type { Lane, GroovePlan, VoiceName, HumanizedHit, HumanizedPattern } from "../types";

const TPQ = 480;   // MIDI ticks per quarter note

export interface HumanizerOptions {
  humanness?:    number;   // [0, 1] — default 0.5
  bpm?:          number;   // overrides plan.swing-derived BPM
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Per-voice max timing jitter in ms at humanness=1.0
const VOICE_JITTER_MS: Record<VoiceName, number> = {
  kick:   2.5,
  log:    3.0,
  hat:    6.0,
  shaker: 1.5,
};

// Forward/laidback global shift in ms (before humanness scale)
const MICROTIMING_SHIFT: Record<string, number> = {
  forward_shuffle:  -4,
  laidback_hat_pull: 5,
  straight:          0,
};

function pseudoNoise(seed: string): number {
  // returns deterministic float in (-1, 1)
  const h = hashString(seed);
  return (h * 2) - 1;
}

function msToTicks(ms: number, bpm: number): number {
  // ticks = ms × (bpm/60) × (TPQ/1000)
  return ms * (bpm / 60) * (TPQ / 1000);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function humanizePattern(plan: GroovePlan, options: HumanizerOptions = {}): HumanizedPattern {
  const humanness = clamp(options.humanness ?? 0.5);
  const bpm       = options.bpm ?? 112;   // caller should supply; sensible default

  const stepMs    = 60_000 / (bpm * 4);   // duration of one 16th step in ms
  const swingMs   = stepMs * (plan.swing - 0.5) * 2;   // push off-beats by swing excess

  const microtimingShift = MICROTIMING_SHIFT[plan.microtimingProfile] ?? 0;
  const globalShiftMs    = microtimingShift * humanness;

  const voices: Array<{ name: VoiceName; pattern: readonly number[] }> = [
    { name: "kick",   pattern: plan.kickPattern },
    { name: "hat",    pattern: plan.hatPattern },
    { name: "shaker", pattern: plan.shakerPattern },
    { name: "log",    pattern: plan.logDrumPattern },
  ];

  const hits: HumanizedHit[] = [];

  for (const { name, pattern } of voices) {
    const maxJitter = VOICE_JITTER_MS[name] * humanness;

    for (let step = 0; step < 16; step++) {
      if (!pattern[step]) continue;

      // Swing: off-beat steps (odd index) pushed late
      const isOffBeat    = step % 2 === 1;
      const swingOffset  = isOffBeat ? swingMs : 0;

      // Per-hit deterministic jitter
      const jitterSeed   = `${plan.lane}|${name}|${step}`;
      const jitter       = pseudoNoise(jitterSeed) * maxJitter;

      const offsetMs     = clamp(swingOffset + globalShiftMs + jitter, -stepMs * 0.4, stepMs * 0.4);
      const offsetTicks  = msToTicks(offsetMs, bpm);

      // Velocity variation
      const velSeed      = `${plan.lane}|vel|${name}|${step}`;
      const velNoise     = pseudoNoise(velSeed) * 0.3 * humanness;
      const velocityScale = clamp(1 + velNoise, 0.7, 1.3);

      hits.push({ step, voice: name, offsetMs, offsetTicks, velocityScale });
    }
  }

  // Sort by step, then by voice order for determinism
  hits.sort((a, b) => a.step - b.step || voices.findIndex((v) => v.name === a.voice) - voices.findIndex((v) => v.name === b.voice));

  return { lane: plan.lane, bpm, hits, swingMs, humanness };
}
