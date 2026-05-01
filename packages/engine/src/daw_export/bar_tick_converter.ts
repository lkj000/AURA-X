// Bar-to-Tick Converter — E-41
// Maps ArrangementArc section bar positions to absolute MIDI tick boundaries.
//
// ticksPerBar  = ticksPerBeat × beatsPerBar
// startTick(s) = s.startBar × ticksPerBar
// endTick(s)   = s.endBar   × ticksPerBar
// dropTick     = arc.dropBar × ticksPerBar
// totalTicks   = arc.totalBars × ticksPerBar

import type { ArrangementArc, SectionName, TickMap } from "../types";

export interface TickMapOptions {
  ticksPerBeat?: number;   // default 480 (PPQ)
  beatsPerBar?:  number;   // default 4
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildTickMap(arc: ArrangementArc, options: TickMapOptions = {}): TickMap {
  const ticksPerBeat = Math.max(1, Math.round(options.ticksPerBeat ?? 480));
  const beatsPerBar  = Math.max(1, Math.round(options.beatsPerBar  ?? 4));
  const ticksPerBar  = ticksPerBeat * beatsPerBar;

  const sections = arc.sections.map((s) => ({
    section:   s.name as SectionName,
    startTick: s.startBar * ticksPerBar,
    endTick:   s.endBar   * ticksPerBar,
    bars:      s.endBar   - s.startBar,
  }));

  return {
    sections,
    dropTick:   arc.dropBar    * ticksPerBar,
    totalTicks: arc.totalBars  * ticksPerBar,
    ticksPerBeat,
    ticksPerBar,
    beatsPerBar,
  };
}
