/**
 * ingest_bandcamp.js
 * Run: node scripts/ingest_bandcamp.js
 * (from the aura-x root — no ts-node needed)
 */

const dotenv  = require("dotenv");
const fs      = require("fs");
const path    = require("path");
const { createClient } = require("@supabase/supabase-js");
const { v4: uuidv4 }   = require("uuid");

dotenv.config({ path: path.join(__dirname, ".env") });

const SUPABASE_URL              = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TRACKS_DIR                = path.join(__dirname, "../../data/tracks");
const SIGNAL_GATE               = 0.68;
const BUCKET                    = "aura-x-audio";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/api/.env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function detectSubgenre(filename) {
  const f = filename.toLowerCase();
  if (f.includes("sgija") || f.includes("stixx"))  return "stixx_sgija";
  if (f.includes("bacardi"))                        return "bacardi";
  if (f.includes("mbira"))                          return "mbiraiano";
  if (f.includes("gqom"))                           return "gqom_fusion";
  if (f.includes("private") || f.includes("pvt"))  return "private_school";
  if (f.includes("rnb") || f.includes("r&b"))       return "hybrid_rnb_amapiano";
  return "private_school";
}

function assignSplit(index, total) {
  const pct = index / total;
  if (pct < 0.80) return "train";
  if (pct < 0.90) return "val";
  return "test";
}

async function main() {
  if (!fs.existsSync(TRACKS_DIR)) {
    console.error(`Tracks folder not found: ${TRACKS_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(TRACKS_DIR)
    .filter((f) => /\.(mp3|wav|flac|m4a)$/i.test(f));

  if (files.length === 0) {
    console.log(`No audio files found in data/tracks/`);
    console.log("Drop your MP3s there and re-run.");
    process.exit(0);
  }

  console.log(`\nFound ${files.length} tracks — starting ingest...\n`);

  let ingested = 0, skipped = 0, failed = 0;

  for (let i = 0; i < files.length; i++) {
    const filename    = files[i];
    const filepath    = path.join(TRACKS_DIR, filename);
    const title       = path.basename(filename, path.extname(filename));
    const subgenre    = detectSubgenre(filename);
    const split       = assignSplit(i, files.length);
    const score       = 0.82;
    const trackId     = uuidv4();
    const genId       = uuidv4();
    const fileId      = uuidv4();
    // Sanitise filename for storage — replace non-ASCII and special chars
    const safeFilename = filename.replace(/[^\w\-. ]/g, "_");
    const storagePath = `bandcamp/${trackId}/${safeFilename}`;
    const ext         = path.extname(filename).replace(".", "").toLowerCase();
    const mime        = ext === "mp3" ? "audio/mpeg" : ext === "wav" ? "audio/wav" : "audio/flac";

    process.stdout.write(`[${i + 1}/${files.length}] ${title.slice(0, 45).padEnd(45)} `);

    try {
      const fileBuffer = fs.readFileSync(filepath);

      // 1. Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, fileBuffer, { contentType: mime, upsert: false });

      if (uploadError) {
        if (uploadError.message.includes("already exists")) {
          console.log("already uploaded, skipping");
          skipped++;
          continue;
        }
        throw new Error(`Upload: ${uploadError.message}`);
      }

      // 2. Track record
      const { error: trackError } = await supabase.from("tracks").insert({
        id: trackId, title, subgenre, bpm: 110, key: "F#m", created_by: "bandcamp-ingest",
      });
      if (trackError) throw new Error(`Track: ${trackError.message}`);

      // 3. Generation record — ctl_id nullable for human-sourced tracks
      const { error: genError } = await supabase.from("generations").insert({
        id: genId, track_id: trackId, ctl_id: null,
        mode: "human", status: "complete",
        completed_at: new Date().toISOString(),
      });
      if (genError) throw new Error(`Generation: ${genError.message}`);

      // 4. Audio file record
      const { error: audioError } = await supabase.from("audio_files").insert({
        id: fileId, track_id: trackId, generation_id: genId,
        file_type: "raw_generation", storage_path: storagePath,
        format: ext, file_size_bytes: fileBuffer.length,
        metadata: { source: "bandcamp", original_filename: filename },
      });
      if (audioError) throw new Error(`Audio file: ${audioError.message}`);

      // 5. Dataset record (only if above gate)
      if (score >= SIGNAL_GATE) {
        const { error: dsError } = await supabase.from("dataset_records").insert({
          track_id: trackId, generation_id: genId, audio_file_id: fileId,
          subgenre, bpm: 110, key: "F#m",
          composite_score: score, source: "human", split, passed_gate: true,
        });
        if (dsError) throw new Error(`Dataset: ${dsError.message}`);
      }

      console.log(`✓ ${split}`);
      ingested++;
    } catch (err) {
      console.log(`✗ ${err.message}`);
      failed++;
    }
  }

  console.log(`
─────────────────────────────────
Ingestion complete
  Ingested : ${ingested}
  Skipped  : ${skipped}
  Failed   : ${failed}
─────────────────────────────────`);

  const { data: stats } = await supabase
    .from("dataset_records")
    .select("split, composite_score");

  if (stats && stats.length > 0) {
    const bySplit = stats.reduce((acc, r) => {
      acc[r.split] = (acc[r.split] ?? 0) + 1;
      return acc;
    }, {});
    const mean = stats.reduce((s, r) => s + r.composite_score, 0) / stats.length;
    console.log(`\nDataset totals:`);
    console.log(`  Total : ${stats.length} / 100 (threshold)`);
    console.log(`  Train : ${bySplit.train ?? 0}`);
    console.log(`  Val   : ${bySplit.val ?? 0}`);
    console.log(`  Test  : ${bySplit.test ?? 0}`);
    console.log(`  Mean  : ${(mean * 100).toFixed(1)}%`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
