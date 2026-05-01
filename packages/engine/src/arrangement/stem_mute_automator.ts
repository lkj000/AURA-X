// Stem Mute Automator — E-39
// Generates an Amapiano-standard mute/active schedule for all 5 stems across
// every section of an ArrangementArc.
//
// Amapiano mute map (true = muted):
//
//              sub_bass  log_drum  chord_pad  percussion  air
//  intro          ✓         –          –          ✓        ✓
//  build1         –         –          –          –        ✓
//  drop1          –         –          –          –        –   ← all active
//  breakdown      ✓         –          –          ✓        ✓
//  build2         –         –          –          –        ✓
//  drop2          –         –          –          –        –   ← all active
//  outro          ✓         –          –          ✓        ✓
//  outro_fade     ✓         –          ✓          ✓        ✓

import type { ArrangementArc, SectionName, StemName, MuteSchedule } from "../types";

const STEMS: StemName[] = ["sub_bass", "log_drum", "chord_pad", "percussion", "air"];

// muted[section][stem] = boolean
const MUTE_MAP: Record<string, Record<StemName, boolean>> = {
  intro:       { sub_bass: true,  log_drum: false, chord_pad: false, percussion: true,  air: true  },
  build1:      { sub_bass: false, log_drum: false, chord_pad: false, percussion: false, air: true  },
  drop1:       { sub_bass: false, log_drum: false, chord_pad: false, percussion: false, air: false },
  breakdown:   { sub_bass: true,  log_drum: false, chord_pad: false, percussion: true,  air: true  },
  build2:      { sub_bass: false, log_drum: false, chord_pad: false, percussion: false, air: true  },
  drop2:       { sub_bass: false, log_drum: false, chord_pad: false, percussion: false, air: false },
  outro:       { sub_bass: true,  log_drum: false, chord_pad: false, percussion: true,  air: true  },
  outro_fade:  { sub_bass: true,  log_drum: false, chord_pad: true,  percussion: true,  air: true  },
};

// ── Public API ────────────────────────────────────────────────────────────────

export function generateMuteSchedule(arc: ArrangementArc): MuteSchedule {
  const sections = arc.sections.map((s) => s.name as SectionName);
  const events   = sections.flatMap((sectionName) =>
    STEMS.map((stem) => ({
      section: sectionName,
      stem,
      muted:   MUTE_MAP[sectionName]?.[stem] ?? false,
    })),
  );
  return { events, sections, stems: [...STEMS] };
}
