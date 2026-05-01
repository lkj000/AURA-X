// EMA-based adaptive action policy learning.
// Mirrors aura-x-engine/ml_engine/adaptive_action_learning.py

import { clamp } from "../_utils";
import type { ActionPolicy, ActionUtility, Lane, RefinementAction } from "../types";
import { REFINEMENT_ACTIONS } from "../types";

const DEFAULT_ALPHA            = 0.25;
const DEFAULT_POLICY_INFLUENCE = 0.35;
const DEFAULT_TIE_BREAK_WINDOW = 0.01;
const MIN_SUPPORT_FOR_LEARNING = 2;

// ── EMA update ─────────────────────────────────────────────────────────────────

function emaUpdate(current: number, newValue: number, alpha: number): number {
  return alpha * newValue + (1 - alpha) * current;
}

// ── Build empty policy ────────────────────────────────────────────────────────

export function emptyPolicy(): ActionPolicy {
  const actions: Record<string, ActionUtility> = {};
  for (const action of REFINEMENT_ACTIONS) {
    actions[action] = { emaUtility: 0, varianceEma: 0, support: 0 };
  }
  const laneMap: ActionPolicy["lanes"] = {
    private_school:      { ...actions },
    sgija:               { ...actions },
    bacardi:             { ...actions },
    stixx_sgija:         { ...actions },
    mbiraiano:           { ...actions },
    three_step:          { ...actions },
    gqom_fusion:         { ...actions },
    hybrid_rnb_amapiano: { ...actions },
  };

  return {
    metadata: {
      version:         1,
      alpha:           DEFAULT_ALPHA,
      policyInfluence: DEFAULT_POLICY_INFLUENCE,
      tieBreakWindow:  DEFAULT_TIE_BREAK_WINDOW,
    },
    lanes: laneMap,
  };
}

// ── Record an action effect and update EMA ────────────────────────────────────

export function updatePolicy(
  policy: ActionPolicy,
  lane: Lane,
  action: RefinementAction,
  delta: number,  // after_score - before_score
): ActionPolicy {
  const alpha = policy.metadata.alpha;
  const lanePolicy = policy.lanes[lane] ?? {};
  const existing   = lanePolicy[action] ?? { emaUtility: 0, varianceEma: 0, support: 0 };

  const newEma      = emaUpdate(existing.emaUtility, delta, alpha);
  const newVariance = emaUpdate(existing.varianceEma, (delta - newEma) ** 2, alpha);

  const updated: ActionUtility = {
    emaUtility:  newEma,
    varianceEma: newVariance,
    support:     existing.support + 1,
  };

  return {
    ...policy,
    lanes: {
      ...policy.lanes,
      [lane]: { ...lanePolicy, [action]: updated },
    },
  };
}

// ── Utility computation for action ranking ────────────────────────────────────

export function computeActionScore(
  util: ActionUtility | undefined,
  policy: ActionPolicy,
): number {
  if (!util || util.support < MIN_SUPPORT_FOR_LEARNING) return 0;

  const minSupport    = MIN_SUPPORT_FOR_LEARNING;
  const supportFactor = clamp(util.support / (minSupport + 5));
  const variance      = clamp(util.varianceEma * 2, 0, 0.15);

  return util.emaUtility * supportFactor - variance;
}

// ── Lane leaderboard ──────────────────────────────────────────────────────────

export function laneLeaderboard(policy: ActionPolicy, lane: Lane): Array<{ action: string; score: number; support: number }> {
  const lp = policy.lanes[lane] ?? {};
  return Object.entries(lp)
    .map(([action, util]) => ({
      action,
      score:   computeActionScore(util, policy),
      support: util.support,
    }))
    .sort((a, b) => b.score - a.score);
}
