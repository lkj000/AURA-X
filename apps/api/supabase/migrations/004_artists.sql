-- ─── MIGRATION 004 — artists ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS artists (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  country       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS artists_email_unique ON artists (email);
