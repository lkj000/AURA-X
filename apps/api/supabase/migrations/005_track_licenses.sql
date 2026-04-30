-- Track licensing records: each claim triggers a NEXUS royalty payout
CREATE TABLE IF NOT EXISTS track_licenses (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id    UUID         NOT NULL REFERENCES tracks(id),
  artist_id   UUID         NOT NULL REFERENCES artists(id),
  platform    TEXT         NOT NULL,
  period      TEXT         NOT NULL,
  amount_usd  NUMERIC(10,2) NOT NULL CHECK (amount_usd > 0),
  nexus_payout JSONB,
  status      TEXT         NOT NULL DEFAULT 'claimed',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- One claim per track per period
CREATE UNIQUE INDEX IF NOT EXISTS track_licenses_track_period
  ON track_licenses (track_id, period);
