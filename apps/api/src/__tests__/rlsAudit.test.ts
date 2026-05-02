import * as fs from "fs";
import * as path from "path";

// ─── SQL corpus ───────────────────────────────────────────────────────────────
// Read all .sql files across the two migration directories and combine them
// into a single lower-cased string that can be searched with simple includes().

function loadAllSql(): string {
  const dirs = [
    // root supabase/migrations (001, 002, 008)
    path.resolve(__dirname, "../../../../supabase/migrations"),
    // apps/api/supabase/migrations (003, 004, 005)
    path.resolve(__dirname, "../../supabase/migrations"),
    // apps/api/supabase (006, 007 — flat files)
    path.resolve(__dirname, "../../supabase"),
  ];

  let corpus = "";
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      corpus += fs.readFileSync(path.join(dir, file), "utf-8") + "\n";
    }
  }
  return corpus.toLowerCase().replace(/[ \t]+/g, " ");
}

const SQL = loadAllSql();

function hasRls(table: string): boolean {
  return SQL.includes(`alter table ${table} enable row level security`);
}

function hasPolicy(table: string): boolean {
  return SQL.includes(`on ${table} using`);
}

// ─── Tables that existed before the audit (001–002) ──────────────────────────

const PRE_AUDIT_TABLES = [
  "tracks",
  "ctls",
  "generations",
  "audio_files",
  "evaluations",
  "dj_sets",
  "dataset_records",
];

// ─── Tables fixed by migration 008 ───────────────────────────────────────────

const AUDITED_TABLES = [
  "gold_standard_generations",
  "producer_feedback",
  "artists",
  "track_licenses",
  "royalty_splits",
];

// ─────────────────────────────────────────────────────────────────────────────

describe("RLS Audit — migration 008", () => {

  it("1. Migration file 008_rls_audit.sql exists", () => {
    const p = path.resolve(__dirname, "../../../../supabase/migrations/008_rls_audit.sql");
    expect(fs.existsSync(p)).toBe(true);
  });

  // ─── Pre-existing tables ──────────────────────────────────────────────────

  it("2. tracks — RLS was enabled in 001", () => {
    expect(hasRls("tracks")).toBe(true);
  });

  it("3. ctls — RLS was enabled in 001", () => {
    expect(hasRls("ctls")).toBe(true);
  });

  it("4. generations — RLS was enabled in 001", () => {
    expect(hasRls("generations")).toBe(true);
  });

  it("5. audio_files — RLS was enabled in 001", () => {
    expect(hasRls("audio_files")).toBe(true);
  });

  it("6. evaluations — RLS was enabled in 001", () => {
    expect(hasRls("evaluations")).toBe(true);
  });

  it("7. dj_sets — RLS was enabled in 001", () => {
    expect(hasRls("dj_sets")).toBe(true);
  });

  it("8. dataset_records — RLS was enabled in 002", () => {
    expect(hasRls("dataset_records")).toBe(true);
  });

  // ─── Audited tables (fixed by 008) ───────────────────────────────────────

  it("9. gold_standard_generations — RLS enabled by 008", () => {
    expect(hasRls("gold_standard_generations")).toBe(true);
  });

  it("10. producer_feedback — RLS enabled by 008", () => {
    expect(hasRls("producer_feedback")).toBe(true);
  });

  it("11. artists — RLS enabled by 008", () => {
    expect(hasRls("artists")).toBe(true);
  });

  it("12. track_licenses — RLS enabled by 008", () => {
    expect(hasRls("track_licenses")).toBe(true);
  });

  it("13. royalty_splits — RLS enabled by 008", () => {
    expect(hasRls("royalty_splits")).toBe(true);
  });

  // ─── Policy coverage ─────────────────────────────────────────────────────

  it("14. Every known table has at least one RLS policy", () => {
    const ALL_TABLES = [...PRE_AUDIT_TABLES, ...AUDITED_TABLES];
    const missing = ALL_TABLES.filter((t) => !hasPolicy(t));
    expect(missing).toEqual([]);
  });

  // ─── Supabase client uses service role key ────────────────────────────────

  it("15. lib/supabase.ts reads SUPABASE_SERVICE_ROLE_KEY (not anon key)", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../lib/supabase.ts"),
      "utf-8"
    );
    expect(src).toContain("SERVICE_ROLE_KEY");
    expect(src).not.toContain("SUPABASE_ANON_KEY");
  });

});
