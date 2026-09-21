/**
 * POPULATE audio_files.content_sha256, SO READINESS CAN BE COUNTED IN RECORDINGS.
 *
 * `getDatasetStats` withholds `ready_for_training` until every dataset record resolves to a content
 * hash, because the alternative — counting rows — is the defect it replaces. This is what makes the
 * hashes exist.
 *
 * ── TWO SOURCES, AND THE CHEAP ONE FIRST ───────────────────────────────────────────────────────────
 *
 *   --manifest <file>   Read hashes already computed elsewhere. A library build that downloaded and
 *                       hashed the archive has them; re-downloading 12.3 GB to recompute the same
 *                       numbers is waste, not diligence. The file must carry `storage_path` and
 *                       `sha256` per object.
 *   (default)           Stream each object from storage and hash it here. Correct, and slow.
 *
 * Either way the hash is of the COMPLETE file. Not the filename, which splits one recording in two
 * where sanitisation differs, and not the id or path, which are unique per upload and therefore
 * useless for identifying a recording.
 *
 * ── SAFETY ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Writes one nullable column and nothing else. Dry-run by default: it reports what it would set and
 * exits. It never overwrites a hash that differs from what it computed — a disagreement means the
 * object changed underneath, or the manifest describes a different archive, and both deserve a human
 * rather than a silent update.
 *
 *   npx ts-node --transpile-only scripts/backfill_audio_hashes.ts --manifest ../lib/manifest.json
 *   npx ts-node --transpile-only scripts/backfill_audio_hashes.ts --manifest ../lib/manifest.json --apply
 */
import { createClient } from "@supabase/supabase-js";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../apps/api/.env") });

const APPLY = process.argv.includes("--apply");
const manifestArg = process.argv.indexOf("--manifest");
const MANIFEST = manifestArg > -1 ? process.argv[manifestArg + 1] : null;
const BUCKET = "aura-x-audio";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}
const supabase = createClient(url, key);

/** storage_path -> sha256, from a manifest produced by something that already read the bytes. */
function hashesFromManifest(file: string): Map<string, string> {
  const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as
    | { objects?: Array<{ storage_path?: string; sha256?: string; status?: string }> }
    | Array<{ storage_path?: string; sha256?: string; status?: string }>;
  const objects = Array.isArray(raw) ? raw : raw.objects ?? [];
  const map = new Map<string, string>();
  for (const o of objects) {
    // Only entries whose bytes were actually verified. A manifest may record failures too, and a
    // hash from a partial download is worse than no hash.
    if (o.storage_path && o.sha256 && (o.status === undefined || o.status === "verified")) {
      map.set(o.storage_path, o.sha256);
    }
  }
  return map;
}

async function hashFromStorage(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) return null;
  const buf = Buffer.from(await (data as Blob).arrayBuffer());
  return crypto.createHash("sha256").update(buf).digest("hex");
}

(async () => {
  const { data: rows, error } = await supabase
    .from("audio_files")
    .select("id, storage_path, content_sha256");

  if (error || !rows) {
    console.error("Could not read audio_files:", error?.message);
    process.exit(1);
  }

  const fromManifest = MANIFEST ? hashesFromManifest(MANIFEST) : null;
  if (fromManifest) console.log(`manifest: ${fromManifest.size} verified hashes`);
  console.log(`audio_files rows: ${rows.length}`);
  console.log(APPLY ? "APPLYING\n" : "DRY RUN — nothing will be written\n");

  let set = 0, already = 0, missing = 0, conflict = 0;

  for (const row of rows) {
    const existing = row.content_sha256 as string | null;
    const computed = fromManifest
      ? fromManifest.get(row.storage_path as string) ?? null
      : await hashFromStorage(row.storage_path as string);

    if (!computed) { missing++; continue; }

    if (existing && existing !== computed) {
      // Never silently overwritten: either the stored object changed, or this manifest describes a
      // different archive. Both are findings, not routine.
      conflict++;
      console.error(`CONFLICT ${row.storage_path}\n  stored   ${existing}\n  computed ${computed}`);
      continue;
    }
    if (existing === computed) { already++; continue; }

    if (APPLY) {
      const { error: upErr } = await supabase
        .from("audio_files")
        .update({ content_sha256: computed })
        .eq("id", row.id);
      if (upErr) { console.error(`failed ${row.id}: ${upErr.message}`); continue; }
    }
    set++;
  }

  console.log(`\n${APPLY ? "set" : "would set"}: ${set}`);
  console.log(`already correct: ${already}`);
  console.log(`no hash available: ${missing}`);
  console.log(`CONFLICTS (not written): ${conflict}`);
  if (!APPLY) console.log("\nRe-run with --apply to write.");
  if (conflict > 0) process.exitCode = 1;
})();
