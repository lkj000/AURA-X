// Stem Gain Automator — E-24
// Generates per-stem gain automation curves from an ArrangementArc.
//
// Each section contributes two GainPoints: one at startBar (previous gain) and
// one at endBar (section target gain). Build sections ramp linearly; drops jump
// to full energy; breakdown drops energy while lifting atmosphere; outro_fade
// descends all stems to 0.
//
// Stems: sub_bass, log_drum, chord_pad, percussion, air

import { clamp } from "../_utils";
import type { ArrangementArc, SectionName, StemName, GainPoint, StemGainCurve, GainAutomation } from "../types";

const STEM_NAMES: StemName[] = ["sub_bass", "log_drum", "chord_pad", "percussion", "air"];

// Target gain at the END of each section (linearly reached from previous)
const SECTION_GAINS: Record<SectionName, Record<StemName, number>> = {
  intro:      { sub_bass: 0.60, log_drum: 0.65, chord_pad: 0.75, percussion: 0.55, air: 0.90 },
  build1:     { sub_bass: 0.80, log_drum: 0.85, chord_pad: 0.85, percussion: 0.75, air: 0.80 },
  drop1:      { sub_bass: 1.00, log_drum: 1.00, chord_pad: 0.90, percussion: 1.00, air: 0.65 },
  breakdown:  { sub_bass: 0.40, log_drum: 0.45, chord_pad: 0.80, percussion: 0.35, air: 1.00 },
  build2:     { sub_bass: 0.85, log_drum: 0.90, chord_pad: 0.88, percussion: 0.82, air: 0.75 },
  drop2:      { sub_bass: 1.00, log_drum: 1.00, chord_pad: 0.92, percussion: 1.00, air: 0.60 },
  outro:      { sub_bass: 0.70, log_drum: 0.70, chord_pad: 0.80, percussion: 0.65, air: 0.85 },
  outro_fade: { sub_bass: 0.00, log_drum: 0.00, chord_pad: 0.00, percussion: 0.00, air: 0.00 },
};

const INITIAL_GAINS: Record<StemName, number> = {
  sub_bass: 0.30, log_drum: 0.30, chord_pad: 0.40, percussion: 0.20, air: 1.00,
};

// ── Public API ────────────────────────────────────────────────────────────────

export function automateGains(arc: ArrangementArc): GainAutomation {
  const { sections, totalBars } = arc;

  const curves: StemGainCurve[] = STEM_NAMES.map((stem) => {
    const points: GainPoint[] = [];
    let prevGain = INITIAL_GAINS[stem];

    for (const section of sections) {
      const targetGain = SECTION_GAINS[section.name][stem];

      // Start of section — current (previous) gain
      points.push({ bar: section.startBar, gain: clamp(prevGain) });
      // End of section — target gain for this section
      points.push({ bar: section.endBar, gain: clamp(targetGain) });

      prevGain = targetGain;
    }

    // Collapse duplicate bar values (only at boundaries shared between sections)
    const deduped: GainPoint[] = [];
    for (const p of points) {
      if (deduped.length > 0 && deduped[deduped.length - 1].bar === p.bar) {
        // Replace: the later point (section start) wins at shared boundaries
        deduped[deduped.length - 1] = p;
      } else {
        deduped.push(p);
      }
    }

    return { stem, points: deduped };
  });

  return { totalBars, curves };
}
