-- Migration 006: royalty_splits
-- One row per track per period. splits JSONB records each recipient's share and NEXUS payout ref.

CREATE TABLE IF NOT EXISTS royalty_splits (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id         UUID        NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  period           TEXT        NOT NULL,
  total_amount_usd NUMERIC(10,2) NOT NULL CHECK (total_amount_usd > 0),
  splits           JSONB       NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'PENDING'
                               CHECK (status IN ('PENDING', 'PAID', 'FAILED')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (track_id, period)
);
