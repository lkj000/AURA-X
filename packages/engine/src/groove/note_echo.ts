// Note Echo — E-59
// Generates delay repeats of a MIDI note with exponential velocity decay.
//
// Each echo i (1-indexed) is placed at:
//   tick     = startTick + i × delayTicks
//   velocity = round(initialVelocity × decay^i)
//
// Generation stops early when velocity falls below minVelocity.
// The original note is NOT included in the output — only the echoes.

import type { EchoNote, EchoResult } from "../types";

export interface EchoOptions {
  midiNote?:      number;  // default 60
  startTick?:     number;  // tick of the source note (default 0)
  velocity?:      number;  // velocity of the source note (default 100)
  durationTicks?: number;  // duration of each echo note (default 120)
  delayTicks?:    number;  // inter-echo spacing in ticks (default 480)
  repeats?:       number;  // maximum echo count (default 3)
  decay?:         number;  // velocity multiplier per repeat, 0–1 (default 0.6)
  minVelocity?:   number;  // stop generating below this threshold (default 1)
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateEcho(options: EchoOptions = {}): EchoResult {
  const midiNote      = Math.max(0, Math.min(127, Math.round(options.midiNote      ?? 60)));
  const startTick     = Math.max(0, Math.round(options.startTick     ?? 0));
  const initVelocity  = Math.max(1, Math.min(127, Math.round(options.velocity      ?? 100)));
  const durationTicks = Math.max(1, Math.round(options.durationTicks ?? 120));
  const delayTicks    = Math.max(1, Math.round(options.delayTicks    ?? 480));
  const repeats       = Math.max(0, Math.round(options.repeats       ?? 3));
  const decay         = Math.max(0, Math.min(1, options.decay        ?? 0.6));
  const minVelocity   = Math.max(1, Math.min(127, Math.round(options.minVelocity   ?? 1)));

  const echoes: EchoNote[] = [];

  for (let i = 1; i <= repeats; i++) {
    const velocity = Math.round(initVelocity * Math.pow(decay, i));
    if (velocity < minVelocity) break;

    echoes.push({
      midiNote,
      tick:         startTick + i * delayTicks,
      durationTicks,
      velocity:     Math.min(127, velocity),
      repeatIndex:  i,
    });
  }

  return { echoes, repeats, delayTicks, decay };
}
