-- ─── MIGRATION 003 — producer_feedback + gold_standard_generations ────────────

CREATE TABLE IF NOT EXISTS gold_standard_generations (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id          UUID        NOT NULL,
  generation_id     UUID        NOT NULL,
  subgenre          TEXT        NOT NULL,
  bpm               NUMERIC     NOT NULL,
  key               TEXT        NOT NULL,
  ctl_snapshot      JSONB       NOT NULL,
  composite_score   NUMERIC     NOT NULL,
  producer_score    INTEGER     NOT NULL CHECK (producer_score BETWEEN 1 AND 5),
  producer_notes    TEXT,
  cultural_accuracy INTEGER     CHECK (cultural_accuracy BETWEEN 1 AND 5),
  source            TEXT        NOT NULL DEFAULT 'producer_rating',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS producer_feedback (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id          UUID        NOT NULL,
  generation_id     UUID        NOT NULL,
  rating            INTEGER     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  subgenre_notes    TEXT,
  cultural_accuracy INTEGER     CHECK (cultural_accuracy BETWEEN 1 AND 5),
  promoted_to_gold  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS producer_feedback_generation_unique
  ON producer_feedback (generation_id);
