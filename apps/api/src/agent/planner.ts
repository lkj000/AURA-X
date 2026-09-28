/**
 * A-03 — PLANNER
 *
 * Choose the next action from what is eligible, rather than following a sequence.
 *
 * Action order used to be a literal list in `runAgent`: the same six steps, in the same order, for
 * every goal, whatever the state. Nothing could respond to what it observed — a failure at step two
 * was handled by a fallback written in advance or not at all, and a goal that wanted something
 * other than "one track, three revisions" had no way to ask.
 *
 * The loop here is the smallest thing that is genuinely selection:
 *
 *     observe → score every eligible action → take the best → observe again
 *
 * until the goal's predicate holds, or nothing can run, or the effort bound is reached.
 *
 * ORDER IS NOT ENCODED ANYWHERE. It falls out of preconditions, declared effects and the goal's
 * unmet clauses. The registry's array order survives only as the final tie-break between options a
 * score genuinely cannot separate, which is a deterministic default rather than a schedule — remove
 * an action and behaviour changes with no edit here.
 *
 * The scoring function is deliberately simple and deliberately replaceable. A-05 swaps observed
 * value in for the declared prior; nothing else in the loop moves when it does.
 */

import {
  ACTIONS,
  eligibleActions,
  executeAction,
  initialState,
  type ActionPorts,
  type AgentAction,
  type AgentState,
  type CostClass,
} from "./actionRegistry";
import { NO_PRIOR_EVIDENCE, type PriorEvidence } from "./memory";
import {
  clausesFor,
  evaluateGoal,
  effortRemaining,
  describeConclusion,
  type AgentGoal,
  type RunConclusion,
} from "./goal";

// ─── SCORING ─────────────────────────────────────────────────────────────────

/**
 * What a cost class subtracts.
 *
 * Small on purpose. Cost breaks ties between comparable options; it must not outrank the goal, or
 * the agent optimises the invoice instead of the music. `paid` is separated by an order of
 * magnitude from `compute` because a vendor call is the one that cannot be undone by waiting.
 */
const COST_PENALTY: Record<CostClass, number> = { free: 0, compute: 1, paid: 4 };

/** What each prior failure of this action subtracts. Enough to move past a dead path in one try. */
const FAILURE_PENALTY = 3;

/**
 * What evidence from previous runs may subtract (A-04).
 *
 * Bounded below the goal term on purpose: history informs the choice, it does not overrule what the
 * run is for. An agent that lets memory outweigh its objective stops pursuing the objective.
 */
const EVIDENCE_WEIGHT = 4;

/**
 * Attempts before an observed rate is trusted in full.
 *
 * One attempt is an anecdote. Without this ramp a single unlucky failure in one previous run would
 * reorder every future run's choices, and the agent would abandon a good action on no real evidence.
 *
 * THE VALUE IS CONSTRAINED, NOT CHOSEN. At one attempt the penalty is
 * EVIDENCE_WEIGHT / EVIDENCE_CONFIDENCE_AT, and that must stay below the smallest prior gap it
 * could otherwise overturn. The narrowest gap in the registry today is the two synthesis routes,
 * 5 × (0.9 − 0.5) = 2.0 against a cost difference of 1 — a net 1.0. So 4/n < 1 requires n > 4.
 *
 * Five was found by a test rather than reasoned about in advance: at three, a single failed run
 * flipped the agent onto the worse engine permanently, which is precisely the behaviour the ramp
 * exists to prevent. If a future action's prior sits closer to a competitor's than 1.0, this needs
 * raising with it — a comment rather than an assertion because the constraint is over the whole
 * registry and no single test sees it.
 */
const EVIDENCE_CONFIDENCE_AT = 5;

export type Scored = {
  action: AgentAction;
  score: number;
  /** The terms, kept so the trace can say why rather than asserting it. */
  why: {
    advancesGoal: number;
    establishesNew: number;
    prior: number;
    costPenalty: number;
    failurePenalty: number;
    /** From prior episodes. Zero when there is no evidence — which is not the same as a zero rate. */
    evidencePenalty: number;
    /** null when nothing comparable has been attempted. Never 0 for "unknown". */
    observedRate: number | null;
  };
};

/**
 * Score one action against state and goal.
 *
 * Four terms, in descending authority:
 *
 *   advancesGoal    — its effects intersect an unmet clause's dependsOn. The only term that knows
 *                     what the run is for, so it dominates.
 *   establishesNew  — it sets state that is not set yet. This is what carries the agent through
 *                     necessary work no clause mentions: nothing in a goal asks for a track row,
 *                     and without this term `create_track` would score zero and never be chosen.
 *   prior           — declared quality, which is what stops cost preferring the worse engine.
 *   penalties       — cost, and prior failures.
 */
export function scoreAction(
  action: AgentAction,
  s: AgentState,
  goal: AgentGoal,
  evidence: PriorEvidence = NO_PRIOR_EVIDENCE,
): Scored {
  const verdict = evaluateGoal(goal, s);
  const unsatisfied = new Set([...verdict.fails, ...verdict.unknown]);
  const relevant = new Set(
    clausesFor(goal.target)
      .filter((c) => unsatisfied.has(c.id))
      .flatMap((c) => c.dependsOn as readonly string[]),
  );

  const advancesGoal   = action.effects.filter((e) => relevant.has(e)).length;
  const establishesNew = action.effects.filter((e) => s[e] === undefined || s[e] === false).length;
  const costPenalty    = COST_PENALTY[action.cost];
  const failurePenalty = FAILURE_PENALTY * (s.failures[action.id] ?? 0);

  // Prior episodes. An action nobody has tried is untouched; an action that has been tried and
  // failed is penalised in proportion to how often, ramped by how much evidence there is.
  const seen = evidence.forAction(action.id);
  const confidence = Math.min(seen.attempts, EVIDENCE_CONFIDENCE_AT) / EVIDENCE_CONFIDENCE_AT;
  const evidencePenalty =
    seen.successRate === null ? 0 : EVIDENCE_WEIGHT * (1 - seen.successRate) * confidence;

  const score =
    10 * advancesGoal +
     2 * establishesNew +
     5 * action.prior -
    costPenalty -
    failurePenalty -
    evidencePenalty;

  return {
    action,
    score,
    why: {
      advancesGoal, establishesNew, prior: action.prior, costPenalty, failurePenalty,
      evidencePenalty, observedRate: seen.successRate,
    },
  };
}

function explain(s: Scored): string {
  const t: string[] = [];
  if (s.why.advancesGoal)    t.push(`advances ${s.why.advancesGoal} unmet clause(s)`);
  if (s.why.establishesNew)  t.push(`establishes ${s.why.establishesNew} new fact(s)`);
  t.push(`prior ${s.why.prior}`);
  if (s.why.costPenalty)     t.push(`cost -${s.why.costPenalty}`);
  if (s.why.failurePenalty)  t.push(`${s.why.failurePenalty / FAILURE_PENALTY} prior failure(s)`);
  if (s.why.observedRate !== null) {
    t.push(`observed ${Math.round(s.why.observedRate * 100)}% across prior runs`);
  }
  return t.join(", ");
}

/**
 * Rank the eligible actions, best first.
 *
 * Ties break on registry order, which makes the choice reproducible. A planner that returns a
 * different sequence on identical input cannot be debugged from its trace, and the trace is the
 * only window this phase has into its own behaviour.
 */
export function rank(
  s: AgentState,
  goal: AgentGoal,
  actions: readonly AgentAction[] = ACTIONS,
  evidence: PriorEvidence = NO_PRIOR_EVIDENCE,
): readonly Scored[] {
  const order = new Map(actions.map((a, i) => [a.id, i]));
  return eligibleActions(s)
    .filter((a) => order.has(a.id))
    .map((a) => scoreAction(a, s, goal, evidence))
    .sort((x, y) => y.score - x.score || order.get(x.action.id)! - order.get(y.action.id)!);
}

// ─── THE LOOP ────────────────────────────────────────────────────────────────

/**
 * One decision, recorded as data.
 *
 * A-08 turns this into the full trace; the shape is settled here because a planner whose reasoning
 * is only reconstructable from prose cannot be examined, and this is the phase where that starts to
 * matter. The human-readable line is rendered from these fields rather than written beside them, so
 * the two cannot disagree.
 */
export type Decision = {
  step: number;
  chosen: string | null;
  reason: string;
  /** Everything that could have run, with its score. The alternatives are half of "why". */
  considered: readonly { id: string; score: number; why: string }[];
  ok: boolean;
  note: string;
  error?: string;
  cost: CostClass | null;
  durationMs: number;
};

export type PlanResult = {
  state: AgentState;
  conclusion: RunConclusion;
  decisions: readonly Decision[];
  /** Derived from `decisions`. Never written independently. */
  log: readonly string[];
};

export type PlanOptions = {
  from?: AgentState;
  /** Prior episodes (A-04). Omitted means no evidence, which is not the same as bad evidence. */
  evidence?: PriorEvidence;
  /** Restrict the action set. Used to prove that removing an action changes behaviour with no edit. */
  actions?: readonly AgentAction[];
  now?: () => number;
};

export function renderLog(decisions: readonly Decision[]): readonly string[] {
  return decisions.map((d) =>
    d.chosen === null
      ? `[${d.step}] no action available`
      : `[${d.step}] ${d.chosen} — ${d.reason}${d.ok ? "" : ` — FAILED: ${d.error}`}${d.ok ? ` — ${d.note}` : ""}`,
  );
}

/**
 * Run the agent toward a goal.
 *
 * The goal is checked BEFORE any action is taken. A goal already satisfied by the state it was
 * handed must do nothing — otherwise the agent works to reach a place it is standing in, which is
 * the "stops after three iterations whatever the score" behaviour turned inside out.
 */
export async function plan(
  goal: AgentGoal,
  ports: ActionPorts,
  opts: PlanOptions = {},
): Promise<PlanResult> {
  const {
    from = initialState(),
    actions = ACTIONS,
    now = () => Date.now(),
    evidence = NO_PRIOR_EVIDENCE,
  } = opts;

  let state = from;
  const decisions: Decision[] = [];

  const finish = (conclusion: RunConclusion): PlanResult => ({
    state,
    conclusion,
    decisions,
    log: renderLog(decisions),
  });

  for (let step = 1; ; step++) {
    const verdict = evaluateGoal(goal, state);
    if (verdict.met) return finish({ outcome: "met", verdict });

    // Settled AND nothing left that could change it — distinct from "not met yet".
    const ranked = rank(state, goal, actions, evidence);
    if (verdict.settled && verdict.fails.length > 0 && ranked.every((r) => r.why.advancesGoal === 0)) {
      return finish({ outcome: "unsatisfiable", verdict });
    }

    const effort = effortRemaining(goal, state, decisions.length);
    if (effort.exhausted) {
      return finish({ outcome: "effort_exhausted", verdict, bound: effort.bound, limit: effort.limit });
    }

    if (ranked.length === 0) return finish({ outcome: "no_action_available", verdict });

    const best = ranked[0];
    const started = now();
    const { outcome, state: next } = await executeAction(best.action.id, state, ports);
    state = next;

    decisions.push({
      step,
      chosen: best.action.id,
      reason: explain(best),
      considered: ranked.map((r) => ({ id: r.action.id, score: r.score, why: explain(r) })),
      ok: outcome.ok,
      note: outcome.note,
      error: outcome.ok ? undefined : outcome.error,
      cost: best.action.cost,
      durationMs: now() - started,
    });
  }
}

export { describeConclusion };
