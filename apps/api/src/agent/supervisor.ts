/**
 * A-06 — AUTONOMY LOOP
 *
 * The system operates rather than responds.
 *
 * Nothing happened unless a human sent POST /api/agent/run. There was no schedule, no trigger and
 * no standing objective, so "automated" described the inside of one request and nothing about how
 * the platform behaved over time — the operator was the scheduler.
 *
 * A standing objective is a goal somebody wants pursued repeatedly, with a cadence and a budget.
 * The supervisor holds them, decides when one is due, and runs the planner against it.
 *
 * NO TIMERS IN HERE. The supervisor exposes `tick()` and takes its clock as a parameter; a real
 * deployment wraps it in whatever scheduler it already has. A component that starts its own
 * interval cannot be tested without waiting, cannot be stepped, and keeps running after the test
 * that created it — which is how a suite acquires a background process nobody remembers starting.
 *
 * IT REFUSES TO START WITHOUT A BUDGET. Not a warning, not a default of zero: a refusal, because
 * the combination this job creates — unattended, repeating, and able to call paid services — is
 * exactly the one that must not be reachable by forgetting to configure something.
 *
 * STOPPING IS AT AN ACTION BOUNDARY. `stop()` prevents new runs and asks the in-flight one to end
 * at its next boundary. Not mid-action: an action already invoked cannot be recalled, and
 * abandoning it half-way is how a run ends up with a vendor charged, a row created, and no record
 * of either.
 */

import { plan, type PlanResult } from "./planner";
import type { ActionPorts } from "./actionRegistry";
import type { AgentGoal } from "./goal";
import { emptyLedger, record, type Budget, type SpendLedger } from "./budget";
import type { PriorEvidence } from "./memory";
import type { AgentPolicy, PolicyGate } from "./policy";
import { POLICY_OFF } from "./policy";

// ─── OBJECTIVES ──────────────────────────────────────────────────────────────

export type StandingObjective = {
  readonly id: string;
  readonly goal: AgentGoal;
  /** Shortest gap between runs of this objective. A cadence, not a deadline. */
  readonly minIntervalMs: number;
  /**
   * Stop after this many runs. Undefined means indefinitely — permitted, because the budget is the
   * real bound, and a run cap pretending to be one would be a second half-control.
   */
  readonly maxRuns?: number;
  readonly enabled: boolean;
};

export type ObjectiveState = {
  readonly runs: number;
  readonly lastStartedAt: number | null;
  readonly lastOutcome: string | null;
  /** Consecutive runs that ended in anything but `met`. Feeds the backoff below. */
  readonly consecutiveUnmet: number;
};

// ─── SUPERVISOR ──────────────────────────────────────────────────────────────

export type SupervisorConfig = {
  readonly enabled: boolean;
  readonly objectives: readonly StandingObjective[];
  /** Required. The loop refuses to start without one. */
  readonly budget: Budget | null;
  readonly ports: ActionPorts;
  readonly now: () => number;
  readonly newRunId: (objectiveId: string, run: number) => string;
  readonly evidence?: (goal: AgentGoal) => Promise<PriorEvidence | undefined>;
  readonly policy?: AgentPolicy;
  readonly gate?: PolicyGate;
  readonly onRun?: (result: AutonomousRun) => Promise<void> | void;
};

export type AutonomousRun = {
  readonly runId: string;
  /** Which standing objective caused this run. Every autonomous run is attributable. */
  readonly objectiveId: string;
  readonly startedAt: number;
  readonly result: PlanResult;
};

export type StartRefusal =
  | { readonly started: true }
  | { readonly started: false; readonly reason: "DISABLED" | "NO_BUDGET" | "NO_OBJECTIVES"; readonly detail: string };

export type SupervisorStatus = {
  readonly running: boolean;
  readonly objectives: Readonly<Record<string, ObjectiveState>>;
  readonly spend: SpendLedger;
  readonly runsCompleted: number;
  readonly inFlight: string | null;
};

/**
 * Backoff after repeated failure.
 *
 * An objective that cannot be met does not stop being due — without this it would re-run at its
 * cadence for ever, spending on every attempt. The interval doubles per consecutive unmet run and
 * is capped, so a broken objective quiets down without needing a human to notice it.
 */
const MAX_BACKOFF_MULTIPLIER = 8;

export function backoffMultiplier(consecutiveUnmet: number): number {
  return Math.min(2 ** consecutiveUnmet, MAX_BACKOFF_MULTIPLIER);
}

export function createSupervisor(config: SupervisorConfig) {
  let running = false;
  let stopRequested = false;
  let inFlight: string | null = null;
  let spend: SpendLedger = emptyLedger();
  let runsCompleted = 0;

  const states = new Map<string, ObjectiveState>(
    config.objectives.map((o) => [o.id, { runs: 0, lastStartedAt: null, lastOutcome: null, consecutiveUnmet: 0 }]),
  );

  /** Whether an objective is due now. Pure, so a caller can ask without side effects. */
  function isDue(o: StandingObjective, at: number): boolean {
    if (!o.enabled) return false;
    const st = states.get(o.id);
    if (!st) return false;
    if (o.maxRuns !== undefined && st.runs >= o.maxRuns) return false;
    if (st.lastStartedAt === null) return true;
    return at - st.lastStartedAt >= o.minIntervalMs * backoffMultiplier(st.consecutiveUnmet);
  }

  function due(at: number): readonly StandingObjective[] {
    // Longest-waiting first, so a frequently-due objective cannot starve a slower one.
    return config.objectives
      .filter((o) => isDue(o, at))
      .sort((a, b) => (states.get(a.id)!.lastStartedAt ?? -Infinity) - (states.get(b.id)!.lastStartedAt ?? -Infinity));
  }

  return {
    /**
     * Arm the loop. Refuses, with a reason, rather than starting in a state that cannot be safe.
     */
    start(): StartRefusal {
      if (!config.enabled) {
        return { started: false, reason: "DISABLED", detail: "the autonomy loop is not armed" };
      }
      if (!config.budget) {
        return {
          started: false,
          reason: "NO_BUDGET",
          detail: "an unattended loop that can call paid services requires a budget",
        };
      }
      if (config.objectives.length === 0) {
        return { started: false, reason: "NO_OBJECTIVES", detail: "there is nothing to pursue" };
      }
      stopRequested = false;
      running = true;
      return { started: true };
    },

    /**
     * Ask the loop to stop. Immediate for new runs; the in-flight run ends at its next boundary.
     * Reversible — `start()` arms it again, which is what makes arming a control rather than a
     * one-way door.
     */
    stop(): void {
      stopRequested = true;
      running = false;
    },

    isDue,
    due,

    /**
     * Advance the loop. Runs at most one objective, so a tick is bounded and a caller decides the
     * rate. Returns null when nothing was due.
     */
    async tick(): Promise<AutonomousRun | null> {
      if (!running || stopRequested) return null;

      const at = config.now();
      const [objective] = due(at);
      if (!objective) return null;

      const prev = states.get(objective.id)!;
      const runId = config.newRunId(objective.id, prev.runs + 1);
      inFlight = runId;
      states.set(objective.id, { ...prev, runs: prev.runs + 1, lastStartedAt: at });

      try {
        const result = await plan(objective.goal, config.ports, {
          now: config.now,
          budget: config.budget,
          priorSpend: spend,
          evidence: await config.evidence?.(objective.goal),
          policy: config.policy,
          gate: config.gate ?? POLICY_OFF,
          shouldContinue: () => !stopRequested,
        });

        for (const e of result.spend.entries) spend = record(spend, e);

        const met = result.conclusion.outcome === "met";
        const after = states.get(objective.id)!;
        states.set(objective.id, {
          ...after,
          lastOutcome: result.conclusion.outcome,
          consecutiveUnmet: met ? 0 : after.consecutiveUnmet + 1,
        });

        runsCompleted += 1;
        const run: AutonomousRun = { runId, objectiveId: objective.id, startedAt: at, result };
        await config.onRun?.(run);
        return run;
      } finally {
        // Cleared whatever happened, so a thrown port does not leave the supervisor believing a run
        // is still going and refusing to report itself idle for ever.
        inFlight = null;
      }
    },

    status(): SupervisorStatus {
      return {
        running,
        objectives: Object.fromEntries(states),
        spend,
        runsCompleted,
        inFlight,
      };
    },
  };
}

export type Supervisor = ReturnType<typeof createSupervisor>;

/** Read the arming flag. Off unless deliberately set, like every other gate in this phase. */
export function autonomyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AGENT_AUTONOMY === "true";
}
