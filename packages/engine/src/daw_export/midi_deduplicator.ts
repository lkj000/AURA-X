// MIDI Note Deduplicator — E-36
// Cleans a flat list of MidiNoteEvents by:
//   1. Merging near-duplicate same-pitch/channel notes within mergeThresholdTicks.
//      When two notes start within the threshold, the later one is removed (keep loudest).
//   2. Truncating overlapping notes so they end exactly when the next same-pitch/channel
//      note starts.  If the truncated duration falls below minDurationTicks the note is
//      removed instead.
//   3. Filtering any remaining notes whose durationTicks < minDurationTicks.
// Output is sorted by startTick ASC, then channel ASC, then pitch ASC.

import type { MidiNoteEvent, DeduplicateResult } from "../types";

export interface DeduplicateOptions {
  minDurationTicks?:    number;   // default 1  — notes shorter than this are removed
  mergeThresholdTicks?: number;   // default 0  — notes starting within this gap are merged
}

// ── Public API ────────────────────────────────────────────────────────────────

export function deduplicateMidi(
  notes: MidiNoteEvent[],
  options: DeduplicateOptions = {},
): DeduplicateResult {
  const minDur   = options.minDurationTicks    ?? 1;
  const mergeGap = options.mergeThresholdTicks ?? 0;

  const originalCount = notes.length;
  let removedCount    = 0;
  let truncatedCount  = 0;

  // Group by channel_pitch
  const groups = new Map<string, MidiNoteEvent[]>();
  for (const n of notes) {
    const key = `${n.channel}_${n.pitch}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ ...n });
  }

  const output: MidiNoteEvent[] = [];

  for (const group of groups.values()) {
    // Sort by startTick ASC, then velocity DESC (keep loudest on tie)
    group.sort((a, b) =>
      a.startTick !== b.startTick
        ? a.startTick - b.startTick
        : b.velocity - a.velocity,
    );

    // Pass 1: merge near-duplicates
    const merged: MidiNoteEvent[] = [];
    for (const note of group) {
      if (merged.length === 0) {
        merged.push(note);
        continue;
      }
      const prev = merged[merged.length - 1];
      if (note.startTick - prev.startTick <= mergeGap) {
        // Keep whichever has higher velocity; note is already sorted so prev wins
        removedCount++;
      } else {
        merged.push(note);
      }
    }

    // Pass 2: resolve overlaps by truncating earlier note
    for (let i = 0; i < merged.length - 1; i++) {
      const cur  = merged[i];
      const next = merged[i + 1];
      const curEnd = cur.startTick + cur.durationTicks;
      if (curEnd > next.startTick) {
        const newDur = next.startTick - cur.startTick;
        if (newDur >= minDur) {
          cur.durationTicks = newDur;
          truncatedCount++;
        } else {
          // Mark for removal
          cur.durationTicks = 0;
        }
      }
    }

    // Pass 3: filter short/zero-duration notes
    for (const note of merged) {
      if (note.durationTicks < minDur) {
        removedCount++;
      } else {
        output.push(note);
      }
    }
  }

  // Final sort: startTick → channel → pitch
  output.sort((a, b) =>
    a.startTick !== b.startTick ? a.startTick - b.startTick :
    a.channel   !== b.channel   ? a.channel   - b.channel   :
    a.pitch     - b.pitch,
  );

  return { notes: output, originalCount, removedCount, truncatedCount };
}
