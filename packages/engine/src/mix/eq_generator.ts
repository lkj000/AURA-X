// EQ Curve Generator — E-29
// Generates 4-band parametric EQ settings for each stem, adjusted by lane
// character and MixProfile.
//
// Band layout (same for every stem):
//   [0] highpass  — rolls off below the stem's useful low-end floor
//   [1] peak/body — punch / warmth in the low-mid zone
//   [2] peak/mid  — presence cut or boost in the upper-mid zone
//   [3] highshelf — air / brightness control at high frequencies
//
// MixProfile adjusts gainDb on body (band 1) and air shelf (band 3):
//   raw_street        → body +1.5,  air −1.0
//   bounce_club       → body +0.5,  air +0.5
//   luxury_noir       → body −0.5,  air +2.0
//   spiritual_organic → body  0.0,  air +1.0
//   dark_tribal       → body +1.0,  air −0.5
//   crossover_rb      → body  0.0,  air +0.5
//
// Lane shifts the highpass corner (sub_bass only) based on the lane's
// sub-bass character — gqom_fusion / sgija extend deepest; private_school
// / mbiraiano trim tighter for clarity.
//
// All gainDb values are clamped to [−24, +24].

import { clamp } from "../_utils";
import type { Lane, MixProfile, StemName, EqBand, EqBandType, StemEq, EqSpec } from "../types";

const STEM_ORDER: StemName[] = ["sub_bass", "log_drum", "chord_pad", "percussion", "air"];

// ── Base EQ templates (at reference mix profile "crossover_rb") ───────────────

interface BandDef { type: EqBandType; freqHz: number; gainDb: number; q: number }

const BASE_EQ: Record<StemName, [BandDef, BandDef, BandDef, BandDef]> = {
  sub_bass:   [
    { type: "lowcut",    freqHz:   30, gainDb:  0,    q: 0.70 },
    { type: "peak",      freqHz:   65, gainDb: +3.0,  q: 2.00 },  // fundamental punch
    { type: "peak",      freqHz:  200, gainDb: -2.5,  q: 1.50 },  // mud cut
    { type: "highcut",   freqHz:  300, gainDb:  0,    q: 0.70 },
  ],
  log_drum:   [
    { type: "lowcut",    freqHz:   60, gainDb:  0,    q: 0.70 },
    { type: "peak",      freqHz:  180, gainDb: +4.0,  q: 1.50 },  // body / attack
    { type: "peak",      freqHz: 1000, gainDb: +2.0,  q: 2.00 },  // click / transient
    { type: "highcut",   freqHz: 8000, gainDb:  0,    q: 0.70 },
  ],
  chord_pad:  [
    { type: "lowcut",    freqHz:  100, gainDb:  0,    q: 0.70 },
    { type: "peak",      freqHz:  400, gainDb: +1.5,  q: 0.80 },  // warmth
    { type: "peak",      freqHz: 2000, gainDb: -1.0,  q: 1.50 },  // nasal cut
    { type: "highshelf", freqHz: 6000, gainDb: +1.0,  q: 0.70 },  // air
  ],
  percussion: [
    { type: "lowcut",    freqHz:  120, gainDb:  0,    q: 0.70 },
    { type: "peak",      freqHz:  800, gainDb: +2.0,  q: 2.00 },  // presence
    { type: "peak",      freqHz: 5000, gainDb: +1.5,  q: 1.50 },  // sizzle
    { type: "highshelf", freqHz:10000, gainDb: +2.0,  q: 0.70 },
  ],
  air:        [
    { type: "lowcut",    freqHz:  200, gainDb:  0,    q: 0.70 },
    { type: "lowshelf",  freqHz:  500, gainDb: -2.0,  q: 0.70 },  // thin lows
    { type: "peak",      freqHz: 3000, gainDb: +1.0,  q: 1.00 },  // presence
    { type: "highshelf", freqHz:12000, gainDb: +3.0,  q: 0.70 },  // shimmer
  ],
};

// ── Profile body/air offsets ──────────────────────────────────────────────────

const PROFILE_BODY: Record<MixProfile, number> = {
  raw_street:        +1.5,
  bounce_club:       +0.5,
  luxury_noir:       -0.5,
  spiritual_organic:  0.0,
  dark_tribal:       +1.0,
  crossover_rb:       0.0,
};

const PROFILE_AIR: Record<MixProfile, number> = {
  raw_street:        -1.0,
  bounce_club:       +0.5,
  luxury_noir:       +2.0,
  spiritual_organic: +1.0,
  dark_tribal:       -0.5,
  crossover_rb:      +0.5,
};

// ── Lane sub-bass HP trim (Hz offset on sub_bass band 0 corner) ───────────────

const LANE_HP_TRIM: Record<Lane, number> = {
  private_school:       +10,   // clarity over depth
  sgija:                 -5,   // sub-heavy
  bacardi:                0,
  stixx_sgija:           -5,
  mbiraiano:            +10,   // mbira-forward — tighten sub
  three_step:             0,
  gqom_fusion:          -10,   // deepest sub floor
  hybrid_rnb_amapiano:  +5,
};

// ── Public API ────────────────────────────────────────────────────────────────

export function generateEqSpec(lane: Lane, mixProfile: MixProfile): EqSpec {
  const bodyOffset = PROFILE_BODY[mixProfile];
  const airOffset  = PROFILE_AIR[mixProfile];
  const hpTrim     = LANE_HP_TRIM[lane];

  const stems: StemEq[] = STEM_ORDER.map((stem) => {
    const bands: EqBand[] = BASE_EQ[stem].map((b, i) => {
      let gainDb = b.gainDb;

      // Band 1 — body / warmth: apply profile body offset (skip cut filters)
      if (i === 1 && b.type !== "lowcut" && b.type !== "highcut") {
        gainDb = clamp(gainDb + bodyOffset, -24, 24);
      }
      // Band 3 — air / brightness: apply profile air offset on shelf bands
      if (i === 3 && (b.type === "highshelf" || b.type === "highcut")) {
        if (b.type === "highshelf") gainDb = clamp(gainDb + airOffset, -24, 24);
      }

      // Lane HP trim: shift sub_bass band-0 corner frequency
      let freqHz = b.freqHz;
      if (stem === "sub_bass" && i === 0) {
        freqHz = Math.max(20, Math.min(200, freqHz + hpTrim));
      }

      return { type: b.type, freqHz, gainDb, q: b.q };
    });

    return { stem, bands };
  });

  return { lane, mixProfile, stems };
}
