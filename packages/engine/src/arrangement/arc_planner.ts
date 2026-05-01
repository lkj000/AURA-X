// Arrangement Arc Planner — E-10
// Generates a full 8-section arrangement timeline for a given Amapiano lane
// and BPM. Each section receives a GrooveVariationType assignment, an intensity
// value [0, 1], and a suggested LP filter cutoff (Hz).
//
// Default proportion template (bars are rounded to nearest integer):
//   intro       0–25%   breakdown  intensity 0.20  filterHz  800
//   build1     25–37%   build      intensity 0.50  filterHz 3000
//   drop1      37–56%   main       intensity 1.00  filterHz 18000
//   breakdown  56–63%   breakdown  intensity 0.30  filterHz 1000
//   build2     63–69%   build      intensity 0.60  filterHz 5000
//   drop2      69–88%   variation  intensity 1.00  filterHz 18000
//   outro      88–94%   fill       intensity 0.50  filterHz 8000
//   outro_fade 94–100%  breakdown  intensity 0.15  filterHz  400

import { LANE_TARGETS } from "../types";
import type { Lane, SectionName, ArrangementSection, ArrangementArc, GrooveVariationType } from "../types";

export interface ArcOptions {
  bpm?:       number;   // defaults to lane target BPM
  totalBars?: number;   // defaults to 32
}

// ─── Template ─────────────────────────────────────────────────────────────────

interface SectionTemplate {
  name:       SectionName;
  startPct:   number;
  endPct:     number;
  grooveType: GrooveVariationType;
  intensity:  number;
  filterHz:   number;
}

const TEMPLATE: SectionTemplate[] = [
  { name: "intro",      startPct: 0.00, endPct: 0.25, grooveType: "breakdown", intensity: 0.20, filterHz:   800 },
  { name: "build1",     startPct: 0.25, endPct: 0.375, grooveType: "build",    intensity: 0.50, filterHz:  3000 },
  { name: "drop1",      startPct: 0.375, endPct: 0.5625, grooveType: "main",   intensity: 1.00, filterHz: 18000 },
  { name: "breakdown",  startPct: 0.5625, endPct: 0.625, grooveType: "breakdown", intensity: 0.30, filterHz: 1000 },
  { name: "build2",     startPct: 0.625, endPct: 0.6875, grooveType: "build",  intensity: 0.60, filterHz:  5000 },
  { name: "drop2",      startPct: 0.6875, endPct: 0.875, grooveType: "variation", intensity: 1.00, filterHz: 18000 },
  { name: "outro",      startPct: 0.875, endPct: 0.9375, grooveType: "fill",   intensity: 0.50, filterHz:  8000 },
  { name: "outro_fade", startPct: 0.9375, endPct: 1.00, grooveType: "breakdown", intensity: 0.15, filterHz:  400 },
];

// ── Public API ────────────────────────────────────────────────────────────────

export function planArrangementArc(lane: Lane, options: ArcOptions = {}): ArrangementArc {
  const bpm       = options.bpm       ?? LANE_TARGETS[lane].bpm;
  const totalBars = options.totalBars ?? 32;

  const sections: ArrangementSection[] = TEMPLATE.map((t) => {
    const startBar = Math.round(t.startPct * totalBars);
    const endBar   = Math.round(t.endPct   * totalBars);
    const bars     = Math.max(1, endBar - startBar);
    return {
      name:       t.name,
      startBar,
      endBar:     startBar + bars,
      bars,
      grooveType: t.grooveType,
      intensity:  t.intensity,
      filterHz:   t.filterHz,
    };
  });

  // Fix any floating accumulation so sections are gapless
  for (let i = 1; i < sections.length; i++) {
    sections[i].startBar = sections[i - 1].endBar;
    sections[i].endBar   = sections[i].startBar + sections[i].bars;
  }
  // Clamp last section to totalBars
  const last = sections[sections.length - 1];
  last.endBar = totalBars;
  last.bars   = Math.max(1, last.endBar - last.startBar);

  const dropBar       = sections.find((s) => s.name === "drop1")!.startBar;
  const peakIntensity = Math.max(...sections.map((s) => s.intensity));

  return { lane, bpm, totalBars, sections, dropBar, peakIntensity };
}
