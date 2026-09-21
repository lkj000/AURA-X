/**
 * RECORD HOW EACH RECORDING ENTERED THE CORPUS.
 *
 * Every dataset record here came from the Bandcamp archive — `metadata.source === "bandcamp"` — and
 * the owner holds purchase receipts for it. This writes that down, so the next person to ask does not
 * have to ask a person.
 *
 * ── PROVENANCE, NOT CLEARANCE ──────────────────────────────────────────────────────────────────────
 *
 * `bandcamp_purchase` says the audio was lawfully obtained and is traceable to a receipt. It does NOT
 * say the corpus is cleared for model training or for reference-conditioned generation, which need
 * reproduction and derivative-works rights negotiated with the rights holder. Writing a value that
 * implied otherwise would manufacture a clearance out of a receipt, which is the same failure as a
 * default BPM reading as a measurement.
 *
 * ── WHAT IT WILL NOT DO ────────────────────────────────────────────────────────────────────────────
 *
 * Only records whose `metadata.source` is "bandcamp" are touched. A record that does not say where it
 * came from does not acquire a provenance from this script — it stays `unknown`, which is the true
 * value. Existing non-default values are never overwritten.
 *
 *   npx ts-node --transpile-only scripts/backfill_rights_basis.ts
 *   npx ts-node --transpile-only scripts/backfill_rights_basis.ts --apply
 */
import { createClient } from "@supabase/supabase-js";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../apps/api/.env") });

const APPLY = process.argv.includes("--apply");

/**
 * The evidence, written once here rather than typed per record.
 *
 * Two orders on 13 April 2026 covering the Amapiano archive: a full-discography purchase and three
 * further albums. Identifiers are included so the claim can be checked against the receipts rather
 * than believed.
 */
const BASIS = "bandcamp_purchase";
const REFERENCE = [
  "Bandcamp digital purchases, 13 April 2026",
  "order 2244540289 (New Money Gang, full discography, 100 releases)",
  "txn 3300791779 (Piano Hub, 3 albums)",
  "account botswana@okovanggoai.com",
  "PROVENANCE ONLY — evidences lawful acquisition and personal listening,",
  "not rights to train on or derive from these recordings.",
].join(" · ");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}
const supabase = createClient(url, key);

(async () => {
  const { data: rows, error } = await supabase
    .from("dataset_records")
    .select("id, metadata, rights_basis");

  if (error || !rows) {
    console.error("Could not read dataset_records:", error?.message);
    process.exit(1);
  }

  const isBandcamp = (m: unknown) =>
    (m as { source?: string } | null)?.source === "bandcamp";

  const eligible = rows.filter(r => isBandcamp(r.metadata) && (r.rights_basis ?? "unknown") === "unknown");
  const already  = rows.filter(r => (r.rights_basis ?? "unknown") !== "unknown");
  const noSource = rows.filter(r => !isBandcamp(r.metadata) && (r.rights_basis ?? "unknown") === "unknown");

  console.log(`dataset_records:          ${rows.length}`);
  console.log(`${APPLY ? "setting" : "would set"} bandcamp_purchase: ${eligible.length}`);
  console.log(`already have a basis:     ${already.length}`);
  console.log(`no bandcamp provenance:   ${noSource.length}  (left as unknown — the true value)`);
  console.log(`\nbasis:     ${BASIS}`);
  console.log(`reference: ${REFERENCE}\n`);

  if (!APPLY) { console.log("Re-run with --apply to write."); return; }

  let done = 0;
  for (const r of eligible) {
    const { error: upErr } = await supabase
      .from("dataset_records")
      .update({ rights_basis: BASIS, rights_reference: REFERENCE })
      .eq("id", r.id);
    if (upErr) { console.error(`failed ${r.id}: ${upErr.message}`); continue; }
    done++;
  }
  console.log(`set: ${done} of ${eligible.length}`);
})();
