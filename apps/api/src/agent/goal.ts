/**
 * A-02 — GOAL MODEL
 *
 * What would count as having succeeded, stated separately from what to make.
 *
 * `AgentGoal` was a track specification — title, subgenre, bpm, key. It says what to produce and
 * never what would make the producing worth stopping, which is why the revision loop stops after
 * three iterations whatever the score and why a run scoring 41 and a run scoring 92 both return
 * `status: "complete"`. "Complete" meant the procedure ran.
 *
 * A goal here is three things:
 *
 *   constraints  — what to make. The old AgentGoal, demoted to one part of the whole.
 *   target       — the success predicate, as clauses over observable state.
 *   effort       — what may be spent trying. A bound, not a schedule.
 *
 * UNKNOWN IS NOT FAILURE, AND THIS IS THE LOAD-BEARING DECISION IN THE FILE. A clause about the
 * composite score, evaluated before anything has been evaluated, is not false — it is unknown.
 * Collapsing the two would make an unevaluated run indistinguishable from a bad one, and the agent
 * would stop on the first clause it had not yet gathered evidence for. Every clause returns one of
 * three answers and the aggregate propagates the distinction.
 */

import type { AgentState, StateKey } from "./actionRegistry";

// ─── CONSTRAINTS ─────────────────────────────────────────────────────────────

/** What to make. Formerly the whole of `AgentGoal`. */
export type GoalConstraints = {
  title: string;
  subgenre: string;
  bpm?: number;
  key?: string;
  emotional_profile?: string;
  generation_mode?: "mode_1_suno" | "mode_2_musicgen" | "mode_3_suno_api";
  created_by: string;
};

// ─── CLAUSES ─────────────────────────────────────────────────────────────────

/**
 * Three answers, not two.
 *
 *   holds    — the evidence is in and the clause is satisfied
 *   fails    — the evidence is in and it is not
 *   unknown  — the evidence has not been gathered yet
 */
export type ClauseVerdict = "holds" | "fails" | "unknown";

export type SuccessClause = {
  readonly id: string;
  /** Stated so a failure can be reported in words the operator asked in. */
  readonly describe: string;
  /**
   * Which state this clause reads.
   *
   * Declared rather than inferred so a planner can tell which actions could possibly move it. An
   * action whose effects miss every unmet clause's `dependsOn` cannot advance the goal, however
   * useful it looks — and without this the planner would have to guess from names.
   */
  readonly dependsOn: readonly StateKey[];
  readonly evaluate: (s: AgentState) => ClauseVerdict;
};

export type GoalTarget = {
  /** The score at or above which the work is good enough. Omit to require no particular score. */
  minCompositeScore?: number;
  /** Whether validation must pass. Omit to leave validation unrequired. */
  requireValidation?: boolean;
  /** Whether the result must be durably recorded before the goal is met. */
  requireStored?: boolean;
};

export type GoalEffort = {
  /** Ceiling on accumulated revision iterations. */
  maxIterations: number;
  /** Ceiling on actions executed in one run — the backstop against a planner that cycles. */
  maxActions: number;
};

export type AgentGoal = {
  constraints: GoalConstraints;
  target: GoalTarget;
  effort: GoalEffort;
};

// ─── BUILDING THE PREDICATE ──────────────────────────────────────────────────

/**
 * Turn a target into clauses.
 *
 * An omitted target field produces no clause rather than a permissive one. The difference shows up
 * in the report: a goal that never asked about validation should not print "validation: holds", it
 * should print nothing, because the agent was never asked and has no business claiming it checked.
 */
export function clausesFor(target: GoalTarget): readonly SuccessClause[] {
  const clauses: SuccessClause[] = [];

  if (target.minCompositeScore !== undefined) {
    const min = target.minCompositeScore;
    clauses.push({
      id: "composite_score",
      dependsOn: ["compositeScore"],
      describe: `composite score at or above ${min}`,
      evaluate: (s) =>
        s.compositeScore === undefined ? "unknown" : s.compositeScore >= min ? "holds" : "fails",
    });
  }

  if (target.requireValidation) {
    clauses.push({
      id: "validation",
      dependsOn: ["validationPassed"],
      describe: "CTL validation passes",
      evaluate: (s) =>
        s.validationPassed === undefined ? "unknown" : s.validationPassed ? "holds" : "fails",
    });
  }

  if (target.requireStored) {
    clauses.push({
      id: "stored",
      dependsOn: ["stored"],
      describe: "the result is durably recorded",
      // `stored` is a boolean that starts false, so absence of evidence is not expressible here and
      // the clause is honestly two-valued. Not every fact has an unknown state; pretending this one
      // does would be as wrong as denying it of the score.
      evaluate: (s) => (s.stored ? "holds" : "fails"),
    });
  }

  return clauses;
}

// ─── EVALUATION ──────────────────────────────────────────────────────────────

export type GoalVerdict = {
  /** True only when every clause holds. Unknown clauses never satisfy a goal. */
  met: boolean;
  /**
   * True when no further action could satisfy it — every remaining clause has failed on evidence
   * that is already in. Distinct from `!met`, which is also true while evidence is still missing.
   */
  settled: boolean;
  holds: readonly string[];
  fails: readonly string[];
  unknown: readonly string[];
  /** One line per clause, for the operator rather than the planner. */
  report: readonly string[];
};

/**
 * Evaluate a goal against observed state.
 *
 * A goal with no clauses is met — it asked for nothing, and reporting it unmet would make an
 * unconstrained run impossible to finish. That is stated here rather than left to fall out of an
 * `every` over an empty array, because the behaviour is deliberate and someone will otherwise
 * "fix" it.
 */
export function evaluateGoal(goal: AgentGoal, s: AgentState): GoalVerdict {
  const clauses = clausesFor(goal.target);
  const holds: string[] = [];
  const fails: string[] = [];
  const unknown: string[] = [];
  const report: string[] = [];

  for (const c of clauses) {
    const v = c.evaluate(s);
    (v === "holds" ? holds : v === "fails" ? fails : unknown).push(c.id);
    report.push(
      v === "unknown"
        ? `${c.describe} — not yet established`
        : `${c.describe} — ${v === "holds" ? "met" : "not met"}`,
    );
  }

  return {
    met: fails.length === 0 && unknown.length === 0,
    settled: unknown.length === 0,
    holds, fails, unknown, report,
  };
}

// ─── EFFORT ──────────────────────────────────────────────────────────────────

export type EffortVerdict =
  | { exhausted: false }
  | { exhausted: true; bound: "maxIterations" | "maxActions"; limit: number };

/**
 * Whether the run may keep going.
 *
 * Named separately from the goal verdict because they answer different questions and a run can end
 * either way. Conflating them produces the report this phase exists to remove: "complete", said
 * about a run that ran out of budget short of its target.
 */
export function effortRemaining(
  goal: AgentGoal,
  s: AgentState,
  actionsTaken: number,
): EffortVerdict {
  if (s.iterationsRun >= goal.effort.maxIterations) {
    return { exhausted: true, bound: "maxIterations", limit: goal.effort.maxIterations };
  }
  if (actionsTaken >= goal.effort.maxActions) {
    return { exhausted: true, bound: "maxActions", limit: goal.effort.maxActions };
  }
  return { exhausted: false };
}

// ─── OUTCOME ─────────────────────────────────────────────────────────────────

/**
 * Why a run ended. Four answers where there used to be one.
 *
 * `met` is the only success. `effort_exhausted` and `no_action_available` are both honest
 * incompletions and they are not the same problem — the first wants a bigger budget, the second
 * wants a capability that does not exist yet. `unsatisfiable` is the run that gathered its evidence
 * and cannot get there.
 */
export type RunConclusion =
  | { outcome: "met";                 verdict: GoalVerdict }
  | { outcome: "unsatisfiable";       verdict: GoalVerdict }
  | { outcome: "effort_exhausted";    verdict: GoalVerdict; bound: string; limit: number }
  | { outcome: "no_action_available"; verdict: GoalVerdict }
  /**
   * Stopped by cost rather than by capability or effort (A-07). Distinct from effort_exhausted
   * because the remedy is different: this one wants a bigger budget or a cheaper route, not more
   * iterations, and conflating them sends somebody to change the wrong number.
   */
  | { outcome: "budget_exhausted";    verdict: GoalVerdict; reason: string }
  /**
   * Stopped because something asked it to, between actions (A-06). Neither a success nor a failure
   * of the work — an operator pressing stop must not be recorded as the agent failing.
   */
  | { outcome: "stopped";             verdict: GoalVerdict };

/** One sentence naming what happened and, where it did not succeed, what stopped it. */
export function describeConclusion(c: RunConclusion): string {
  switch (c.outcome) {
    case "met":
      return "Goal met.";
    case "unsatisfiable":
      return `Goal cannot be met: ${c.verdict.fails.join(", ")} did not hold and no further action can change that.`;
    case "effort_exhausted":
      return `Stopped at the ${c.bound} bound of ${c.limit}. Unmet: ${[...c.verdict.fails, ...c.verdict.unknown].join(", ") || "none"}.`;
    case "no_action_available":
      return `No action could run. Unmet: ${[...c.verdict.fails, ...c.verdict.unknown].join(", ") || "none"}.`;
    case "budget_exhausted":
      return `Stopped by budget: ${c.reason}. Unmet: ${[...c.verdict.fails, ...c.verdict.unknown].join(", ") || "none"}.`;
    case "stopped":
      return `Stopped on request. Unmet: ${[...c.verdict.fails, ...c.verdict.unknown].join(", ") || "none"}.`;
  }
}

// ─── DEFAULTS ────────────────────────────────────────────────────────────────

/**
 * The goal implied by the old behaviour, so a caller passing only a track specification gets
 * something explicit rather than nothing.
 *
 * It is deliberately not a *good* goal: three iterations and no score target is what the procedure
 * already did. Naming it as a default makes the weakness visible at the call site instead of
 * leaving it implicit in a loop bound.
 */
export function defaultGoal(constraints: GoalConstraints): AgentGoal {
  return {
    constraints,
    target: { requireValidation: true, requireStored: true },
    effort: { maxIterations: 3, maxActions: 12 },
  };
}
