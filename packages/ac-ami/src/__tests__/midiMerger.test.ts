import { mergeToMultiTrackMidi } from "../midi/midiMerger";

// ─────────────────────────────────────────────────────────────────────────────

function makeType0Midi(trackBytes: number[]): Buffer {
  const trackLen = trackBytes.length;
  const header = Buffer.from([
    0x4d, 0x54, 0x68, 0x64,               // "MThd"
    0x00, 0x00, 0x00, 0x06,               // chunk length 6
    0x00, 0x00,                           // format 0
    0x00, 0x01,                           // 1 track
    0x01, 0xe0,                           // PPQ 480
  ]);
  const trackHeader = Buffer.from([
    0x4d, 0x54, 0x72, 0x6b,               // "MTrk"
    (trackLen >> 24) & 0xff,
    (trackLen >> 16) & 0xff,
    (trackLen >>  8) & 0xff,
     trackLen        & 0xff,
  ]);
  return Buffer.concat([header, trackHeader, Buffer.from(trackBytes)]);
}

const TRACK_A = makeType0Midi([0x00, 0xff, 0x2f, 0x00]);
const TRACK_B = makeType0Midi([0x00, 0x90, 0x3c, 0x64, 0x00, 0x80, 0x3c, 0x40, 0x00, 0xff, 0x2f, 0x00]);
const TRACK_C = makeType0Midi([0x00, 0x90, 0x48, 0x50, 0x00, 0xff, 0x2f, 0x00]);

// ─────────────────────────────────────────────────────────────────────────────

describe("MIDI Merger — mergeToMultiTrackMidi", () => {

  // ─── Output shape ──────────────────────────────────────────────────────────

  it("1. Returns an object with a Buffer", () => {
    const result = mergeToMultiTrackMidi([{ buffer: TRACK_A }]);
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
  });

  it("2. Starts with MThd magic bytes", () => {
    const { buffer } = mergeToMultiTrackMidi([{ buffer: TRACK_A }, { buffer: TRACK_B }]);
    expect(buffer.toString("ascii", 0, 4)).toBe("MThd");
  });

  it("3. MThd chunk length field is 6", () => {
    const { buffer } = mergeToMultiTrackMidi([{ buffer: TRACK_A }]);
    expect(buffer.readUInt32BE(4)).toBe(6);
  });

  it("4. Format field is 1 (Type-1 MIDI)", () => {
    const { buffer } = mergeToMultiTrackMidi([{ buffer: TRACK_A }, { buffer: TRACK_B }]);
    expect(buffer.readUInt16BE(8)).toBe(1);
  });

  it("5. numTracks field matches input length — 1 track", () => {
    const { buffer } = mergeToMultiTrackMidi([{ buffer: TRACK_A }]);
    expect(buffer.readUInt16BE(10)).toBe(1);
  });

  it("6. numTracks field matches input length — 3 tracks", () => {
    const { buffer } = mergeToMultiTrackMidi([
      { buffer: TRACK_A }, { buffer: TRACK_B }, { buffer: TRACK_C },
    ]);
    expect(buffer.readUInt16BE(10)).toBe(3);
  });

  it("7. PPQ field is 480", () => {
    const { buffer } = mergeToMultiTrackMidi([{ buffer: TRACK_A }]);
    expect(buffer.readUInt16BE(12)).toBe(480);
  });

  // ─── Track chunk extraction ─────────────────────────────────────────────────

  it("8. MTrk chunk from first input appears at byte 14", () => {
    const { buffer } = mergeToMultiTrackMidi([{ buffer: TRACK_A }, { buffer: TRACK_B }]);
    // Bytes 14-17 should be "MTrk" from TRACK_A
    expect(buffer.toString("ascii", 14, 18)).toBe("MTrk");
  });

  it("9. Total buffer length equals 14 + sum of MTrk chunk sizes", () => {
    const { buffer } = mergeToMultiTrackMidi([
      { buffer: TRACK_A }, { buffer: TRACK_B }, { buffer: TRACK_C },
    ]);
    const expectedLength =
      14 +
      (TRACK_A.length - 14) +
      (TRACK_B.length - 14) +
      (TRACK_C.length - 14);
    expect(buffer.length).toBe(expectedLength);
  });

  // ─── Error handling ─────────────────────────────────────────────────────────

  it("10. Throws when given an empty array", () => {
    expect(() => mergeToMultiTrackMidi([])).toThrow();
  });

});
