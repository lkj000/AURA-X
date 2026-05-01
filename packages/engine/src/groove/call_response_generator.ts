// Call-and-Response Pattern Generator — E-35
// Generates a 16-step binary response pattern that interlocks with a call
// pattern by preferring to fire on steps where the call is silent.
//
// Algorithm:
//   1. Partition 16 steps into silentSteps (call=0) and activeSteps (call=1).
//   2. Select `round(fillRatio × |silentSteps|)` response hits from the silent
//      pool — the complementary fill.
//   3. Select `round(OVERLAP_RATIO × |activeSteps|)` additional hits from the
//      active pool — a small rhythmic overlap for groove cohesion.
//   4. All selections are deterministic via FNV-1a hash seeded by lane +
//      voice names + density.
//
// Density → fill ratio: sparse 0.40 | medium 0.60 | dense 0.80
// Overlap ratio: fixed 0.10 of call-active steps
//
// Complement score = responseHits on silent steps / totalResponseHits
// Overlap  score  = responseHits on active steps  / totalResponseHits
// Invariant: complement + overlap == 1.0

import { hashString } from "../_utils";
import { LANE_GRAMMARS } from "../types";
import type { Lane, VoiceName, CallAndResponse } from "../types";

export interface CallResponseOptions {
  callPattern?: readonly number[];   // 16-step binary; defaults to lane grammar voice
  callVoice?:   VoiceName;           // default "log"
  respVoice?:   VoiceName;           // default "hat"
  density?:     "sparse" | "medium" | "dense";   // default "medium"
}

const FILL_RATIO: Record<string, number> = { sparse: 0.40, medium: 0.60, dense: 0.80 };
const OVERLAP_RATIO = 0.10;

function grammarPattern(lane: Lane, voice: VoiceName): number[] {
  const g    = LANE_GRAMMARS[lane];
  const idxs = voice === "kick" ? g.kick : voice === "hat" ? g.hat :
               voice === "shaker" ? g.shaker : g.log;
  const p    = new Array<number>(16).fill(0);
  for (const i of idxs) p[i] = 1;
  return p;
}

function selectDeterministic(pool: number[], count: number, seed: string): number[] {
  const available = [...pool];
  const selected: number[] = [];
  for (let i = 0; selected.length < count && available.length > 0; i++) {
    const h   = hashString(`${seed}_${i}`);
    const idx = Math.floor(h * available.length);
    selected.push(available.splice(idx, 1)[0]);
  }
  return selected;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateCallResponse(lane: Lane, options: CallResponseOptions = {}): CallAndResponse {
  const density   = options.density   ?? "medium";
  const callVoice = options.callVoice ?? "log";
  const respVoice = options.respVoice ?? "hat";

  const rawCall = options.callPattern
    ? Array.from(options.callPattern).slice(0, 16)
    : grammarPattern(lane, callVoice);

  // Pad to 16 if shorter
  while (rawCall.length < 16) rawCall.push(0);

  const silentSteps: number[] = [];
  const activeSteps: number[] = [];
  for (let i = 0; i < 16; i++) {
    (rawCall[i] === 1 ? activeSteps : silentSteps).push(i);
  }

  const fillRatio       = FILL_RATIO[density];
  const targetSilent    = Math.round(fillRatio * silentSteps.length);
  const targetOverlap   = Math.max(0, Math.round(OVERLAP_RATIO * activeSteps.length));
  const seed            = `${lane}_${callVoice}_${respVoice}_${density}`;

  const fromSilent  = selectDeterministic(silentSteps, targetSilent,  `${seed}_silent`);
  const fromActive  = selectDeterministic(activeSteps, targetOverlap, `${seed}_overlap`);

  const response = new Array<number>(16).fill(0);
  for (const s of fromSilent)  response[s] = 1;
  for (const s of fromActive)  response[s] = 1;

  const totalHits  = response.reduce((sum, v) => sum + v, 0);
  const overlapHits = totalHits > 0
    ? response.reduce((sum, v, i) => sum + (v === 1 && rawCall[i] === 1 ? 1 : 0), 0)
    : 0;
  const compHits = totalHits - overlapHits;

  return {
    call:       [...rawCall],
    response,
    callVoice,
    respVoice,
    complement: totalHits > 0 ? compHits    / totalHits : 0,
    overlap:    totalHits > 0 ? overlapHits / totalHits : 0,
  };
}
