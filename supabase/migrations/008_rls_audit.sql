-- ─── MIGRATION 008 — RLS Audit ────────────────────────────────────────────────
-- All API access uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS entirely.
-- Tables added in migrations 003–006 were missing RLS, leaving them open to
-- direct Supabase client calls without any policy gate. This migration closes
-- that gap by enabling RLS and adding service-all policies consistent with
-- the pattern established in 001_initial_schema.sql.
--
-- Audit summary:
--   001: tracks, ctls, generations, audio_files, evaluations, dj_sets  ✓ (already covered)
--   002: dataset_records                                                  ✓ (already covered)
--   003: gold_standard_generations, producer_feedback                    ✗ → FIXED HERE
--   004: artists                                                          ✗ → FIXED HERE
--   005: track_licenses                                                   ✗ → FIXED HERE
--   006: royalty_splits                                                   ✗ → FIXED HERE
--   007: suno columns on tracks (existing table, RLS already active)      ✓

alter table gold_standard_generations enable row level security;
create policy "gold_std_service_all"
  on gold_standard_generations using (true) with check (true);

alter table producer_feedback enable row level security;
create policy "producer_feedback_service_all"
  on producer_feedback using (true) with check (true);

alter table artists enable row level security;
create policy "artists_service_all"
  on artists using (true) with check (true);

alter table track_licenses enable row level security;
create policy "track_licenses_service_all"
  on track_licenses using (true) with check (true);

alter table royalty_splits enable row level security;
create policy "royalty_splits_service_all"
  on royalty_splits using (true) with check (true);
