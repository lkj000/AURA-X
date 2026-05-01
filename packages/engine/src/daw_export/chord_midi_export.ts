// Chord-to-MIDI Exporter — E-19
// Converts a ChordProgression (E-17) to a binary Standard MIDI Type-0 file.
// Each chord voicing is written as simultaneous note-on events on channel 1
// (melodic, not percussion). Supports beatsPerChord and loop repeat count.
//
// MIDI spec: MThd + MTrk, TPQ=480, tempo meta-event, time-sig 4/4.
// Notes: all chord tones on at chord start, all off after duration.

import type { ChordProgression, MidiNote } from "../types";

const TICKS_PER_QUARTER = 480;
const CHORD_CHANNEL     = 0;    // channel 1 (0-indexed)
const CHORD_VELOCITY    = 82;

// ── MIDI encoding helpers (local — not re-exported from midi_export) ──────────

function encodeVarLen(value: number): number[] {
  if (value <= 0) return [0];
  const bytes: number[] = [];
  bytes.push(value & 0x7f);
  value >>>= 7;
  while (value > 0) { bytes.push((value & 0x7f) | 0x80); value >>>= 7; }
  return bytes.reverse();
}

function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}
function u16be(n: number): number[] { return [(n >>> 8) & 0xff, n & 0xff]; }

interface RawEvent { tick: number; bytes: number[] }

function buildEvents(notes: MidiNote[], endTick: number): RawEvent[] {
  const evs: RawEvent[] = [];
  for (const n of notes) {
    evs.push({ tick: n.tick,              bytes: [0x90 | n.channel, n.note, n.velocity] });
    evs.push({ tick: n.tick + n.duration, bytes: [0x80 | n.channel, n.note, 0] });
  }
  evs.push({ tick: endTick, bytes: [0xff, 0x2f, 0x00] });
  return evs.sort((a, b) => a.tick - b.tick || a.bytes[0] - b.bytes[0]);
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

// ── Chord note builder ────────────────────────────────────────────────────────

function chordToNotes(
  midiNotes:  number[],
  startTick:  number,
  durationTicks: number,
): MidiNote[] {
  return midiNotes.map((note) => ({
    tick:     startTick,
    note:     Math.max(0, Math.min(127, note)),
    channel:  CHORD_CHANNEL,
    velocity: CHORD_VELOCITY,
    duration: durationTicks,
  }));
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ChordMidiOptions {
  bpm:           number;
  beatsPerChord?: number;   // default 4 (one bar per chord)
  repeat?:       number;    // how many times to loop the 4-chord cycle, default 2
}

export interface ChordMidiResult {
  buffer:        Buffer;
  lane:          string;
  bpm:           number;
  chordCount:    number;    // total chords written (voicings × repeat)
  totalBars:     number;
  beatsPerChord: number;
}

export function exportChordProgressionToMidi(
  progression: ChordProgression,
  options:     ChordMidiOptions,
): ChordMidiResult {
  const { bpm }                  = options;
  const beatsPerChord            = options.beatsPerChord ?? 4;
  const repeat                   = Math.max(1, options.repeat ?? 2);
  const chordDurationTicks       = beatsPerChord * TICKS_PER_QUARTER;
  const cycleTickLen             = progression.voicings.length * chordDurationTicks;

  const notes: MidiNote[] = [];

  for (let rep = 0; rep < repeat; rep++) {
    const repOffset = rep * cycleTickLen;
    progression.voicings.forEach((voicing, i) => {
      const startTick = repOffset + i * chordDurationTicks;
      notes.push(...chordToNotes(voicing.notes, startTick, chordDurationTicks));
    });
  }

  notes.sort((a, b) => a.tick - b.tick || a.note - b.note);
  const endTick    = repeat * cycleTickLen + 1;
  const events     = buildEvents(notes, endTick);
  const trackBodyBytes = encodeEvents(events);

  const usPerBeat  = Math.round(60_000_000 / bpm);
  const tempoEvt   = [...encodeVarLen(0), 0xff, 0x51, 0x03,
    (usPerBeat >>> 16) & 0xff, (usPerBeat >>> 8) & 0xff, usPerBeat & 0xff];
  const timeSigEvt = [...encodeVarLen(0), 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08];

  const progName   = `${progression.lane} chords`;
  const nameBytes  = [...progName].map((c) => c.charCodeAt(0));
  const nameEvt    = [...encodeVarLen(0), 0xff, 0x03, nameBytes.length, ...nameBytes];

  const fullTrack  = [...tempoEvt, ...timeSigEvt, ...nameEvt, ...trackBodyBytes];
  const header     = [0x4d, 0x54, 0x68, 0x64, ...u32be(6), ...u16be(0), ...u16be(1), ...u16be(TICKS_PER_QUARTER)];
  const trackChunk = [0x4d, 0x54, 0x72, 0x6b, ...u32be(fullTrack.length), ...fullTrack];

  const totalBars = (progression.voicings.length * beatsPerChord * repeat) / 4;

  return {
    buffer:        Buffer.from([...header, ...trackChunk]),
    lane:          progression.lane,
    bpm,
    chordCount:    progression.voicings.length * repeat,
    totalBars,
    beatsPerChord,
  };
}
