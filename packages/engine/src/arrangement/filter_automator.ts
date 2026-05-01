// Filter Automation Generator — E-26
// Converts the per-section filterHz values embedded in an ArrangementArc into
// a smooth bar-indexed LP filter cutoff automation curve.
//
// For each section:
//   • point at startBar  — previous section's cutoff (or INITIAL_HZ for bar 0)
//   • point at endBar    — this section's target cutoffHz
//
// The result is a list of FilterPoints in ascending bar order with no duplicate
// bar values.  A DAW can linearly interpolate between adjacent points to produce
// the characteristic Amapiano filter sweep (closed intro → open drop →
// filtered breakdown → explosive second drop → fade out).
//
// INITIAL_HZ (300 Hz) places the filter in a "sealed" state before bar 0 so
// that the track "opens up" from the very first note.

import type { ArrangementArc, FilterPoint, FilterAutomation } from "../types";

const INITIAL_HZ = 300;   // filter cutoff before the arrangement begins

// ── Public API ────────────────────────────────────────────────────────────────

export function generateFilterAutomation(arc: ArrangementArc): FilterAutomation {
  const { sections, totalBars } = arc;
  const raw: FilterPoint[] = [];
  let prevHz = INITIAL_HZ;

  for (const section of sections) {
    raw.push({ bar: section.startBar, cutoffHz: Math.round(prevHz) });
    raw.push({ bar: section.endBar,   cutoffHz: Math.round(section.filterHz) });
    prevHz = section.filterHz;
  }

  // Collapse shared section-boundary bars: the later write wins
  const points: FilterPoint[] = [];
  for (const p of raw) {
    if (points.length > 0 && points[points.length - 1].bar === p.bar) {
      points[points.length - 1] = p;
    } else {
      points.push(p);
    }
  }

  return { totalBars, points };
}
