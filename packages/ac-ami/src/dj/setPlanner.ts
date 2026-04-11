import {
  getCamelotCode,
  harmonicCompatibilityScore,
  bpmCompatibilityScore,
  mixCompatibilityScore,
} from "./camelotWheel";

// ─── AMAPIANO ENERGY ARC ──────────────────────────────────────────────────────
// This is NOT generic DJ logic.
// Amapiano sets have a specific cultural energy trajectory:
//   Phase 1 entry   (0-15%):  Slow. Atmosphere. Pads. No log drum yet.
//   Phase 2 build   (15-40%): Log drum enters. BPM steady. Key movement.
//   Phase 3 peak    (40-65%): Full log drum. Dense groove.
//   Phase 4 plateau (65-90%): Hold energy. Last big tracks.
//   Phase 5 exhale  (90-100%): Outro. Space returns.
// Fundamentally different from EDM (which peaks and drops).

export type EnergyPhase = "entry" | "build" | "peak" | "plateau" | "exhale";

export type SetTrack = {
  track_id: string;
  title?: string;
  bpm: number;
  key: string;
  camelot_code?: string;
  subgenre: string;
  energy_mean: number;
  duration_sec: number;
};

export type TransitionPlan = {
  from_track_id: string;
  to_track_id: string;
  type: "log_drum_sync" | "filter_fade" | "cut" | "crossfade";
  bpm_match: number;
  harmonic_score: number;
  cue_out_sec?: number;
  cue_in_sec?: number;
  notes: string;
};

export type SetPlan = {
  title: string;
  total_duration_min: number;
  track_count: number;
  energy_arc: EnergyPhase[];
  tracks: SetTrack[];
  transitions: TransitionPlan[];
  set_notes: string[];
};

// ─── AMAPIANO SET CONVENTIONS ─────────────────────────────────────────────────

const AMAPIANO_TRANSITIONS = {
  log_drum_sync: {
    cue_out_sec: 32,
    cue_in_sec: 0,
    bpm_threshold: 0.05,  // Max 5% BPM difference
  },
  filter_fade: {
    cue_out_sec: 16,
    cue_in_sec: 8,
    min_harmonic: 0.5,
  },
};

// ─── ENERGY TARGET BY PHASE ───────────────────────────────────────────────────

export const PHASE_ENERGY_TARGETS: Record<EnergyPhase, number> = {
  entry:   0.35,
  build:   0.55,
  peak:    0.80,
  plateau: 0.75,
  exhale:  0.40,
};

// ─── PHASE DURATION RATIOS ────────────────────────────────────────────────────

const PHASE_RATIOS: Record<EnergyPhase, number> = {
  entry:   0.15,
  build:   0.25,
  peak:    0.25,
  plateau: 0.25,
  exhale:  0.10,
};

export const ORDERED_PHASES: EnergyPhase[] = [
  "entry", "build", "peak", "plateau", "exhale",
];

// ─── SET PLANNER ──────────────────────────────────────────────────────────────

export type SetPlannerOptions = {
  title?: string;
  target_duration_min?: number;
  opening_key?: string;
  max_bpm_jump?: number;
};

export function planSet(
  tracks: SetTrack[],
  opts: SetPlannerOptions = {},
): SetPlan {
  const targetDuration = opts.target_duration_min ?? 45;
  const maxBpmJump = opts.max_bpm_jump ?? 6;
  const title = opts.title ?? "AURA X DJ Set";

  if (tracks.length === 0) {
    return {
      title,
      total_duration_min: 0,
      track_count: 0,
      energy_arc: [],
      tracks: [],
      transitions: [],
      set_notes: ["No tracks available"],
    };
  }

  const setNotes: string[] = [];
  const orderedTracks: SetTrack[] = [];
  const energyArc: EnergyPhase[] = [];
  let totalFilledMin = 0;

  // ─── 1. Fill each phase with appropriate tracks ──────────────────────────
  for (const phase of ORDERED_PHASES) {
    const phaseTargetMin = targetDuration * PHASE_RATIOS[phase];
    const phaseEnergyTarget = PHASE_ENERGY_TARGETS[phase];
    let phaseFilledMin = 0;

    const candidates = _selectTracksForPhase(
      tracks,
      orderedTracks,
      phaseEnergyTarget,
      phase,
    );

    for (const track of candidates) {
      if (phaseFilledMin >= phaseTargetMin) break;
      if (totalFilledMin >= targetDuration) break;

      // BPM continuity check
      if (orderedTracks.length > 0) {
        const prev = orderedTracks[orderedTracks.length - 1];
        const bpmDiff = Math.abs(track.bpm - prev.bpm);
        if (bpmDiff > maxBpmJump) {
          setNotes.push(
            `Skipped "${track.title ?? track.track_id}": BPM jump ${bpmDiff.toFixed(1)} > ${maxBpmJump}`,
          );
          continue;
        }
      }

      orderedTracks.push(track);
      energyArc.push(phase);
      phaseFilledMin += track.duration_sec / 60;
      totalFilledMin += track.duration_sec / 60;
    }
  }

  setNotes.push(
    `Planned ${orderedTracks.length} tracks, ~${totalFilledMin.toFixed(0)} min`,
  );

  // ─── 2. Plan transitions ─────────────────────────────────────────────────
  const transitions: TransitionPlan[] = [];
  for (let i = 0; i < orderedTracks.length - 1; i++) {
    transitions.push(planTransition(orderedTracks[i], orderedTracks[i + 1]));
  }

  return {
    title,
    total_duration_min: parseFloat(totalFilledMin.toFixed(1)),
    track_count: orderedTracks.length,
    energy_arc: energyArc,
    tracks: orderedTracks,
    transitions,
    set_notes: setNotes,
  };
}

// ─── TRANSITION PLANNER ───────────────────────────────────────────────────────

export function planTransition(from: SetTrack, to: SetTrack): TransitionPlan {
  const fromCode = getCamelotCode(from.key);
  const toCode   = getCamelotCode(to.key);

  const harmonicScore = fromCode && toCode
    ? harmonicCompatibilityScore(fromCode, toCode)
    : 0.5;

  const bpmScore = bpmCompatibilityScore(from.bpm, to.bpm);
  const bpmDiff  = Math.abs(from.bpm - to.bpm) / from.bpm;

  let transitionType: TransitionPlan["type"];
  let notes: string;

  if (bpmDiff <= AMAPIANO_TRANSITIONS.log_drum_sync.bpm_threshold && harmonicScore >= 0.7) {
    transitionType = "log_drum_sync";
    notes = `Log drum sync: ${from.bpm} → ${to.bpm} BPM, ${from.key} → ${to.key} (${fromCode} → ${toCode})`;
  } else if (harmonicScore >= 0.5) {
    transitionType = "filter_fade";
    notes = `Filter fade: harmonic score ${harmonicScore.toFixed(2)}, BPM diff ${(bpmDiff * 100).toFixed(1)}%`;
  } else {
    transitionType = "cut";
    notes = `Hard cut: keys clash (${fromCode} → ${toCode}), harmonic score ${harmonicScore.toFixed(2)}`;
  }

  return {
    from_track_id:  from.track_id,
    to_track_id:    to.track_id,
    type:            transitionType,
    bpm_match:       parseFloat(bpmScore.toFixed(3)),
    harmonic_score:  parseFloat(harmonicScore.toFixed(3)),
    cue_out_sec:     transitionType === "log_drum_sync"
      ? AMAPIANO_TRANSITIONS.log_drum_sync.cue_out_sec
      : 16,
    cue_in_sec:      transitionType === "log_drum_sync"
      ? AMAPIANO_TRANSITIONS.log_drum_sync.cue_in_sec
      : 8,
    notes,
  };
}

// ─── PRIVATE HELPERS ──────────────────────────────────────────────────────────

function _selectTracksForPhase(
  allTracks: SetTrack[],
  usedTracks: SetTrack[],
  energyTarget: number,
  phase: EnergyPhase,
): SetTrack[] {
  const usedIds = new Set(usedTracks.map(t => t.track_id));
  const lastTrack = usedTracks[usedTracks.length - 1];

  return allTracks
    .filter(t => !usedIds.has(t.track_id))
    .map(t => ({
      track: t,
      score: _trackPhaseScore(t, energyTarget, lastTrack, phase),
    }))
    .sort((a, b) => b.score - a.score)
    .map(x => x.track);
}

function _trackPhaseScore(
  track: SetTrack,
  energyTarget: number,
  prevTrack: SetTrack | undefined,
  phase: EnergyPhase,
): number {
  const energyDiff  = Math.abs(track.energy_mean - energyTarget);
  const energyScore = 1 - Math.min(1, energyDiff * 2);

  let harmonicScore = 0.7;
  if (prevTrack) {
    harmonicScore = mixCompatibilityScore(
      { key: prevTrack.key, bpm: prevTrack.bpm },
      { key: track.key, bpm: track.bpm },
    );
  }

  const subgenreScore = _subgenrePhaseScore(track.subgenre, phase);

  return (energyScore * 0.35) + (harmonicScore * 0.40) + (subgenreScore * 0.25);
}

function _subgenrePhaseScore(subgenre: string, phase: EnergyPhase): number {
  const preferences: Partial<Record<EnergyPhase, string[]>> = {
    entry:   ["private_school", "mbiraiano", "hybrid_rnb_amapiano"],
    build:   ["private_school", "sgija"],
    peak:    ["stixx_sgija", "sgija", "bacardi"],
    plateau: ["stixx_sgija", "bacardi", "gqom_fusion"],
    exhale:  ["private_school", "mbiraiano", "hybrid_rnb_amapiano"],
  };
  return (preferences[phase] ?? []).includes(subgenre) ? 1.0 : 0.5;
}
