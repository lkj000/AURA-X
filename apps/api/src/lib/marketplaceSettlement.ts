/**
 * WHETHER THE MARKETPLACE MAY SETTLE MONEY, AND WHAT IT IS ALLOWED TO CLAIM.
 *
 * ── WHAT WAS WRONG ─────────────────────────────────────────────────────────────────────────────────
 *
 * Three routes agreed on a story that was not true, and each half-confirmed the others:
 *
 *   - `POST /:trackId/license` verified the track, then paid the producer and inserted a licence with
 *     `status: "active"` — WITHOUT CHARGING THE BUYER. No debit, no payment reference, no settlement
 *     check. A failed producer payout became a `FAILED` split and left the licence active anyway.
 *   - `processAuraPayout` on the NEXUS side returned `processed: true` with a `creatorWalletId` built
 *     by slicing a string and a `txId` built from a template. It writes nothing. AURA read the absence
 *     of an error as `PAID`.
 *   - `POST /earnings/withdraw` summed every PAID split for all time, subtracted no prior withdrawal,
 *     recorded nothing, and answered `WITHDRAWN`.
 *
 * So a licence could be obtained for nothing, a producer could be "paid" by arithmetic, and the same
 * earnings could be withdrawn without limit — and every status field said it had gone fine.
 *
 * ── WHAT THIS CHANGES ──────────────────────────────────────────────────────────────────────────────
 *
 * Not the ledger. There is no ledger, and inventing one here would be the same mistake in a new place.
 * What changes is that the code stops asserting settlement it cannot perform.
 *
 *   DISABLED   (default)  every money path refuses, and says why.
 *   SIMULATION            paths run for demonstration, and every artefact is stamped SIMULATED.
 *                         Never "active". Never "PAID". Never "WITHDRAWN".
 *
 * THERE IS DELIBERATELY NO "LIVE" VALUE. A mode cannot be the thing that makes this real: real means a
 * buyer was charged, a payment settled idempotently, and a payable ledger recorded it. When that
 * exists, whoever builds it removes these guards deliberately — rather than finding a flag already
 * waiting to be flipped, which is how simulated accounting becomes production accounting by accident.
 */

export type MarketplaceMode = "DISABLED" | "SIMULATION";

/**
 * READ AT CALL TIME, CAPTURED ONCE PER REQUEST.
 *
 * This was a module-load constant, on the reasoning that a value changing between the eligibility
 * check and the write could let one request span two policies. The reasoning is sound and the
 * mechanism was wrong: ES imports are hoisted, so a test setting the variable at the top of its file
 * runs AFTER the route module has already read it, and the suite silently exercises the wrong mode.
 *
 * Reading here and capturing the result in a local at the top of each handler gives both properties —
 * one policy per request, and a value a test can actually set. It is also the idiom the sibling
 * codebase already uses for exactly this kind of switch.
 *
 * Anything not exactly "SIMULATION" is DISABLED: a typo, a blank, or the word LIVE all refuse.
 */
export function marketplaceMode(): MarketplaceMode {
  return process.env.AURA_MARKETPLACE_MODE === "SIMULATION" ? "SIMULATION" : "DISABLED";
}

/** Statuses a simulated artefact may carry. They must never collide with a settled one. */
export const SIMULATED_LICENSE_STATUS = "simulated" as const;
export const SIMULATED_SPLIT_STATUS   = "SIMULATED" as const;

/**
 * The single refusal, so every money path declines in the same words and for the same reason.
 *
 * 503 rather than 400: the caller did nothing wrong, and the capability is absent rather than the
 * request invalid. 501 would say "never implemented"; this is "not implemented YET", and the
 * distinction matters to anyone reading logs to decide whether to wait or to build.
 */
export function settlementUnavailable(action: string): {
  status: number;
  body: Record<string, unknown>;
} {
  return {
    status: 503,
    body: {
      error: `${action} is not available: this platform cannot settle payments.`,
      reason: "SETTLEMENT_NOT_IMPLEMENTED",
      detail:
        "No buyer charge, payment settlement or payable ledger exists. Until one does, issuing a " +
        "licence or reporting a withdrawal would record money movement that did not occur.",
      mode: marketplaceMode(),
    },
  };
}

/**
 * What a simulated result must carry so it cannot be mistaken for a settled one downstream.
 *
 * Spread into every simulated response. A consumer that ignores it still sees `simulated: true`
 * rather than a bare success — the failure mode being guarded is a client that checks only for the
 * absence of an error, which is exactly how `processed: true` became `PAID`.
 */
export const SIMULATION_NOTICE = {
  simulated: true,
  settlement: "NONE" as const,
  notice:
    "SIMULATED — no money moved. No buyer was charged, no wallet was credited, and no payable was " +
    "recorded. This result is for demonstration and must not be treated as settlement.",
};
