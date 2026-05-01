-- P3-5: Suno external classification gate
ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS suno_approved       boolean,
  ADD COLUMN IF NOT EXISTS suno_classified_at  timestamptz,
  ADD COLUMN IF NOT EXISTS suno_style_tag      text;
