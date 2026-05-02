import type { MelodyPlan } from "./melodyPlanner";

const PPQ        = 480;
const STEP_TICKS = PPQ / 4; // 16th-note = 120 ticks

function varLen(v: number): number[] {
  const bytes: number[] = [];
  bytes.push(v & 0x7f);
  v >>= 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

type MidiEvent = { tick: number; data: number[] };

export function exportMelodyToMidi(plan: MelodyPlan): { buffer: Buffer } {
  const usPerBeat = Math.round(60_000_000 / plan.bpm);

  const events: MidiEvent[] = [];

  // Tempo meta-event at tick 0
  events.push({
    tick: 0,
    data: [
      0xff, 0x51, 0x03,
      (usPerBeat >> 16) & 0xff,
      (usPerBeat >>  8) & 0xff,
       usPerBeat        & 0xff,
    ],
  });

  for (const note of plan.notes) {
    const onTick  = note.step * STEP_TICKS;
    const offTick = onTick + note.durationSteps * STEP_TICKS;

    events.push({ tick: onTick,  data: [0x90, note.pitch, note.velocity] });
    events.push({ tick: offTick, data: [0x80, note.pitch, 0x40] });
  }

  // End of track meta-event
  const lastTick = plan.bars * 16 * STEP_TICKS;
  events.push({ tick: lastTick, data: [0xff, 0x2f, 0x00] });

  events.sort((a, b) => a.tick - b.tick || a.data[0] - b.data[0]);

  // Build track chunk bytes with delta times
  const trackBytes: number[] = [];
  let prevTick = 0;
  for (const ev of events) {
    const delta = ev.tick - prevTick;
    prevTick = ev.tick;
    trackBytes.push(...varLen(delta), ...ev.data);
  }

  // Header chunk: MThd
  const header = Buffer.from([
    0x4d, 0x54, 0x68, 0x64, // "MThd"
    0x00, 0x00, 0x00, 0x06, // chunk length = 6
    0x00, 0x00,             // format 0
    0x00, 0x01,             // 1 track
    (PPQ >> 8) & 0xff, PPQ & 0xff,
  ]);

  const trackLen = trackBytes.length;
  const trackHeader = Buffer.from([
    0x4d, 0x54, 0x72, 0x6b, // "MTrk"
    (trackLen >> 24) & 0xff,
    (trackLen >> 16) & 0xff,
    (trackLen >>  8) & 0xff,
     trackLen        & 0xff,
  ]);

  const buffer = Buffer.concat([header, trackHeader, Buffer.from(trackBytes)]);
  return { buffer };
}
