const PPQ           = 480;
const MTHD_LENGTH   = 14; // 4 magic + 4 length + 2 format + 2 numTracks + 2 PPQ

export type TrackBuffer = { buffer: Buffer };

/**
 * Merges an array of Type-0 MIDI buffers into a single Type-1 MIDI file.
 * Each input buffer must begin with a valid MThd header (14 bytes) followed
 * by exactly one MTrk chunk. The MTrk chunks are extracted and reassembled
 * under a new MThd with format=1 and numTracks=tracks.length.
 */
export function mergeToMultiTrackMidi(tracks: TrackBuffer[]): { buffer: Buffer } {
  if (tracks.length === 0) throw new Error("mergeToMultiTrackMidi: no tracks supplied");

  const numTracks = tracks.length;

  // New MThd: format 1, numTracks, PPQ
  const header = Buffer.alloc(MTHD_LENGTH);
  header.write("MThd", 0, "ascii");
  header.writeUInt32BE(6, 4);                   // chunk length always 6
  header.writeUInt16BE(1, 8);                   // format 1
  header.writeUInt16BE(numTracks, 10);
  header.writeUInt16BE(PPQ, 12);

  const chunks: Buffer[] = [header];
  for (const { buffer } of tracks) {
    if (buffer.length < MTHD_LENGTH) {
      throw new Error("mergeToMultiTrackMidi: input buffer too short to contain MThd");
    }
    // Verify MThd magic
    if (buffer.toString("ascii", 0, 4) !== "MThd") {
      throw new Error("mergeToMultiTrackMidi: input buffer does not start with MThd");
    }
    // The MTrk chunk starts immediately after MThd (byte 14)
    chunks.push(buffer.slice(MTHD_LENGTH));
  }

  return { buffer: Buffer.concat(chunks) };
}
