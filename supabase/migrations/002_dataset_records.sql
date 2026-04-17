-- ─── MIGRATION 002 — dataset_records + nullable ctl_id ──────────────────────
-- Run this in the Supabase SQL editor before running ingest_bandcamp.ts

-- 1. Make generations.ctl_id nullable so human-curated tracks don't need a CTL
alter table generations
  alter column ctl_id drop not null;

-- 2. Create the dataset_records table (training dataset index)
create table if not exists dataset_records (
  id               uuid primary key default uuid_generate_v4(),
  track_id         uuid not null references tracks(id) on delete cascade,
  generation_id    uuid references generations(id),
  audio_file_id    uuid references audio_files(id),
  subgenre         text not null,
  bpm              numeric(5,2),
  key              text,
  composite_score  numeric(4,3) not null,
  source           text not null default 'auto',  -- 'auto' | 'human'
  split            text not null default 'train', -- 'train' | 'val' | 'test'
  passed_gate      boolean not null default false,
  metadata         jsonb,
  created_at       timestamptz not null default now()
);

create index dataset_records_split_idx    on dataset_records(split);
create index dataset_records_source_idx   on dataset_records(source);
create index dataset_records_score_idx    on dataset_records(composite_score desc);
create index dataset_records_track_id_idx on dataset_records(track_id);

alter table dataset_records enable row level security;
create policy "dataset_service_all" on dataset_records using (true) with check (true);
