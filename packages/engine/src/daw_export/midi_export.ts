// Binary MIDI Type-0 export for Amapiano groove plans.
// Produces spec-compliant Standard MIDI Files importable into any DAW.

import type { GroovePlan, MidiNote } from "../types";

// GM percussion channel 10 (0-indexed as 9)
const DRUM_CHANNEL = 9;

// GM drum note assignments (Amapiano-mapped)
const DRUM_NOTES = {
  kick:   36,  // Bass Drum 1 — underpins the Amapiano low-end
  hat:    42,  // Closed Hi-Hat
  shaker: 82,  // Shaker
  log:    45,  // Low Floor Tom — closest GM timber to log drum
} as const;

const DRUM_VELOCITIES = {
  kick:   110,
  hat:     72,
  shaker:  68,
  log:     95,
} as const;

const TICKS_PER_QUARTER = 480;
const NOTE_DURATION_TICKS = 20;  // percussive: short

// ── Variable-length MIDI quantity encoding ────────────────────────────────────

function encodeVarLen(value: number): number[] {
  if (value <= 0) return [0];
  const bytes: number[] = [];
  bytes.push(value & 0x7f);
  value >>>= 7;
  while (value > 0) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  return bytes.reverse();
}

// ── Big-endian integer helpers ─────────────────────────────────────────────────

function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function u16be(n: number): number[] {
  return [(n >>> 8) & 0xff, n & 0xff];
}

// ── Swing-aware step-to-tick conversion ──────────────────────────────────────
// 16-step pattern = 4 quarter notes = 4 × TICKS_PER_QUARTER.
// Even steps land on the straight grid; odd steps are pushed by swing ratio.

function stepToTick(step: number, swingRatio: number): number {
  const beat   = Math.floor(step / 2);
  const isUpbeat = (step & 1) === 1;
  const baseTick = beat * TICKS_PER_QUARTER;
  if (!isUpbeat) return baseTick;
  return baseTick + Math.round(swingRatio * TICKS_PER_QUARTER);
}

// ── Build MIDI note list from groove plan ─────────────────────────────────────

function grooveToNotes(groove: GroovePlan, bars: number): MidiNote[] {
  const notes: MidiNote[] = [];
  const ticksPerBar = TICKS_PER_QUARTER * 4;

  const voices: Array<{ pattern: readonly number[]; note: number; velocity: number }> = [
    { pattern: groove.kickPattern,    note: DRUM_NOTES.kick,   velocity: DRUM_VELOCITIES.kick },
    { pattern: groove.hatPattern,     note: DRUM_NOTES.hat,    velocity: DRUM_VELOCITIES.hat },
    { pattern: groove.shakerPattern,  note: DRUM_NOTES.shaker, velocity: DRUM_VELOCITIES.shaker },
    { pattern: groove.logDrumPattern, note: DRUM_NOTES.log,    velocity: DRUM_VELOCITIES.log },
  ];

  for (let bar = 0; bar < bars; bar++) {
    const barOffset = bar * ticksPerBar;
    for (const { pattern, note, velocity } of voices) {
      for (let step = 0; step < 16; step++) {
        if (pattern[step]) {
          const tick = barOffset + stepToTick(step, groove.swing);
          notes.push({ tick, note, channel: DRUM_CHANNEL, velocity, duration: NOTE_DURATION_TICKS });
        }
      }
    }
  }

  return notes.sort((a, b) => a.tick - b.tick || a.note - b.note);
}

// ── Encode event stream ───────────────────────────────────────────────────────

interface RawEvent { tick: number; bytes: number[] }

function buildEvents(notes: MidiNote[]): RawEvent[] {
  const evs: RawEvent[] = [];
  for (const n of notes) {
    evs.push({ tick: n.tick,              bytes: [0x90 | n.channel, n.note, n.velocity] });
    evs.push({ tick: n.tick + n.duration, bytes: [0x80 | n.channel, n.note, 0] });
  }
  const endTick = notes.length > 0 ? Math.max(...notes.map((n) => n.tick + n.duration)) + 1 : 1;
  evs.push({ tick: endTick, bytes: [0xff, 0x2f, 0x00] });  // end-of-track
  return evs.sort((a, b) => a.tick - b.tick);
}

function encodeEvents(evs: RawEvent[]): number[] {
  const out: number[] = [];
  let cursor = 0;
  for (const ev of evs) {
    const delta = Math.max(0, ev.tick - cursor);
    cursor = ev.tick;
    out.push(...encodeVarLen(delta), ...ev.bytes);
  }
  return out;
}

// ── Assemble complete MIDI file ────────────────────────────────────────────────

export interface MidiExportResult {
  buffer:        Uint8Array;
  noteCount:     number;
  durationTicks: number;
  bars:          number;
  bpm:           number;
}

export function exportGrooveToMidi(
  groove: GroovePlan,
  bpm:    number,
  bars  = 2,
): MidiExportResult {
  const notes  = grooveToNotes(groove, bars);
  const events = buildEvents(notes);
  const trackBodyBytes = encodeEvents(events);

  // Tempo meta-event (µs per quarter note)
  const usPerBeat = Math.round(60_000_000 / bpm);
  const tempoEvt: number[] = [
    ...encodeVarLen(0), 0xff, 0x51, 0x03,
    (usPerBeat >>> 16) & 0xff,
    (usPerBeat >>>  8) & 0xff,
     usPerBeat         & 0xff,
  ];

  // Time signature: 4/4, 24 clocks/click, 8 32nd-notes/quarter
  const timeSigEvt: number[] = [
    ...encodeVarLen(0), 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08,
  ];

  // Track name "Amapiano" (ASCII)
  const nameBytes = [65,109,97,112,105,97,110,111];
  const nameEvt: number[] = [
    ...encodeVarLen(0), 0xff, 0x03, nameBytes.length, ...nameBytes,
  ];

  const fullTrack = [...tempoEvt, ...timeSigEvt, ...nameEvt, ...trackBodyBytes];

  const header: number[] = [
    0x4d, 0x54, 0x68, 0x64,  // MThd
    ...u32be(6),              // chunk length
    ...u16be(0),              // format 0
    ...u16be(1),              // 1 track
    ...u16be(TICKS_PER_QUARTER),
  ];

  const trackChunk: number[] = [
    0x4d, 0x54, 0x72, 0x6b,  // MTrk
    ...u32be(fullTrack.length),
    ...fullTrack,
  ];

  const allBytes = [...header, ...trackChunk];
  const buffer = new Uint8Array(allBytes);
  const durationTicks = TICKS_PER_QUARTER * 4 * bars;

  return { buffer, noteCount: notes.length, durationTicks, bars, bpm };
}

export function groovePlanToMidi(groove: GroovePlan, bpm = 114, bars = 4): Uint8Array {
  return exportGrooveToMidi(groove, bpm, bars).buffer;
}
