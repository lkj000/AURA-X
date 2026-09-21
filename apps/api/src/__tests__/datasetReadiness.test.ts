/**
 * READINESS IS COUNTED IN RECORDINGS, NOT ROWS.
 *
 * `ready_for_training` was `trainRecords.length >= 100`. Against the live dataset that is 389 rows
 * over 152 distinct recordings — 93 ingested three times, 46 twice, one six times — so the flag read
 * true on a corpus a third its apparent size, and training weighted some recordings six times heavier
 * than others.
 *
 * The fixtures below use the live shape deliberately, including the ratio that made this visible.
 */
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

type Row = Record<string, unknown>;
let rows: Row[] = [];

jest.mock("../lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: async () => ({ data: rows, error: null }),
    }),
  },
}));

import { getDatasetStats } from "../agent/datasetPipeline";

/** A dataset record as the joined query returns it. `sha` null means "not yet hashed". */
const rec = (split: string, sha: string | null, score = 0.78, rights = "bandcamp_purchase"): Row => ({
  subgenre: "private_school",
  source: "human",
  split,
  composite_score: score,
  rights_basis: rights,
  audio_files: sha === null ? { content_sha256: null } : { content_sha256: sha },
});

beforeEach(() => { rows = []; });

describe("distinct recordings, not upload rows", () => {
  it("DR-01 120 rows over 40 recordings is NOT ready", async () => {
    // The defect in one assertion: 120 train rows clears a threshold of 100, and there are forty
    // recordings behind them.
    rows = Array.from({ length: 120 }, (_, i) => rec("train", `sha-${i % 40}`));

    const s = await getDatasetStats();
    expect(s.total).toBe(120);
    expect(s.distinct_train_audio).toBe(40);
    expect(s.ready_for_training).toBe(false);
    expect(s.readiness_basis).toContain("40 distinct recordings");
  });

  it("DR-02 120 rows over 120 recordings IS ready", async () => {
    rows = Array.from({ length: 120 }, (_, i) => rec("train", `sha-${i}`));

    const s = await getDatasetStats();
    expect(s.distinct_train_audio).toBe(120);
    expect(s.ready_for_training).toBe(true);
  });

  it("DR-03 duplicates are reported, not merely excluded", async () => {
    // 389 → 152 is the live ratio. A number somebody can see beats a boolean nobody can interpret.
    rows = Array.from({ length: 389 }, (_, i) => rec("train", `sha-${i % 152}`));

    const s = await getDatasetStats();
    expect(s.total).toBe(389);
    expect(s.distinct_audio).toBe(152);
    expect(s.duplicate_records).toBe(237);
  });

  it("DR-04 only the TRAIN split counts toward readiness", async () => {
    // Held-out recordings are not training material. 60 distinct in train, plus 60 elsewhere, must
    // not add up to a ready corpus.
    rows = [
      ...Array.from({ length: 60 }, (_, i) => rec("train", `t-${i}`)),
      ...Array.from({ length: 40 }, (_, i) => rec("val",  `v-${i}`)),
      ...Array.from({ length: 20 }, (_, i) => rec("test", `x-${i}`)),
    ];

    const s = await getDatasetStats();
    expect(s.distinct_audio).toBe(120);
    expect(s.distinct_train_audio).toBe(60);
    expect(s.ready_for_training).toBe(false);
  });
});

describe("unhashed is unknown, and unknown is not ready", () => {
  it("DR-05 a partly-hashed dataset withholds readiness rather than guessing", async () => {
    // The state immediately after the migration and before the backfill. Falling back to the row
    // count here would reproduce the original defect exactly, and silently.
    rows = [
      ...Array.from({ length: 150 }, (_, i) => rec("train", `sha-${i}`)),
      ...Array.from({ length: 50 },  ()     => rec("train", null)),
    ];

    const s = await getDatasetStats();
    expect(s.ready_for_training).toBe(false);
    expect(s.distinct_audio).toBeNull();
    expect(s.distinct_train_audio).toBeNull();
    expect(s.duplicate_records).toBeNull();
    expect(s.readiness_basis).toContain("50 of 200");
  });

  it("DR-06 a wholly unhashed dataset never reports ready, whatever its size", async () => {
    rows = Array.from({ length: 5000 }, () => rec("train", null));

    const s = await getDatasetStats();
    expect(s.total).toBe(5000);
    expect(s.ready_for_training).toBe(false);
    expect(s.readiness_basis).toContain("Content identity unknown");
  });

  it("DR-07 an empty string is not a hash", async () => {
    // A blank column would otherwise count as a distinct recording — and every blank would collapse
    // into ONE, making a wholly unhashed corpus look like a single recording rather than unknown.
    rows = Array.from({ length: 120 }, () => rec("train", ""));

    const s = await getDatasetStats();
    expect(s.ready_for_training).toBe(false);
    expect(s.distinct_audio).toBeNull();
  });
});

describe("the joined row arrives in more than one shape", () => {
  it("DR-08 an array-wrapped join is read the same as an object", async () => {
    // Supabase returns the related row as an object or a single-element array depending on how it
    // infers the relationship. Reading only one shape would silently yield "unhashed" for the other,
    // which presents as a corpus that is never ready and no explanation why.
    rows = Array.from({ length: 120 }, (_, i) => ({
      subgenre: "private_school", source: "human", split: "train", composite_score: 0.78,
      audio_files: [{ content_sha256: `sha-${i}` }],
    }));

    const s = await getDatasetStats();
    expect(s.distinct_train_audio).toBe(120);
    expect(s.ready_for_training).toBe(true);
  });
});

describe("provenance is reported, never inferred", () => {
  it("DR-09 the rights basis is counted, not assumed", async () => {
    rows = [
      ...Array.from({ length: 100 }, (_, i) => rec("train", `a-${i}`, 0.78, "bandcamp_purchase")),
      ...Array.from({ length: 20 },  (_, i) => rec("train", `b-${i}`, 0.78, "unknown")),
    ];

    const s = await getDatasetStats();
    expect(s.by_rights_basis["bandcamp_purchase"]).toBe(100);
    expect(s.by_rights_basis["unknown"]).toBe(20);
    expect(s.records_without_rights_basis).toBe(20);
  });

  it("DR-10 an absent column reads as unknown, not as cleared", async () => {
    // Before the migration and the backfill, every record is unknown. That must present as unknown
    // rather than as a blank a reader fills in optimistically.
    rows = Array.from({ length: 50 }, (_, i) => {
      const r = rec("train", `c-${i}`);
      delete (r as Record<string, unknown>).rights_basis;
      return r;
    });

    const s = await getDatasetStats();
    expect(s.by_rights_basis["unknown"]).toBe(50);
    expect(s.records_without_rights_basis).toBe(50);
  });

  it("DR-11 provenance does NOT gate readiness — it is a separate question", async () => {
    // Deliberate. Readiness asks whether enough distinct material exists. Whether the corpus may
    // lawfully be trained on is a rights question no row count can answer, and this flag must not
    // appear to settle it. Reported side by side, decided separately.
    rows = Array.from({ length: 120 }, (_, i) => rec("train", `d-${i}`, 0.78, "unknown"));

    const s = await getDatasetStats();
    expect(s.ready_for_training).toBe(true);
    expect(s.records_without_rights_basis).toBe(120);
  });
});
