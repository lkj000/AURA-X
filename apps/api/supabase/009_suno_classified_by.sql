-- WHO APPROVED IT, recorded on the row.
--
-- `suno_approved` is half the marketplace listing gate, and until now nothing recorded who moved it.
-- That was survivable while ANY artist with a valid token could set it on ANY track — there was no
-- authority worth attributing. Now that approval requires either the classification integration or a
-- named moderator, the actor is worth keeping: an approval nobody can attribute is one nobody can
-- review, on the field that decides what may be sold.
--
-- Nullable, and deliberately not backfilled. Rows approved before this column existed were approved by
-- an unknown party, and writing a plausible value into them would manufacture provenance that does not
-- exist. NULL means "we do not know who approved this", which is the truth about every row predating
-- the guard.
ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS suno_classified_by  text;

COMMENT ON COLUMN tracks.suno_classified_by IS
  'Actor that last set suno_approved: the integration identifier, or a moderator artist id. NULL for rows approved before approval was gated.';
