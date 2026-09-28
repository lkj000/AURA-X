/**
 * A-07 — BUDGET AND SAFETY ENVELOPE
 *
 * What a run is allowed to spend, checked before it spends it.
 *
 * Actions reach Replicate, Modal and audio compute. Nothing counted, and no ceiling existed — so a
 * retry storm was indistinguishable from normal operation until the invoice arrived. An autonomous
 * loop over that is an unbounded bill, which is why A-06 is gated on this job rather than the other
 * way round.
 *
 * METERED IN INVOCATIONS, NOT MONEY, AND THE REASON MATTERS. A currency ceiling needs a price per
 * action, and no action declares one: Replicate bills by model-second, Modal by GPU-second, and
 * neither is known before the call returns. A budget in currency would therefore be enforced
 * against a number the platform invented, which is worse than a coarse limit honestly described.
 * Counting invocations by cost class is exact, checkable, and the thing that actually runs away.
 * `unitCost` is reserved on the ledger for when prices are declarable; nothing reads it yet.
 *
 * CHECKED BEFORE, NEVER AFTER. After the call the money is spent whatever the check says, so the
 * only point at which refusal is free is before invocation. This is also why the check is not
 * inside the action: an action that meters itself has already been chosen, and by then the planner
 * has committed.
 *
 * NO BUDGET MEANS NO PAID ACTIONS. Absence is not permission. A missing budget is the state a
 * system is in before anybody has thought about cost, and that is precisely when it should not be
 * spending.
 */

import type { CostClass } from "./actionRegistry";

// ─── LEDGER ──────────────────────────────────────────────────────────────────

export type SpendEntry = {
  readonly at: number;
  readonly actionId: string;
  readonly cost: CostClass;
  /**
   * Reserved. When actions can declare a price this carries it; until then it stays null and
   * nothing reads it. Recorded as a field rather than left out so the ledger's shape does not
   * change when prices arrive.
   */
  readonly unitCost: number | null;
};

export type SpendLedger = {
  entries: readonly SpendEntry[];
  /** Invocations by cost class. What ceilings are compared against. */
  counts: Readonly<Record<CostClass, number>>;
};

export function emptyLedger(): SpendLedger {
  return { entries: [], counts: { free: 0, compute: 0, paid: 0 } };
}

export function record(ledger: SpendLedger, entry: SpendEntry): SpendLedger {
  return {
    entries: [...ledger.entries, entry],
    counts: { ...ledger.counts, [entry.cost]: ledger.counts[entry.cost] + 1 },
  };
}

/** Invocations of a class inside the trailing window. */
export function countInWindow(
  ledger: SpendLedger,
  cost: CostClass,
  now: number,
  windowMs: number,
): number {
  const from = now - windowMs;
  return ledger.entries.filter((e) => e.cost === cost && e.at > from).length;
}

// ─── BUDGET ──────────────────────────────────────────────────────────────────

export type Ceilings = Partial<Record<CostClass, number>>;

/**
 * A budget. Immutable by construction — nothing here returns a larger one.
 *
 * "A budget cannot be raised by the loop itself" is enforced by there being no operation that
 * raises one. A setter that the loop merely promises not to call is not a control.
 */
export type Budget = {
  readonly perRun: Ceilings;
  /** Trailing-window ceilings, for standing objectives that would otherwise spend a run at a time. */
  readonly perWindow?: { readonly windowMs: number; readonly limits: Ceilings };
};

export type BudgetVerdict =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly scope: "run" | "window" | "unbudgeted";
      readonly cost: CostClass;
      /** The ceiling that stopped it. null when the refusal is for having no budget at all. */
      readonly limit: number | null;
      readonly reason: string;
    };

/**
 * May one invocation of this cost class proceed?
 *
 * `free` always may — metering an action that costs nothing produces a ceiling that can only ever
 * obstruct. `compute` and `paid` are checked separately because they are separate resources: our
 * own service being saturated and a vendor bill are different problems with different ceilings.
 */
export function checkBudget(
  budget: Budget | null,
  cost: CostClass,
  runLedger: SpendLedger,
  totalLedger: SpendLedger,
  now: number,
): BudgetVerdict {
  if (cost === "free") return { allowed: true };

  if (!budget) {
    // Absence is not permission. Compute is allowed unbudgeted because it bills nobody; paid is not.
    if (cost === "compute") return { allowed: true };
    return {
      allowed: false,
      scope: "unbudgeted",
      cost,
      limit: null,
      reason: "no budget is configured, and a paid action may not run without one",
    };
  }

  const runLimit = budget.perRun[cost];
  if (runLimit !== undefined && runLedger.counts[cost] >= runLimit) {
    return {
      allowed: false,
      scope: "run",
      cost,
      limit: runLimit,
      reason: `this run has used its ${cost} ceiling of ${runLimit}`,
    };
  }

  const w = budget.perWindow;
  if (w) {
    const windowLimit = w.limits[cost];
    if (windowLimit !== undefined && countInWindow(totalLedger, cost, now, w.windowMs) >= windowLimit) {
      return {
        allowed: false,
        scope: "window",
        cost,
        limit: windowLimit,
        reason: `the ${cost} ceiling of ${windowLimit} per ${w.windowMs}ms is reached`,
      };
    }
  }

  return { allowed: true };
}

/** One line naming what stopped an action, for the trace and for a person. */
export function describeRefusal(v: Extract<BudgetVerdict, { allowed: false }>): string {
  return `refused — ${v.reason}`;
}

// ─── CONFIGURATION ───────────────────────────────────────────────────────────

/**
 * Read a budget from configuration. Returns null when none is configured, which blocks paid actions.
 *
 * Fails closed on every field: an unparseable ceiling is treated as absent rather than as infinite,
 * because a typo must not be the thing that authorises spending.
 */
export function budgetFromEnv(env: NodeJS.ProcessEnv = process.env): Budget | null {
  const num = (raw: string | undefined): number | undefined => {
    if (raw === undefined) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
  };

  const perRunPaid = num(env.AGENT_BUDGET_PAID_PER_RUN);
  const perRunCompute = num(env.AGENT_BUDGET_COMPUTE_PER_RUN);
  const windowPaid = num(env.AGENT_BUDGET_PAID_PER_WINDOW);
  const windowMs = num(env.AGENT_BUDGET_WINDOW_MS);

  if (perRunPaid === undefined && perRunCompute === undefined && windowPaid === undefined) {
    return null;
  }

  const perRun: Ceilings = {};
  if (perRunPaid !== undefined) perRun.paid = perRunPaid;
  if (perRunCompute !== undefined) perRun.compute = perRunCompute;

  const budget: Budget = { perRun };
  if (windowPaid !== undefined && windowMs !== undefined && windowMs > 0) {
    return { ...budget, perWindow: { windowMs, limits: { paid: windowPaid } } };
  }
  return budget;
}
