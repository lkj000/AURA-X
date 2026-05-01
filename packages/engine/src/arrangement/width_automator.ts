// Stereo Width Automator — E-31
// Generates a bar-indexed M/S stereo width automation curve from an
// ArrangementArc.  Width is a multiplier applied to the Side signal:
//   < 1.0 → narrower (toward mono)
//   1.0   → unity (unchanged)
//   > 1.0 → wider (enhanced stereo)
//
// Section width targets:
//   intro       0.85  — establishing, modest spread
//   build1      1.00  — unity, opening up
//   drop1       1.50  — wide open — maximum impact
//   breakdown   0.70  — narrow, intimate, focused
//   build2      1.10  — slightly wider than unity — re-energising
//   drop2       1.60  — widest — climactic second drop
//   outro       1.00  — returning to centre
//   outro_fade  0.60  — narrowing toward mono as track fades
//
// INITIAL_WIDTH (0.75) places the stereo image in a "pre-intro" focused state
// before bar 0 so the track "opens" from the first note.
//
// Algorithm mirrors filter_automator: two WidthPoints per section
// (startBar at previous width → endBar at section target); shared
// section-boundary bars are collapsed (later write wins).

import type { ArrangementArc, SectionName, WidthPoint, WidthAutomation } from "../types";

const INITIAL_WIDTH = 0.75;

const SECTION_WIDTHS: Record<SectionName, number> = {
  intro:      0.85,
  build1:     1.00,
  drop1:      1.50,
  breakdown:  0.70,
  build2:     1.10,
  drop2:      1.60,
  outro:      1.00,
  outro_fade: 0.60,
};

// ── Public API ────────────────────────────────────────────────────────────────

export function generateWidthAutomation(arc: ArrangementArc): WidthAutomation {
  const { sections, totalBars } = arc;
  const raw: WidthPoint[] = [];
  let prevWidth = INITIAL_WIDTH;

  for (const section of sections) {
    const targetWidth = SECTION_WIDTHS[section.name];
    raw.push({ bar: section.startBar, width: prevWidth });
    raw.push({ bar: section.endBar,   width: targetWidth });
    prevWidth = targetWidth;
  }

  // Collapse shared section-boundary bars — later point wins
  const points: WidthPoint[] = [];
  for (const p of raw) {
    if (points.length > 0 && points[points.length - 1].bar === p.bar) {
      points[points.length - 1] = p;
    } else {
      points.push(p);
    }
  }

  return { totalBars, points };
}
