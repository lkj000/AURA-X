-- CONTENT IDENTITY FOR AUDIO FILES.
--
-- `ready_for_training` counted ROWS in dataset_records and compared them to 100. On the live dataset
-- that reads 389, and the corpus is 152 distinct recordings: most files were ingested three times, one
-- six times. The flag would read true on a hundred copies of a single track.
--
-- Nothing in the schema could tell them apart. Every duplicate carries its own `audio_files` row, its
-- own id and its own storage path — measured on the live data, distinct `audio_file_id` equals the
-- row count exactly (389 of 389), so counting ids is no improvement whatsoever. The filenames differ
-- too: the same recording appears as `King_Deetoy_...mp3` and as the URL-encoded form with spaces, so
-- name matching splits identical audio in two. Only the bytes identify the recording.
--
-- Nullable and not backfilled by this migration. Hashing requires reading every object out of storage,
-- which is a script's job, not a schema change's. Until a row is hashed its content identity is
-- UNKNOWN, and the code treats unknown as unknown rather than assuming distinctness — assuming it is
-- how the count reached 389 in the first place.
alter table audio_files
  add column if not exists content_sha256 text;

-- Partial: only hashed rows are of interest, and the column is expected to be sparse until a backfill
-- has run.
create index if not exists audio_files_content_sha256_idx
  on audio_files (content_sha256)
  where content_sha256 is not null;

comment on column audio_files.content_sha256 is
  'SHA-256 of the complete file. Identifies the RECORDING, not the upload: the same audio exists at multiple storage paths with different ids and different filename sanitisation. NULL means not yet hashed — treat as unknown, never as distinct.';
