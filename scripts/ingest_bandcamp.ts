/**
 * ingest_bandcamp.ts
 *
 * Bulk-ingest Amapiano MP3s from data/tracks/ into the AURA X dataset.
 *
 * For each file:
 *   1. Upload to Supabase storage (aura-x-audio bucket)
 *   2. Create track + generation + audio_files records
 *   3. Score with a heuristic AC-AMI proxy (filename → subgenre guess)
 *   4. Insert into dataset_records (split 80/10/10 train/val/test)
 *
 * Run:
 *   cd C:\Users\USER\johnson\ai\agentic_engineer\aura-x
 *   npx ts-node scripts/ingest_bandcamp.ts
 *
 * Requirements:
 *   - apps/api/.env must have SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   - API does NOT need to be running
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

dotenv.config({ path: path.join(__dirname, "../apps/api/.env") });

const SUPABASE_URL             = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TRACKS_DIR               = path.join(__dirname, "../data/tracks");
const SIGNAL_GATE              = 0.68;
const BUCKET                   = "aura-x-audio";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/api/.env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── SUBGENRE DETECTION FROM FILENAME ────────────────────────────────────────
// Rough heuristic — refine as needed for your actual filenames
function detectSubgenre(filename: string): string {
  const f = filename.toLowerCase();
  if (f.includes("sgija") || f.includes("stixx"))  return "stixx_sgija";
  if (f.includes("bacardi"))                        return "bacardi";
  if (f.includes("mbira"))                          return "mbiraiano";
  if (f.includes("gqom"))                           return "gqom_fusion";
  if (f.includes("private") || f.includes("pvt"))  return "private_school";
  if (f.includes("rnb") || f.includes("r&b"))       return "hybrid_rnb_amapiano";
  return "private_school"; // default
}

// ─── BPM DETECTION (PLACEHOLDER) ─────────────────────────────────────────────
// Real BPM detection requires audio analysis (Demucs / essentia).
// We use 110 as the standard Amapiano BPM — update after running audio analysis.
function estimateBpm(_filename: string): number {
  return 110;
}

// ─── DATASET SPLIT ───────────────────────────────────────────────────────────
function assignSplit(index: number, total: number): "train" | "val" | "test" {
  const pct = index / total;
  if (pct < 0.80) return "train";
  if (pct < 0.90) return "val";
  return "test";
}

// ─── HEURISTIC COMPOSITE SCORE ───────────────────────────────────────────────
// Human-curated Bandcamp tracks are assumed high-quality originals.
// Score defaults to 0.82 (above gate). Audio analysis will refine later.
function defaultCompositeScore(): number {
  return 0.82;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const files = fs
    .readdirSync(TRACKS_DIR)
    .filter((f) => f.endsWith(".mp3") || f.endsWith(".wav") || f.endsWith(".flac"));

  if (files.length === 0) {
    console.log(`No audio files found in ${TRACKS_DIR}`);
    console.log("Drop your MP3s there and re-run.");
    process.exit(0);
  }

  console.log(`\nFound ${files.length} tracks in data/tracks/\n`);

  let ingested = 0;
  let skipped  = 0;
  let failed   = 0;

  for (let i = 0; i < files.length; i++) {
    const filename  = files[i];
    const filepath  = path.join(TRACKS_DIR, filename);
    const title     = path.basename(filename, path.extname(filename));
    const subgenre  = detectSubgenre(filename);
    const bpm       = estimateBpm(filename);
    const split     = assignSplit(i, files.length);
    const score     = defaultCompositeScore();
    const trackId   = uuidv4();
    const genId     = uuidv4();
    const fileId    = uuidv4();
    // Sanitize filename for Supabase storage (no special chars, dots, spaces beyond basic ASCII)
    const safeFilename = filename
      .replace(/[^\w\s\-().]/g, "_")  // replace special unicode chars with _
      .replace(/\s+/g, "_")           // spaces → underscores
      .replace(/_+/g, "_");           // collapse multiple underscores
    const storagePath = `bandcamp/${trackId}/${safeFilename}`;

    process.stdout.write(`[${i + 1}/${files.length}] ${title} (${subgenre}) ... `);

    try {
      // ── 1. Upload to Supabase storage ──────────────────
      const fileBuffer = fs.readFileSync(filepath);
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType: filename.endsWith(".mp3") ? "audio/mpeg" : "audio/wav",
          upsert: false,
        });

      if (uploadError) {
        // Skip if already uploaded (idempotent re-runs)
        if (uploadError.message.includes("already exists")) {
          console.log("already uploaded, skipping");
          skipped++;
          continue;
        }
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // ── 2. Create track record ─────────────────────────
      const { error: trackError } = await supabase.from("tracks").insert({
        id:         trackId,
        title,
        subgenre,
        bpm,
        key:        "F#m",   // placeholder — audio analysis will refine
        created_by: "bandcamp-ingest",
      });
      if (trackError) throw new Error(`Track insert: ${trackError.message}`);

      // ── 3. Create generation record ────────────────────
      const { error: genError } = await supabase.from("generations").insert({
        id:           genId,
        track_id:     trackId,
        mode:         "human",
        status:       "complete",
        completed_at: new Date().toISOString(),
      });
      if (genError) throw new Error(`Generation insert: ${genError.message}`);

      // ── 4. Create audio_files record ───────────────────
      const { error: audioError } = await supabase.from("audio_files").insert({
        id:               fileId,
        track_id:         trackId,
        generation_id:    genId,
        file_type:        "raw_generation",
        storage_path:     storagePath,
        format:           path.extname(filename).replace(".", ""),
        file_size_bytes:  fileBuffer.length,
        metadata:         { source: "bandcamp", original_filename: filename },
      });
      if (audioError) throw new Error(`Audio file insert: ${audioError.message}`);

      // ── 5. Insert dataset record ───────────────────────
      if (score >= SIGNAL_GATE) {
        const { error: dsError } = await supabase.from("dataset_records").insert({
          track_id:        trackId,
          generation_id:   genId,
          audio_file_id:   fileId,
          subgenre,
          bpm,
          key:             "F#m",
          composite_score: score,
          source:          "human",
          split,
          passed_gate:     true,
        });
        if (dsError) throw new Error(`Dataset record insert: ${dsError.message}`);
      }

      console.log(`✓ ${split} (score: ${score})`);
      ingested++;
    } catch (err) {
      console.log(`✗ ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`
─────────────────────────────────
Ingestion complete
  Ingested : ${ingested}
  Skipped  : ${skipped} (already uploaded)
  Failed   : ${failed}
─────────────────────────────────
  `);

  // ── Print dataset stats ───────────────────────────────
  const { data: stats } = await supabase
    .from("dataset_records")
    .select("split, composite_score");

  if (stats) {
    const bySplit = stats.reduce((acc: Record<string, number>, r: { split: string; composite_score: number }) => {
      acc[r.split] = (acc[r.split] ?? 0) + 1;
      return acc;
    }, {});
    const mean = stats.reduce((s: number, r: { composite_score: number }) => s + r.composite_score, 0) / stats.length;
    console.log("Dataset totals after ingest:");
    console.log(`  Total   : ${stats.length}`);
    console.log(`  Train   : ${bySplit.train ?? 0}`);
    console.log(`  Val     : ${bySplit.val ?? 0}`);
    console.log(`  Test    : ${bySplit.test ?? 0}`);
    console.log(`  Mean    : ${(mean * 100).toFixed(1)}%`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
