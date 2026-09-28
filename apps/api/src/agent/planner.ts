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
import { POLICY_OFF, emptyPolicy, policyAdjustment, type AgentPolicy, type PolicyGate } from "./policy";
import {
  checkBudget, emptyLedger, record, describeRefusal,
  type Budget, type BudgetVerdict, type SpendLedger,
} from "./budget";
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
    /** From the learned policy (A-05). Zero whenever learning is disarmed or unsupported. */
    policyAdjustment: number;
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
  policy: AgentPolicy | null = null,
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

  // Learned value (A-05). Exactly zero when learning is disarmed or support is thin, so a disarmed
  // agent scores identically to one that never had a policy — the property that makes arming safe
  // to reverse.
  const learned = policy
    ? policyAdjustment(policy, goal.constraints.subgenre, action.id)
    : 0;

  const score =
    10 * advancesGoal +
     2 * establishesNew +
     5 * action.prior -
    costPenalty -
    failurePenalty -
    evidencePenalty +
    learned;

  return {
    action,
    score,
    why: {
      advancesGoal, establishesNew, prior: action.prior, costPenalty, failurePenalty,
      evidencePenalty, observedRate: seen.successRate, policyAdjustment: learned,
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
  if (s.why.policyAdjustment !== 0) {
    t.push(`policy ${s.why.policyAdjustment > 0 ? "+" : ""}${s.why.policyAdjustment.toFixed(2)}`);
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
  policy: AgentPolicy | null = null,
): readonly Scored[] {
  // Preconditions are evaluated over the GIVEN set, not the global registry.
  //
  // This read `eligibleActions(s).filter(...)`, which iterates ACTIONS — so a supplied set could
  // only ever narrow the registry, never extend it, and an action registered at runtime was
  // invisible however correctly it was declared. A-03's tests only ever removed actions, so it
  // passed; A-07's first paid action found it. It would also have blocked D-10 outright, where
  // device controls become actions the registry has never seen at build time.
  const order = new Map(actions.map((a, i) => [a.id, i]));
  return actions
    .filter((a) => a.precondition(s))
    .map((a) => scoreAction(a, s, goal, evidence, policy))
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
  /**
   * True when this action was taken to gather evidence rather than because it scored best (A-05).
   *
   * On the record because an unexplained departure from the best choice is indistinguishable from
   * a bug, and somebody reading a trace deserves to know which it was.
   */
  exploratory: boolean;
  cost: CostClass | null;
  durationMs: number;
};

export type PlanResult = {
  state: AgentState;
  conclusion: RunConclusion;
  decisions: readonly Decision[];
  /** What this run spent, per action. Empty when nothing chargeable ran. */
  spend: SpendLedger;
  /** Derived from `decisions`. Never written independently. */
  log: readonly string[];
};

export type PlanOptions = {
  from?: AgentState;
  /** Prior episodes (A-04). Omitted means no evidence, which is not the same as bad evidence. */
  evidence?: PriorEvidence;
  /** Learned values (A-05). Applied only when the gate is armed. */
  policy?: AgentPolicy;
  /** Learning and exploration gate. Off unless deliberately armed. */
  gate?: PolicyGate;
  /** Source of exploration draws, injected so a run can be reproduced exactly. */
  explore?: () => number;
  /** Cost ceilings (A-07). null — the default — blocks paid actions entirely. */
  budget?: Budget | null;
  /** Spend from earlier runs, for trailing-window ceilings. */
  priorSpend?: SpendLedger;
  /**
   * Asked between actions. Returning false ends the run at the next boundary (A-06).
   *
   * Between actions rather than during one: an action already invoked cannot be recalled, and
   * abandoning it mid-flight is how a run ends up half-written — a vendor charged, a row created,
   * and no record of either.
   */
  shouldContinue?: () => boolean;
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
    policy,
    gate = POLICY_OFF,
    explore = Math.random,
    budget = null,
    priorSpend = emptyLedger(),
    shouldContinue = () => true,
  } = opts;

  // The gate is read here, once, and decides whether the policy exists at all for this run. Passing
  // a policy without arming the gate must change nothing — otherwise "off by default" is a label.
  const activePolicy = gate.enabled ? policy ?? emptyPolicy() : null;

  let state = from;
  let spend = emptyLedger();
  const decisions: Decision[] = [];

  const finish = (conclusion: RunConclusion): PlanResult => ({
    state,
    conclusion,
    decisions,
    spend,
    log: renderLog(decisions),
  });

  /** Combined view for trailing-window ceilings: earlier runs plus what this one has spent. */
  const totalSpend = (): SpendLedger => ({
    entries: [...priorSpend.entries, ...spend.entries],
    counts: {
      free:    priorSpend.counts.free    + spend.counts.free,
      compute: priorSpend.counts.compute + spend.counts.compute,
      paid:    priorSpend.counts.paid    + spend.counts.paid,
    },
  });

  for (let step = 1; ; step++) {
    const verdict = evaluateGoal(goal, state);
    if (verdict.met) return finish({ outcome: "met", verdict });

    // Checked at the boundary, before anything is chosen or invoked, so a stop leaves the run
    // consistent rather than partly applied.
    if (!shouldContinue()) return finish({ outcome: "stopped", verdict });

    // Settled AND nothing left that could change it — distinct from "not met yet".
    const ranked = rank(state, goal, actions, evidence, activePolicy);
    if (verdict.settled && verdict.fails.length > 0 && ranked.every((r) => r.why.advancesGoal === 0)) {
      return finish({ outcome: "unsatisfiable", verdict });
    }

    const effort = effortRemaining(goal, state, decisions.length);
    if (effort.exhausted) {
      return finish({ outcome: "effort_exhausted", verdict, bound: effort.bound, limit: effort.limit });
    }

    if (ranked.length === 0) return finish({ outcome: "no_action_available", verdict });

    // Affordability is checked BEFORE selection, not inside the action: once an action has been
    // chosen the planner has committed, and after the call the money is spent whatever a check says.
    // An unaffordable best choice is stepped over rather than ending the run — routing around cost
    // is the whole point of having alternatives.
    type Refusal = Extract<BudgetVerdict, { allowed: false }>;
    const refusals: Refusal[] = [];
    const affordable = ranked.filter((r) => {
      const v = checkBudget(budget, r.action.cost, spend, totalSpend(), now());
      if (v.allowed) return true;
      refusals.push(v);
      return false;
    });
    const refusal: Refusal | undefined = refusals[0];

    if (affordable.length === 0) {
      return finish({
        outcome: "budget_exhausted",
        verdict,
        reason: refusal?.reason ?? "no affordable action",
      });
    }

    // Exploration: occasionally take the runner-up to gather evidence the best choice would never
    // produce. Bounded, declared, and recorded on the decision — an agent that deviates at an
    // undeclared rate cannot be told apart from a broken one.
    const exploring =
      gate.enabled && gate.explorationRate > 0 && affordable.length > 1 && explore() < gate.explorationRate;
    const best = exploring ? affordable[1] : affordable[0];

    const started = now();
    const { outcome, state: next } = await executeAction(best.action.id, state, ports);
    state = next;

    decisions.push({
      step,
      chosen: best.action.id,
      reason: exploring ? `${explain(best)} — exploratory` : explain(best),
      considered: ranked.map((r) => ({
        id: r.action.id,
        score: r.score,
        why: affordable.includes(r) || !refusal
          ? explain(r)
          : `${explain(r)} — ${describeRefusal(refusal)}`,
      })),
      ok: outcome.ok,
      note: outcome.note,
      error: outcome.ok ? undefined : outcome.error,
      exploratory: exploring,
      cost: best.action.cost,
      durationMs: now() - started,
    });

    // Recorded whether or not the action succeeded: a vendor call that failed was still a vendor
    // call, and a ledger that only counts successes under-reports exactly when things go wrong.
    spend = record(spend, {
      at: started, actionId: best.action.id, cost: best.action.cost, unitCost: null,
    });
  }
}

export { describeConclusion };
