-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── TRACKS ───────────────────────────────────────────
create table tracks (
  id              uuid primary key default uuid_generate_v4(),
  title           text not null,
  subgenre        text not null,
  bpm             numeric(5,2) not null,
  key             text not null,
  generation_mode text not null default 'mode_1_suno',
  created_by      text not null,
  status          text not null default 'draft',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─── CTLS ─────────────────────────────────────────────
create table ctls (
  id         uuid primary key default uuid_generate_v4(),
  track_id   uuid not null references tracks(id) on delete cascade,
  version    integer not null default 1,
  ctl_json   jsonb not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create index ctls_track_id_idx on ctls(track_id);
create index ctls_active_idx on ctls(track_id, is_active);

-- ─── GENERATIONS ──────────────────────────────────────
create table generations (
  id            uuid primary key default uuid_generate_v4(),
  track_id      uuid not null references tracks(id) on delete cascade,
  ctl_id        uuid not null references ctls(id),
  mode          text not null,
  status        text not null default 'pending',
  prompt_style  text,
  prompt_lyrics text,
  replicate_id  text,
  suno_song_id  text,
  error_message text,
  duration_ms   integer,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index generations_track_id_idx on generations(track_id);
create index generations_status_idx on generations(status);

-- ─── AUDIO FILES ──────────────────────────────────────
create table audio_files (
  id              uuid primary key default uuid_generate_v4(),
  track_id        uuid not null references tracks(id) on delete cascade,
  generation_id   uuid references generations(id),
  file_type       text not null,
  storage_path    text not null,
  duration_sec    numeric(8,2),
  sample_rate     integer,
  format          text,
  file_size_bytes bigint,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);
create index audio_files_track_id_idx on audio_files(track_id);
create index audio_files_type_idx on audio_files(track_id, file_type);

-- ─── EVALUATIONS ──────────────────────────────────────
create table evaluations (
  id                             uuid primary key default uuid_generate_v4(),
  track_id                       uuid not null references tracks(id) on delete cascade,
  generation_id                  uuid not null references generations(id),
  audio_file_id                  uuid references audio_files(id),
  authenticity_score             numeric(4,3),
  subgenre_recognizability_score numeric(4,3),
  groove_clarity_score           numeric(4,3),
  harmonic_density_score         numeric(4,3),
  dj_mix_friendliness_score      numeric(4,3),
  cultural_lineage_coherence     numeric(4,3),
  composite_score                numeric(4,3),
  evaluator                      text not null default 'auto',
  passed_gate                    boolean,
  revision_needed                boolean default false,
  revision_notes                 text,
  raw_features                   jsonb,
  created_at                     timestamptz not null default now()
);
create index evaluations_track_id_idx on evaluations(track_id);
create index evaluations_composite_idx on evaluations(composite_score desc);

-- ─── DJ SETS ──────────────────────────────────────────
create table dj_sets (
  id                  uuid primary key default uuid_generate_v4(),
  title               text not null,
  duration_target_min integer not null default 30,
  energy_arc          text not null default 'build_peak_resolve',
  created_by          text not null,
  status              text not null default 'planning',
  tracklist           jsonb,
  audio_file_id       uuid references audio_files(id),
  mix_metadata        jsonb,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz
);

-- ─── UPDATED_AT TRIGGER ───────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tracks_updated_at
  before update on tracks
  for each row execute function update_updated_at();

-- ─── ROW LEVEL SECURITY ───────────────────────────────
alter table tracks      enable row level security;
alter table ctls        enable row level security;
alter table generations enable row level security;
alter table audio_files enable row level security;
alter table evaluations enable row level security;
alter table dj_sets     enable row level security;

create policy "tracks_service_all"   on tracks      using (true) with check (true);
create policy "ctls_service_all"     on ctls        using (true) with check (true);
create policy "gens_service_all"     on generations using (true) with check (true);
create policy "audio_service_all"    on audio_files using (true) with check (true);
create policy "evals_service_all"    on evaluations using (true) with check (true);
create policy "djsets_service_all"   on dj_sets     using (true) with check (true);
