/**
 * backfill_audio_analysis.ts
 *
 * Job 38 — Audio Feature Bridge (backfill pass)
 *
 * Calls the Python audio analyzer for every dataset_records row that
 * has an audio_file_id but still holds placeholder BPM/key values,
 * then updates dataset_records with real signal features and a
 * signal-grounded composite score.
 *
 * Run AFTER starting the Python audio service:
 *   cd apps/audio && uvicorn main:app --reload --port 8000
 *
 * Then:
 *   cd C:\Users\USER\johnson\ai\agentic_engineer\aura-x
 *   npx ts-node scripts/backfill_audio_analysis.ts
 *
 * Flags:
 *   --dry-run   Print what would change without writing to Supabase
 *   --limit N   Process at most N records (default: all)
 *   --force     Re-analyze even if metadata.analyzed_at is set
 */

import * as dotenv from "dotenv";
import * as path from "path";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.join(__dirname, "../apps/api/.env") });

const SUPABASE_URL              = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const AUDIO_SERVICE_URL         = process.env.AUDIO_SERVICE_URL ?? "http://localhost:8000";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/api/.env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const args       = process.argv.slice(2);
const DRY_RUN    = args.includes("--dry-run");
const FORCE      = args.includes("--force");
const limitIdx   = args.indexOf("--limit");
const LIMIT      = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 0;

// ─── COMPOSITE SCORE FORMULA ──────────────────────────────────────────────────
// Mirrors the formula in workers.ts audio.analyze handler.
// bpm_score: proximity to 110 BPM (Amapiano centre), ±30 BPM window
// energy_score: RMS energy (already 0-1 by Python analyser)
// onset_score: groove density (≥4 onsets/sec = 1.0)
function computeCompositeScore(bpm: number, energyMean: number, onsetDensity: number): number {
  const bpmScore    = Math.max(0, 1.0 - Math.abs(bpm - 110) / 30);
  const energyScore = Math.min(1.0, Math.max(0, energyMean));
  const onsetScore  = Math.min(1.0, (onsetDensity ?? 0) / 4.0);
  return parseFloat((0.50 * bpmScore + 0.30 * energyScore + 0.20 * onsetScore).toFixed(3));
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n─────────────────────────────────────────────────`);
  console.log(`  AURA X — Audio Analysis Backfill`);
  console.log(`  Audio service : ${AUDIO_SERVICE_URL}`);
  console.log(`  Dry run       : ${DRY_RUN}`);
  console.log(`  Force         : ${FORCE}`);
  if (LIMIT) console.log(`  Limit         : ${LIMIT}`);
  console.log(`─────────────────────────────────────────────────\n`);

  // ── 1. Check audio service health ─────────────────────────────────────────
  try {
    const health = await axios.get(`${AUDIO_SERVICE_URL}/analysis/status`, { timeout: 5000 });
    if (!health.data.librosa_available) {
      console.error("librosa not available in audio service — cannot analyze.");
      console.error("Run: pip install librosa in the apps/audio virtualenv.");
      process.exit(1);
    }
    console.log(`Audio service healthy — librosa available ✓\n`);
  } catch {
    console.error(`Cannot reach audio service at ${AUDIO_SERVICE_URL}`);
    console.error("Start it with: cd apps/audio && uvicorn main:app --reload --port 8000");
    process.exit(1);
  }

  // ── 2. Fetch dataset_records with audio_file_id ───────────────────────────
  let query = supabase
    .from("dataset_records")
    .select("id, track_id, audio_file_id, bpm, key, metadata")
    .not("audio_file_id", "is", null)
    .order("created_at", { ascending: true });

  if (LIMIT) query = query.limit(LIMIT);

  const { data: records, error } = await query;
  if (error || !records) {
    console.error("Failed to fetch dataset_records:", error?.message);
    process.exit(1);
  }

  // Filter already-analyzed unless --force
  const toProcess = FORCE
    ? records
    : records.filter(r => !(r.metadata as Record<string, unknown> | null)?.analyzed_at);

  console.log(`Found ${records.length} records with audio_file_id`);
  console.log(`To analyze: ${toProcess.length} (${records.length - toProcess.length} already done)\n`);

  // ── 3. Analyze each track ─────────────────────────────────────────────────
  let updated  = 0;
  let failed   = 0;
  let skipped  = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const row = toProcess[i];
    process.stdout.write(`[${i + 1}/${toProcess.length}] ${row.track_id} ... `);

    try {
      const res = await axios.post(
        `${AUDIO_SERVICE_URL}/analysis/analyze`,
        { audio_file_id: row.audio_file_id, track_id: row.track_id },
        { timeout: 120000 }
      );

      const a = res.data as {
        bpm: number;
        key: string;
        mode: string;
        energy_mean: number;
        onset_density: number;
        bpm_confidence: number;
        key_confidence: number;
      };

      const compositeScore = computeCompositeScore(a.bpm, a.energy_mean, a.onset_density);

      console.log(`BPM:${a.bpm.toFixed(1)} Key:${a.key} score:${compositeScore}`);

      if (!DRY_RUN) {
        const { error: updateError } = await supabase
          .from("dataset_records")
          .update({
            bpm:             a.bpm,
            key:             a.key,
            composite_score: compositeScore,
            metadata: {
              ...(row.metadata as object ?? {}),
              bpm_confidence:  a.bpm_confidence,
              key_confidence:  a.key_confidence,
              energy_mean:     a.energy_mean,
              onset_density:   a.onset_density,
              analyzed_at:     new Date().toISOString(),
            },
          })
          .eq("id", row.id);

        if (updateError) {
          console.error(`  ✗ Supabase update failed: ${updateError.message}`);
          failed++;
        } else {
          updated++;
        }
      } else {
        skipped++;
      }
    } catch (err) {
      const msg = (err as Error).message;
      console.log(`✗ ${msg}`);
      failed++;
    }
  }

  // ── 4. Summary ─────────────────────────────────────────────────────────────
  console.log(`\n─────────────────────────────────`);
  console.log(`  Backfill complete`);
  if (DRY_RUN) {
    console.log(`  Would update : ${toProcess.length - failed}`);
  } else {
    console.log(`  Updated  : ${updated}`);
    console.log(`  Skipped  : ${skipped}`);
    console.log(`  Failed   : ${failed}`);
  }
  console.log(`─────────────────────────────────\n`);

  // ── 5. Print updated dataset stats ─────────────────────────────────────────
  if (!DRY_RUN) {
    const { data: stats } = await supabase
      .from("dataset_records")
      .select("bpm, key, composite_score, split");

    if (stats && stats.length > 0) {
      const mean = stats.reduce((s, r) => s + (r.composite_score ?? 0), 0) / stats.length;
      const bySplit = stats.reduce((acc: Record<string, number>, r) => {
        acc[r.split] = (acc[r.split] ?? 0) + 1;
        return acc;
      }, {});
      const analyzed = stats.filter(r => r.bpm !== 110 || r.key !== "F#m").length;
      const placeholders = stats.length - analyzed;
      console.log("Dataset after backfill:");
      console.log(`  Total      : ${stats.length}`);
      console.log(`  Analyzed   : ${analyzed}`);
      console.log(`  Placeholder: ${placeholders} (bpm=110, key=F#m)`);
      console.log(`  Train      : ${bySplit.train ?? 0}`);
      console.log(`  Val        : ${bySplit.val ?? 0}`);
      console.log(`  Test       : ${bySplit.test ?? 0}`);
      console.log(`  Mean score : ${(mean * 100).toFixed(1)}%`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
