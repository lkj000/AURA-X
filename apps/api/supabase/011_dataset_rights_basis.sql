-- WHERE A RECORDING CAME FROM, AND ON WHAT BASIS IT IS IN THE CORPUS.
--
-- Nothing recorded this. The only provenance on any dataset record was
-- `metadata: { source: "bandcamp", original_filename }`, plus `source: "human"` — which means
-- human-curated, not human-cleared. So anyone arriving at the corpus reached the same question from
-- the same silence, and the answer existed only in the owner's memory.
--
-- ── WHAT THESE COLUMNS ARE FOR, AND WHAT THEY ARE NOT ──────────────────────────────────────────────
--
-- `rights_basis` records HOW the audio was obtained. It is provenance, not clearance. The distinction
-- is the whole reason the column is named this way rather than `licensed` or `cleared`:
--
--   bandcamp_purchase   A Bandcamp digital purchase, evidenced by a receipt. Establishes lawful
--                       acquisition and personal listening. Does NOT by itself establish the
--                       reproduction or derivative-works rights that training a generative model, or
--                       producing a reference-conditioned cover, would require. Those are negotiated
--                       with the rights holder.
--   unknown             Default. Nothing is assumed.
--
-- A column called `cleared_for_training` would invite a boolean nobody can substantiate. This one
-- states a fact that is evidenced and leaves the scope question visible rather than answered by
-- omission — the same reason `audio_files.content_sha256` treats NULL as unknown rather than
-- distinct, and `suno_classified_by` was not backfilled with a plausible actor.
--
-- ── WHY IT LIVES ON dataset_records ────────────────────────────────────────────────────────────────
--
-- The basis attaches to a recording's presence IN THE CORPUS, which is what a dataset record is. The
-- same audio may later arrive under a different basis, and that is a different record rather than a
-- rewrite of this one.
alter table dataset_records
  add column if not exists rights_basis     text not null default 'unknown',
  add column if not exists rights_reference text;

create index if not exists dataset_records_rights_basis_idx
  on dataset_records (rights_basis);

comment on column dataset_records.rights_basis is
  'How the audio was obtained: bandcamp_purchase | unknown. PROVENANCE, not clearance — a purchase evidences lawful acquisition and personal listening, not rights to train on or derive from the recording.';

comment on column dataset_records.rights_reference is
  'Evidence for the basis: order and transaction identifiers, purchasing account, date. Free text, because a receipt is not a schema.';
