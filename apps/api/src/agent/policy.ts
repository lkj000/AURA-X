/**
 * A-05 — POLICY LEARNING
 *
 * Outcomes change what the agent chooses next.
 *
 * An adaptive EMA policy already existed in the engine and a weight tuner already existed in the
 * API. Neither was connected to action selection, so running the system a thousand times produced
 * exactly the choices of the first run. The missing piece was the connection, not the algorithm —
 * which is why this reuses the engine's maths rather than inventing a second learner.
 *
 * WHY THE ENGINE'S POLICY IS NOT IMPORTED DIRECTLY. `ActionPolicy` there is typed over
 * `RefinementAction` × `Lane` — a fixed enum of refinement operations. Agent action ids are neither,
 * and widening that enum to admit `create_track` would corrupt a type the engine relies on across
 * sixty modules. So the update rule is reproduced (exponential moving average of utility, EMA of
 * variance, support count, support-weighted score with a variance discount) and the key space is
 * the agent's own. Duplicating twenty lines of arithmetic is the cheaper mistake.
 *
 * CREDIT ASSIGNMENT IS NOT SOLVED HERE, AND PRETENDING OTHERWISE WOULD BE THE WORSE OPTION. When a
 * run meets its goal, every action it took gets the same credit. That cannot distinguish the
 * decisive action from one that merely happened alongside it. Doing better needs counterfactuals —
 * what would this run have scored without that action — which the platform cannot produce, because
 * generation is not repeatable at that granularity. The uniform rule is stated rather than hidden,
 * and the support gate below is what stops it drawing confident conclusions from thin evidence.
 *
 * OFF BY DEFAULT. A learner wired into a money-spending agent, enabled by existing, is how a system
 * acquires behaviour nobody chose. Arming is explicit and reversible, and the gate is checked at
 * the point of use rather than at construction.
 */

import type { Episode } from "./memory";

// ─── SHAPE ───────────────────────────────────────────────────────────────────

export type ActionValue = {
  /** Exponential moving average of observed utility. */
  readonly emaUtility: number;
  /** EMA of squared deviation — high variance means the action is unreliable, not merely poor. */
  readonly varianceEma: number;
  /** How many observations stand behind it. */
  readonly support: number;
};

export type AgentPolicy = {
  readonly version: number;
  /** EMA weight on the newest observation. The engine's value, kept so the two behave alike. */
  readonly alpha: number;
  /** How far policy may move a score. Bounded for the same reason evidence is: the goal outranks it. */
  readonly influence: number;
  /** Observations required before a value is used at all. Below this the policy says nothing. */
  readonly minSupport: number;
  /** context → action id → value. Context is the subgenre: what works differs by lane. */
  readonly contexts: Readonly<Record<string, Readonly<Record<string, ActionValue>>>>;
};

const DEFAULT_ALPHA = 0.25;        // engine's DEFAULT_ALPHA
const DEFAULT_INFLUENCE = 3;       // below EVIDENCE_WEIGHT, well below the goal term
const DEFAULT_MIN_SUPPORT = 2;     // engine's MIN_SUPPORT_FOR_LEARNING

/**
 * What an unseen action's utility starts at, and the reason it is not zero.
 *
 * The engine's policy initialises at 0 and is right to: its utility is a DELTA — score after minus
 * score before — where 0 honestly means "made no difference". Utility here is a LEVEL in [0,1]
 * where 0 means "fails every time", so starting there condemns a new action to look like a proven
 * failure until the moving average has climbed out, and the variance penalty from that climb makes
 * it worse. A perfect action scored negative for its first three observations before this was
 * fixed — caught by a test, not by reading.
 *
 * 0.5 is the centre the adjustment is measured from, so an unobserved action is exactly neutral.
 * This is the same rule as A-04's absence-is-not-zero, one layer down: never let "no evidence" wear
 * the costume of "bad evidence".
 *
 * The mismatch is the predictable hazard of reusing an algorithm across a different key space, and
 * it is why the engine's policy was reproduced rather than imported — importing it would have
 * carried this initialisation in silently.
 */
const NEUTRAL_UTILITY = 0.5;

export function emptyPolicy(over: Partial<Omit<AgentPolicy, "contexts">> = {}): AgentPolicy {
  return {
    version: 1,
    alpha: DEFAULT_ALPHA,
    influence: DEFAULT_INFLUENCE,
    minSupport: DEFAULT_MIN_SUPPORT,
    contexts: {},
    ...over,
  };
}

/** What a policy is keyed on. Subgenre, because an action that helps in one lane may not in another. */
export function contextKey(subgenre: string): string {
  return subgenre;
}

// ─── UPDATE ──────────────────────────────────────────────────────────────────

const ema = (current: number, observed: number, alpha: number) =>
  alpha * observed + (1 - alpha) * current;

/**
 * Utility of one action occurrence.
 *
 * Deliberately coarse, and the coarseness is the documented limitation above:
 *
 *   1.0  succeeded, and the run met its goal
 *   0.5  succeeded, and the run did not
 *   0.0  failed
 *
 * The middle value matters. Without it a correct action in a run that fell short for unrelated
 * reasons would be punished as though it had failed, and the agent would unlearn the things that
 * work on hard goals.
 */
export function utilityOf(actionSucceeded: boolean, runMetGoal: boolean): number {
  if (!actionSucceeded) return 0;
  return runMetGoal ? 1 : 0.5;
}

export function updateFromEpisode(policy: AgentPolicy, episode: Episode): AgentPolicy {
  const key = contextKey(episode.goal.constraints.subgenre);
  const met = episode.trace.conclusion.outcome === "met";
  const bucket: Record<string, ActionValue> = { ...(policy.contexts[key] ?? {}) };

  for (const d of episode.trace.decisions) {
    if (!d.chosen) continue;
    const observed = utilityOf(d.ok, met);
    const prev = bucket[d.chosen] ?? { emaUtility: NEUTRAL_UTILITY, varianceEma: 0, support: 0 };
    const emaUtility = ema(prev.emaUtility, observed, policy.alpha);
    bucket[d.chosen] = {
      emaUtility,
      varianceEma: ema(prev.varianceEma, (observed - emaUtility) ** 2, policy.alpha),
      support: prev.support + 1,
    };
  }

  return { ...policy, contexts: { ...policy.contexts, [key]: bucket } };
}

export function updateFromEpisodes(policy: AgentPolicy, episodes: readonly Episode[]): AgentPolicy {
  return episodes.reduce(updateFromEpisode, policy);
}

// ─── USE ─────────────────────────────────────────────────────────────────────

/**
 * What the policy adds to an action's score, or 0 when it has nothing to say.
 *
 * Below `minSupport` it returns 0 rather than a small number, because a value built on one
 * observation is not a weak signal — it is no signal, and treating it as weak still lets it decide
 * between closely matched options.
 *
 * Centred on NEUTRAL_UTILITY so the middling case — worked, run fell short — neither rewards nor
 * punishes. An uncentred value would make every action look good simply for having succeeded.
 */
export function policyAdjustment(policy: AgentPolicy, subgenre: string, actionId: string): number {
  const v = policy.contexts[contextKey(subgenre)]?.[actionId];
  if (!v || v.support < policy.minSupport) return 0;

  const supportFactor = Math.min(1, v.support / (policy.minSupport + 5));
  const variancePenalty = Math.min(v.varianceEma * 2, 0.15);
  return policy.influence * ((v.emaUtility - NEUTRAL_UTILITY) * 2 * supportFactor - variancePenalty);
}

// ─── INSPECT AND RESET ───────────────────────────────────────────────────────

export type PolicyRow = {
  actionId: string;
  emaUtility: number;
  varianceEma: number;
  support: number;
  adjustment: number;
  /** Stated so an operator reading the table knows which rows are doing nothing. */
  active: boolean;
};

/** The policy as a table, best first. What "the policy can be inspected" means concretely. */
export function inspect(policy: AgentPolicy, subgenre: string): readonly PolicyRow[] {
  const bucket = policy.contexts[contextKey(subgenre)] ?? {};
  return Object.entries(bucket)
    .map(([actionId, v]) => ({
      actionId,
      emaUtility: v.emaUtility,
      varianceEma: v.varianceEma,
      support: v.support,
      adjustment: policyAdjustment(policy, subgenre, actionId),
      active: v.support >= policy.minSupport,
    }))
    .sort((a, b) => b.adjustment - a.adjustment || a.actionId.localeCompare(b.actionId));
}

/** Reset one context, or all of them. Keeps the metadata — resetting learning is not reconfiguring. */
export function reset(policy: AgentPolicy, subgenre?: string): AgentPolicy {
  if (subgenre === undefined) return { ...policy, contexts: {} };
  const contexts = { ...policy.contexts };
  delete contexts[contextKey(subgenre)];
  return { ...policy, contexts };
}

// ─── ARMING ──────────────────────────────────────────────────────────────────

export type PolicyGate = {
  /** Off unless deliberately armed. */
  readonly enabled: boolean;
  /**
   * Proportion of selections that take a non-best action to gather evidence, 0..1, hard-clamped.
   *
   * Explicit because implicit exploration is indistinguishable from a bug: an agent that
   * occasionally does something odd, with no declared rate, cannot be told apart from one that is
   * broken.
   */
  readonly explorationRate: number;
};

export const MAX_EXPLORATION_RATE = 0.25;

export const POLICY_OFF: PolicyGate = { enabled: false, explorationRate: 0 };

/**
 * Read the gate from configuration.
 *
 * Both halves fail closed. An unset flag means off; an unparseable or out-of-range rate means the
 * minimum, never the maximum — a typo in a rate must not turn the agent into a random walk.
 */
export function gateFromEnv(env: NodeJS.ProcessEnv = process.env): PolicyGate {
  const enabled = env.AGENT_POLICY_LEARNING === "true";
  const raw = Number(env.AGENT_POLICY_EXPLORATION_RATE);
  const explorationRate =
    Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_EXPLORATION_RATE) : 0;
  return { enabled, explorationRate };
}
