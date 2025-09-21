const MIX_ROYALTY_CONFIG = {
  TOTAL_PAYOUT_PERCENTAGE: 0.70,
  CURATOR_SHARE_OF_PAYOUT: 0.40,
};

/**
 * Processes the royalty distribution for a purchased mix.
 * @param {object} trx - The active Knex.js database transaction.
 * @param {number} mixId - The ID of the purchased mix.
 * @param {number} buyerId - The ID of the user who purchased the mix.
 * @param {number} purchasePrice - The price paid for the mix (in credits).
 */
async function distributeMixRoyalties(trx, mixId, buyerId, purchasePrice) {
  const mix = await trx('mixes').where({ id: mixId }).first();
  const mixTracks = await trx('mix_tracks')
    .join('tracks', 'mix_tracks.track_id', 'tracks.id')
    .where({ mix_id: mixId })
    .select('tracks.creator_id');

  const totalPayout = purchasePrice * MIX_ROYALTY_CONFIG.TOTAL_PAYOUT_PERCENTAGE;
  const curatorShare = totalPayout * MIX_ROYALTY_CONFIG.CURATOR_SHARE_OF_PAYOUT;
  const creatorsPool = totalPayout - curatorShare;
  const perTrackCreatorShare = creatorsPool / mixTracks.length;

  // 1. Transaction and credit for the DJ/Curator
  await trx('users').where({ id: mix.curator_id }).increment('credit_balance', Math.floor(curatorShare));
  await trx('transactions').insert({
    buyer_id: buyerId,
    recipient_id: mix.curator_id,
    amount: Math.floor(curatorShare),
    source_mix_id: mixId,
  });

  // 2. Transactions and credits for each original track creator
  for (const track of mixTracks) {
    await trx('users').where({ id: track.creator_id }).increment('credit_balance', Math.floor(perTrackCreatorShare));
    await trx('transactions').insert({
      buyer_id: buyerId,
      recipient_id: track.creator_id,
      amount: Math.floor(perTrackCreatorShare),
      source_mix_id: mixId,
    });
  }
}

module.exports = { distributeMixRoyalties };