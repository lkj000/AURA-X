/**
 * A-01 — ACTION REGISTRY
 *
 * What the agent may do, declared as data.
 *
 * Before this file, the answer to "what can the agent do?" was "read `runAgent` and see what it
 * calls". That is not a set, and you cannot select from something that is not a set — which is why
 * every planner, policy and budget this phase needs had nothing to operate over.
 *
 * Nothing here is new capability. Every action wraps something the platform already does; the
 * registry adds the three facts a caller needs in order to CHOOSE rather than follow:
 *
 *   precondition  — may this run, given what is currently true
 *   effects       — what it establishes, so a planner can tell whether it moves toward the goal
 *   cost          — free | compute | paid, so A-07 can refuse before the money is spent
 *
 * The registry is deliberately ignorant of how anything is performed. Capability arrives through
 * `ActionPorts`, which keeps this module pure: the whole registry is testable with no database, no
 * audio service and no vendor account, and an adapter that talks to those lives elsewhere.
 *
 * TWO ACTIONS SHARE ONE EFFECT, ON PURPOSE. `synthesize_ctl_remote` and `synthesize_ctl_local` both
 * establish `ctl`. Today that choice is a try/catch inside `runAgent` — the fallback is reached only
 * by the remote path throwing. Expressed as two registered actions it becomes a decision the planner
 * makes and the trace records, which is the difference A-03 is required to demonstrate.
 */

import type { CTLv1 } from "@aura-x/ctl";

// ─── COST ────────────────────────────────────────────────────────────────────

/**
 * What invoking this action spends.
 *
 * `compute` and `paid` are separated because they fail differently: our own audio service being busy
 * is an operational problem, and a vendor invoice is not. A-07 gates on `paid`; treating them alike
 * would either meter our own CPU as though it were billed or let a vendor call through unmetered.
 */
export type CostClass = "free" | "compute" | "paid";

// ─── STATE ───────────────────────────────────────────────────────────────────

/**
 * What is currently true about the work in progress.
 *
 * Only observable facts belong here — things an action established and a precondition can test.
 * Intent lives in the goal (A-02), not in state, so that the same state can be evaluated against
 * different objectives.
 */
export type AgentState = {
  /** Set once the track row exists. */
  trackId?: string;
  /** The working CTL, however it was synthesised. */
  ctl?: CTLv1;
  /** Which action produced `ctl` — kept because "who decided this" is not recoverable otherwise. */
  ctlSource?: "remote" | "local";
  /** Set once the CTL is persisted and has an identity the revision loop can reference. */
  ctlId?: string;
  /** Latest evaluation. `undefined` means not yet evaluated — it does not mean zero. */
  compositeScore?: number;
  validationPassed?: boolean;
  iterationsRun: number;
  mutationsApplied: number;
  /** Set once the result is durably recorded. */
  stored: boolean;
  /** Per-action failure counts. A planner that cannot see this will retry a dead path forever. */
  failures: Readonly<Record<string, number>>;
};

export function initialState(): AgentState {
  return { iterationsRun: 0, mutationsApplied: 0, stored: false, failures: {} };
}

/** The state keys an action may claim to establish. */
export type StateKey = Exclude<keyof AgentState, "failures">;

// ─── PORTS ───────────────────────────────────────────────────────────────────

/**
 * The capability boundary. Everything that touches a database, a network or a vendor enters here.
 *
 * `synthesizeLocal` is synchronous because the TypeScript engine is; making it async to match the
 * others would imply an await point that does not exist and hide that this path cannot fail on I/O.
 */
export type ActionPorts = {
  createTrack(): Promise<{ trackId: string }>;
  synthesizeRemote(): Promise<{ ctl: CTLv1 }>;
  synthesizeLocal(): CTLv1;
  persistCtl(trackId: string, ctl: CTLv1): Promise<{ ctlId: string }>;
  revise(input: { trackId: string; ctlId: string; ctl: CTLv1 }): Promise<{
    ctl: CTLv1;
    compositeScore: number;
    validationPassed: boolean;
    iterationsRun: number;
    mutationsApplied: number;
  }>;
  storeResult(state: AgentState): Promise<void>;
};

// ─── ACTION ──────────────────────────────────────────────────────────────────

export type ActionOutcome =
  | { ok: true;  patch: Partial<AgentState>; note: string }
  | { ok: false; error: string; note: string };

export type AgentAction = {
  readonly id: string;
  readonly title: string;
  readonly cost: CostClass;
  /** Whether this may run now. Pure, total, and must not throw on a partially built state. */
  readonly precondition: (s: AgentState) => boolean;
  /** What it establishes when it succeeds. Declared, not inferred from the patch it returns. */
  readonly effects: readonly StateKey[];
  readonly run: (s: AgentState, p: ActionPorts) => Promise<ActionOutcome>;
};

// ─── THE REGISTRY ────────────────────────────────────────────────────────────

const CREATE_TRACK: AgentAction = {
  id: "create_track",
  title: "Create the track record",
  cost: "free",
  effects: ["trackId"],
  precondition: (s) => !s.trackId,
  run: async (_s, p) => {
    const { trackId } = await p.createTrack();
    return { ok: true, patch: { trackId }, note: `track ${trackId}` };
  },
};

const SYNTHESIZE_REMOTE: AgentAction = {
  id: "synthesize_ctl_remote",
  title: "Synthesise a CTL using the Python intelligence engine",
  cost: "compute",
  effects: ["ctl", "ctlSource"],
  precondition: (s) => !!s.trackId && !s.ctl,
  run: async (_s, p) => {
    const { ctl } = await p.synthesizeRemote();
    return { ok: true, patch: { ctl, ctlSource: "remote" }, note: "python engine" };
  },
};

const SYNTHESIZE_LOCAL: AgentAction = {
  id: "synthesize_ctl_local",
  title: "Synthesise a CTL using the TypeScript engine",
  cost: "free",
  effects: ["ctl", "ctlSource"],
  precondition: (s) => !!s.trackId && !s.ctl,
  run: async (_s, p) => {
    const ctl = p.synthesizeLocal();
    return { ok: true, patch: { ctl, ctlSource: "local" }, note: "typescript engine" };
  },
};

const PERSIST_CTL: AgentAction = {
  id: "persist_ctl",
  title: "Persist the CTL so it can be referenced",
  cost: "free",
  effects: ["ctlId"],
  precondition: (s) => !!s.trackId && !!s.ctl && !s.ctlId,
  run: async (s, p) => {
    const { ctlId } = await p.persistCtl(s.trackId!, s.ctl!);
    return { ok: true, patch: { ctlId }, note: `ctl ${ctlId}` };
  },
};

/**
 * The registry's own backstop on revision effort.
 *
 * Found by A-01's tests rather than reasoned about in advance: without it, `revise` satisfies its
 * own precondition after running, so a driver that takes the first eligible action revises forever
 * and never reaches `store_result`. An action set containing an action that is eligible for ever is
 * not usable by any planner, however the planner is written.
 *
 * This is a floor, not the policy. A-02 carries the goal's effort bound and will supersede it; the
 * constant stays because a registry that only terminates when someone remembers to bound it has the
 * same defect one layer up.
 */
export const REVISION_CEILING = 9;

const REVISE: AgentAction = {
  id: "revise",
  title: "Evaluate and mutate until the gate passes or the bound is reached",
  cost: "compute",
  effects: ["ctl", "compositeScore", "validationPassed", "iterationsRun", "mutationsApplied"],
  precondition: (s) => !!s.ctlId && !!s.ctl && s.iterationsRun < REVISION_CEILING,
  run: async (s, p) => {
    const r = await p.revise({ trackId: s.trackId!, ctlId: s.ctlId!, ctl: s.ctl! });
    return {
      ok: true,
      patch: {
        ctl: r.ctl,
        compositeScore: r.compositeScore,
        validationPassed: r.validationPassed,
        // Accumulated, not assigned: a second revision adds to the first rather than replacing it,
        // and an effort bound that silently resets is not a bound.
        iterationsRun:     s.iterationsRun     + r.iterationsRun,
        mutationsApplied:  s.mutationsApplied  + r.mutationsApplied,
      },
      note: `score ${r.compositeScore}, passed=${r.validationPassed}`,
    };
  },
};

const STORE_RESULT: AgentAction = {
  id: "store_result",
  title: "Record the outcome durably",
  cost: "free",
  effects: ["stored"],
  precondition: (s) => s.compositeScore !== undefined && !s.stored,
  run: async (s, p) => {
    await p.storeResult(s);
    return { ok: true, patch: { stored: true }, note: "result stored" };
  },
};

/**
 * The action set. Frozen, and the only place it is enumerated.
 *
 * A caller holding its own list is the defect this replaces, so there is no second list to drift
 * from this one — `runAgent`, the planner, the budget and the trace all read here.
 */
export const ACTIONS: readonly AgentAction[] = Object.freeze([
  CREATE_TRACK,
  SYNTHESIZE_REMOTE,
  SYNTHESIZE_LOCAL,
  PERSIST_CTL,
  REVISE,
  STORE_RESULT,
]);

const BY_ID: ReadonlyMap<string, AgentAction> = new Map(ACTIONS.map((a) => [a.id, a]));

export function getAction(id: string): AgentAction | undefined {
  return BY_ID.get(id);
}

/** Actions whose preconditions hold. The planner's candidate set, and nothing else's. */
export function eligibleActions(s: AgentState): readonly AgentAction[] {
  return ACTIONS.filter((a) => a.precondition(s));
}

// ─── EXECUTION ───────────────────────────────────────────────────────────────

export type ExecutionResult = {
  outcome: ActionOutcome;
  /** State after applying the patch. Unchanged when the action refused or failed. */
  state: AgentState;
};

function bumpFailure(s: AgentState, id: string): AgentState {
  return { ...s, failures: { ...s.failures, [id]: (s.failures[id] ?? 0) + 1 } };
}

/**
 * Run an action against state, and return the state that results.
 *
 * Three refusals, all of which return rather than throw, because an agent that crashes on an
 * ineligible choice cannot recover from its own planning error:
 *
 *   unknown action      — the id does not exist in the registry
 *   precondition unmet  — it exists but may not run now, and says which
 *   the action failed   — it ran and did not succeed
 *
 * The distinction matters for the trace: "I chose something that could not run" and "I chose
 * something that ran and failed" are different mistakes, and only the second is evidence about the
 * capability underneath.
 */
export async function executeAction(
  id: string,
  state: AgentState,
  ports: ActionPorts,
): Promise<ExecutionResult> {
  const action = BY_ID.get(id);
  if (!action) {
    return {
      outcome: { ok: false, error: "UNKNOWN_ACTION", note: `no action registered as "${id}"` },
      state,
    };
  }

  if (!action.precondition(state)) {
    return {
      outcome: {
        ok: false,
        error: "PRECONDITION_UNMET",
        note: `${action.id} cannot run in the current state`,
      },
      state,
    };
  }

  let outcome: ActionOutcome;
  try {
    outcome = await action.run(state, ports);
  } catch (err) {
    outcome = {
      ok: false,
      error: "ACTION_THREW",
      note: err instanceof Error ? err.message : String(err),
    };
  }

  if (!outcome.ok) return { outcome, state: bumpFailure(state, action.id) };
  return { outcome, state: { ...state, ...outcome.patch } };
}
