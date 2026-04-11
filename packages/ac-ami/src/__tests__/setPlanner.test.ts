import {
  planSet,
  planTransition,
  PHASE_ENERGY_TARGETS,
  SetTrack,
} from "../dj/setPlanner";

// ─── FIXTURE TRACK LIBRARY ────────────────────────────────────────────────────
// 14 tracks across dedicated phase pools, 4 min (240 sec) each.
// BPMs 108-114, keys across Camelot wheel.
// Separate plateau pool so plateau fills without stealing exhale candidates.

function makeTrack(id: string, overrides: Partial<SetTrack>): SetTrack {
  return {
    track_id: id,
    title: id,
    bpm: 112,
    key: "Gm",
    subgenre: "private_school",
    energy_mean: 0.5,
    duration_sec: 240,  // 4 min
    ...overrides,
  };
}

// Entry pool: low energy, private_school / mbiraiano
const ENTRY_TRACKS: SetTrack[] = [
  makeTrack("e1", { bpm: 108, key: "Gm", energy_mean: 0.25, subgenre: "private_school" }),
  makeTrack("e2", { bpm: 109, key: "Dm", energy_mean: 0.30, subgenre: "mbiraiano" }),
];

// Build pool: mid energy, sgija
const BUILD_TRACKS: SetTrack[] = [
  makeTrack("b1", { bpm: 110, key: "Am", energy_mean: 0.50, subgenre: "sgija" }),
  makeTrack("b2", { bpm: 111, key: "Gm", energy_mean: 0.55, subgenre: "private_school" }),
  makeTrack("b3", { bpm: 112, key: "Dm", energy_mean: 0.58, subgenre: "sgija" }),
];

// Peak pool: high energy, stixx_sgija / bacardi
const PEAK_TRACKS: SetTrack[] = [
  makeTrack("p1", { bpm: 112, key: "F#m", energy_mean: 0.80, subgenre: "stixx_sgija" }),
  makeTrack("p2", { bpm: 113, key: "F#m", energy_mean: 0.82, subgenre: "bacardi" }),
  makeTrack("p3", { bpm: 114, key: "Am",  energy_mean: 0.78, subgenre: "stixx_sgija" }),
];

// Plateau pool: plateau energy, bacardi / gqom_fusion (preferred for plateau phase)
// Deliberately higher energy than exhale — won't be confused for exhale candidates
const PLATEAU_TRACKS: SetTrack[] = [
  makeTrack("pl1", { bpm: 113, key: "F#m", energy_mean: 0.72, subgenre: "bacardi" }),
  makeTrack("pl2", { bpm: 113, key: "Am",  energy_mean: 0.75, subgenre: "gqom_fusion" }),
  makeTrack("pl3", { bpm: 112, key: "Gm",  energy_mean: 0.70, subgenre: "bacardi" }),
];

// Exhale pool: low-mid energy, private_school / mbiraiano
// Clearly lower energy than plateau — safe from being grabbed by plateau scoring
const EXHALE_TRACKS: SetTrack[] = [
  makeTrack("x1", { bpm: 111, key: "Gm", energy_mean: 0.35, subgenre: "private_school" }),
  makeTrack("x2", { bpm: 110, key: "Dm", energy_mean: 0.38, subgenre: "mbiraiano" }),
  makeTrack("x3", { bpm: 111, key: "Am", energy_mean: 0.40, subgenre: "hybrid_rnb_amapiano" }),
];

// Full library: 14 tracks × 4 min = 56 min available (> 45 min target)
// Phases fill 8+12+12+12=44 min, leaving 1 min budget for exhale
const ALL_TRACKS = [
  ...ENTRY_TRACKS, ...BUILD_TRACKS, ...PEAK_TRACKS,
  ...PLATEAU_TRACKS, ...EXHALE_TRACKS,
];

// ─────────────────────────────────────────────────────────────────────────────

describe("DJ Set Planner", () => {

  // ─── planSet ───────────────────────────────────────────────────────────────

  it("1. planSet with 0 tracks returns empty set", () => {
    const plan = planSet([]);
    expect(plan.track_count).toBe(0);
    expect(plan.tracks).toHaveLength(0);
    expect(plan.transitions).toHaveLength(0);
    expect(plan.total_duration_min).toBe(0);
  });

  it("2. planSet with 14 tracks returns non-empty tracklist", () => {
    const plan = planSet(ALL_TRACKS, { target_duration_min: 45 });
    expect(plan.track_count).toBeGreaterThan(0);
    expect(plan.tracks.length).toBeGreaterThan(0);
  });

  it("3. Set total duration is within ±20% of target", () => {
    const target = 45;
    const plan = planSet(ALL_TRACKS, { target_duration_min: target });
    expect(plan.total_duration_min).toBeGreaterThanOrEqual(target * 0.80);
    expect(plan.total_duration_min).toBeLessThanOrEqual(target * 1.20);
  });

  it("4. No track appears twice in the set", () => {
    const plan = planSet(ALL_TRACKS, { target_duration_min: 45 });
    const ids = plan.tracks.map(t => t.track_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("5. Energy arc starts with 'entry' phase", () => {
    const plan = planSet(ALL_TRACKS, { target_duration_min: 45 });
    expect(plan.energy_arc[0]).toBe("entry");
  });

  it("6. Energy arc ends with 'exhale' phase", () => {
    // Fixture has dedicated plateau pool so plateau fills without consuming exhale candidates.
    // With 4-min tracks and target 45: entry(8)+build(12)+peak(12)+plateau(12)=44 min,
    // leaving 1 min budget — enough for the planner to add 1 exhale track.
    const plan = planSet(ALL_TRACKS, { target_duration_min: 45 });
    const last = plan.energy_arc[plan.energy_arc.length - 1];
    expect(last).toBe("exhale");
  });

  it("7. Peak phase tracks have higher energy than entry tracks", () => {
    const plan = planSet(ALL_TRACKS, { target_duration_min: 45 });
    const entryTracks = plan.tracks.filter((_, i) => plan.energy_arc[i] === "entry");
    const peakTracks  = plan.tracks.filter((_, i) => plan.energy_arc[i] === "peak");

    if (entryTracks.length > 0 && peakTracks.length > 0) {
      const avgEntry = entryTracks.reduce((s, t) => s + t.energy_mean, 0) / entryTracks.length;
      const avgPeak  = peakTracks.reduce((s, t) => s + t.energy_mean, 0) / peakTracks.length;
      expect(avgPeak).toBeGreaterThan(avgEntry);
    }
  });

  it("8. Number of transitions = number of tracks - 1", () => {
    const plan = planSet(ALL_TRACKS, { target_duration_min: 45 });
    expect(plan.transitions).toHaveLength(Math.max(0, plan.track_count - 1));
  });

  // ─── planTransition ────────────────────────────────────────────────────────

  it("9. Same key + same BPM → log_drum_sync transition", () => {
    const from = makeTrack("a", { key: "Gm", bpm: 112 });
    const to   = makeTrack("b", { key: "Gm", bpm: 112 });
    const t = planTransition(from, to);
    expect(t.type).toBe("log_drum_sync");
  });

  it("10. Same BPM, same key → bpm_match close to 1.0", () => {
    const from = makeTrack("a", { key: "F#m", bpm: 112 });
    const to   = makeTrack("b", { key: "F#m", bpm: 112 });
    const t = planTransition(from, to);
    expect(t.bpm_match).toBeGreaterThan(0.95);
  });

  it("11. Very different keys → cut or filter_fade transition", () => {
    // Am (8A) vs C# (3B) — 5 Camelot steps apart → harmonicScore = 0.1 → cut
    const from = makeTrack("a", { key: "Am", bpm: 112 });
    const to   = makeTrack("b", { key: "C#", bpm: 112 });
    const t = planTransition(from, to);
    expect(["cut", "filter_fade"]).toContain(t.type);
  });

  it("12. Harmonic score on transition reflects key compatibility", () => {
    const sameKey = planTransition(
      makeTrack("a", { key: "Gm", bpm: 112 }),
      makeTrack("b", { key: "Gm", bpm: 112 }),
    );
    const clashKey = planTransition(
      makeTrack("c", { key: "Am", bpm: 112 }),   // 8A
      makeTrack("d", { key: "C#", bpm: 112 }),   // 3B — 5 Camelot steps
    );
    expect(sameKey.harmonic_score).toBeGreaterThan(clashKey.harmonic_score);
  });

  // ─── Phase energy selection ────────────────────────────────────────────────

  it("13. Entry tracks selected from low-energy candidates", () => {
    const plan = planSet(ALL_TRACKS, { target_duration_min: 45 });
    const entryTracks = plan.tracks.filter((_, i) => plan.energy_arc[i] === "entry");
    if (entryTracks.length > 0) {
      const avgEnergy = entryTracks.reduce((s, t) => s + t.energy_mean, 0) / entryTracks.length;
      expect(avgEnergy).toBeLessThan(PHASE_ENERGY_TARGETS.build);
    }
  });

  it("14. Peak tracks selected from high-energy candidates", () => {
    const plan = planSet(ALL_TRACKS, { target_duration_min: 45 });
    const peakTracks = plan.tracks.filter((_, i) => plan.energy_arc[i] === "peak");
    if (peakTracks.length > 0) {
      const avgEnergy = peakTracks.reduce((s, t) => s + t.energy_mean, 0) / peakTracks.length;
      expect(avgEnergy).toBeGreaterThan(PHASE_ENERGY_TARGETS.build);
    }
  });

  it("15. Private School / Mbiraiano preferred for entry phase", () => {
    const plan = planSet(ALL_TRACKS, { target_duration_min: 45 });
    const entryTracks = plan.tracks.filter((_, i) => plan.energy_arc[i] === "entry");
    if (entryTracks.length > 0) {
      const hasPreferred = entryTracks.some(t =>
        ["private_school", "mbiraiano", "hybrid_rnb_amapiano"].includes(t.subgenre)
      );
      expect(hasPreferred).toBe(true);
    }
  });

  it("16. Stixx Sgija / Bacardi preferred for peak phase", () => {
    const plan = planSet(ALL_TRACKS, { target_duration_min: 45 });
    const peakTracks = plan.tracks.filter((_, i) => plan.energy_arc[i] === "peak");
    if (peakTracks.length > 0) {
      const hasPreferred = peakTracks.some(t =>
        ["stixx_sgija", "bacardi", "sgija"].includes(t.subgenre)
      );
      expect(hasPreferred).toBe(true);
    }
  });

});
