// 13-action refinement catalogue.
// Mirrors aura-x-engine/high_end_engine/refinement.py

import { LANE_GRAMMARS, REFINEMENT_ACTIONS, type Lane, type GroovePlan, type RefinementAction } from "../types";
import type { ActionPolicy } from "../types";
import { clamp, hashString } from "../_utils";

export interface RefinementPlan {
  selectedAction: RefinementAction;
  actionScore:    number;
  mutations:      string[];
  refinedGroove:  GroovePlan;
}

// ── Policy-ranked action selection (mirrors ml_engine/adaptive_action_learning.py) ──

function rankActions(
  lane: Lane,
  policy: ActionPolicy | null,
  baseActions: RefinementAction[],
): Array<{ action: RefinementAction; compositeScore: number }> {
  const lanePolicy = policy?.lanes[lane] ?? {};
  const influence  = policy?.metadata.policyInfluence ?? 0.35;
  const tieWindow  = policy?.metadata.tieBreakWindow ?? 0.01;
  const minSupport = 3;
  const suppressThresh = -0.02;

  const scored = baseActions.map((action, i) => {
    const util = lanePolicy[action];
    let policyScore = 0;

    if (util && util.support >= minSupport) {
      if (util.emaUtility <= suppressThresh) return null; // suppress
      const supportFactor = clamp(util.support / (minSupport + 5));
      const variance      = clamp(util.varianceEma * 2, 0, 0.15);
      policyScore = util.emaUtility * supportFactor - variance;
    }

    return { action, basePriority: (baseActions.length - i) / baseActions.length, policyScore };
  }).filter(Boolean) as Array<{ action: RefinementAction; basePriority: number; policyScore: number }>;

  // Normalise policy scores to [0, 1]
  const rawScores = scored.map((s) => s.policyScore);
  const minS = Math.min(...rawScores), maxS = Math.max(...rawScores);
  const range = maxS - minS;

  return scored.map(({ action, basePriority, policyScore }) => {
    const normScore = range > 0 ? (policyScore - minS) / range : 0.5;
    let composite   = basePriority * (1 + influence * (2 * normScore - 1));

    // Compress gaps by 0.2 so tie-breaking fires more often
    composite = 0.8 * composite + 0.2 * basePriority;

    return { action, compositeScore: composite };
  }).sort((a, b) => {
    if (Math.abs(a.compositeScore - b.compositeScore) < tieWindow) {
      // Tie-break: raw policy score
      const pa = lanePolicy[a.action]?.emaUtility ?? 0;
      const pb = lanePolicy[b.action]?.emaUtility ?? 0;
      return pb - pa;
    }
    return b.compositeScore - a.compositeScore;
  });
}

// ── Groove plan mutations ─────────────────────────────────────────────────────

function mutateGroove(groove: GroovePlan, action: RefinementAction): { groove: GroovePlan; mutations: string[] } {
  const mutations: string[] = [];
  let kick     = [...groove.kickPattern];
  let hat      = [...groove.hatPattern];
  let shaker   = [...groove.shakerPattern];
  let log      = [...groove.logDrumPattern];
  let swing    = groove.swing;
  const density = groove.densityProfile;
  let densityOut: GroovePlan["densityProfile"] = density;

  switch (action) {
    case "increase_pattern_density":
      // Add hits at grammatically appropriate positions
      for (const pos of LANE_GRAMMARS[groove.lane].hat) {
        if (hat[pos] === 0) { hat[pos] = 1; mutations.push(`hat+${pos}`); break; }
      }
      for (const pos of LANE_GRAMMARS[groove.lane].log) {
        if (log[pos] === 0) { log[pos] = 1; mutations.push(`log+${pos}`); break; }
      }
      break;

    case "reduce_microtiming_variation":
      mutations.push("microtiming→grid_tight");
      break;

    case "align_groove_to_target_lane":
      // Overwrite to pure grammar
      kick   = new Array(16).fill(0);
      hat    = new Array(16).fill(0);
      shaker = new Array(16).fill(0);
      log    = new Array(16).fill(0);
      for (const i of LANE_GRAMMARS[groove.lane].kick)   if (i < 16) kick[i]   = 1;
      for (const i of LANE_GRAMMARS[groove.lane].hat)    if (i < 16) hat[i]    = 1;
      for (const i of LANE_GRAMMARS[groove.lane].shaker) if (i < 16) shaker[i] = 1;
      for (const i of LANE_GRAMMARS[groove.lane].log)    if (i < 16) log[i]    = 1;
      swing = LANE_GRAMMARS[groove.lane].swing;
      mutations.push(`groove→${groove.lane}_grammar`);
      break;

    case "increase_log_drum_density":
      for (const pos of LANE_GRAMMARS[groove.lane].log) {
        if (log[pos] === 0) { log[pos] = 1; mutations.push(`log+${pos}`); }
      }
      break;

    case "increase_log_drum_prominence":
      // Ensure at least 2 log drum hits
      if (log.filter(Boolean).length < 2) {
        for (const pos of [7, 15]) { log[pos] = 1; }
        mutations.push("log_drum→minimum_2_hits");
      }
      break;

    case "nudge_swing_toward_lane_mean":
      swing = 0.70 * LANE_GRAMMARS[groove.lane].swing + 0.30 * swing;
      mutations.push(`swing→${swing.toFixed(3)}`);
      break;

    case "nudge_density_toward_lane_median":
      densityOut = "medium";
      mutations.push("density→medium");
      break;

    case "simplify_arrangement_structure":
      // Remove some off-beat hits
      for (let i = 1; i < 16; i += 2) {
        if (hat[i] && Math.random() < 0.4) { hat[i] = 0; mutations.push(`hat-${i}`); break; }
      }
      break;

    case "realign_patterns_toward_elite_template":
      // 30% Hamming blend toward grammar
      for (let i = 0; i < 16; i++) {
        const gLog = LANE_GRAMMARS[groove.lane].log.includes(i) ? 1 : 0;
        log[i] = (0.7 * gLog + 0.3 * log[i]) >= 0.5 ? 1 : 0;
      }
      mutations.push("log_drum→30%_grammar_blend");
      break;

    default:
      mutations.push(`noop:${action}`);
      break;
  }

  const refinedGroove: GroovePlan = {
    ...groove,
    kickPattern:    kick as readonly number[],
    hatPattern:     hat as readonly number[],
    shakerPattern:  shaker as readonly number[],
    logDrumPattern: log as readonly number[],
    swing,
    densityProfile: densityOut,
  };

  return { groove: refinedGroove, mutations };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function buildRefinementPlan(
  groove: GroovePlan,
  renderScore: number,
  policy: ActionPolicy | null = null,
): RefinementPlan {
  const actions = [...REFINEMENT_ACTIONS] as RefinementAction[];
  const ranked  = rankActions(groove.lane, policy, actions);

  // Deterministic exploration floor (5%): hash → occasionally pick non-top action
  const seed = hashString(`${groove.lane}-${renderScore.toFixed(3)}`);
  const useExploration = seed < 0.05 && ranked.length > 1;
  const chosen = useExploration ? ranked[1] : ranked[0];

  const { groove: refinedGroove, mutations } = mutateGroove(groove, chosen.action);

  return {
    selectedAction: chosen.action,
    actionScore:    chosen.compositeScore,
    mutations,
    refinedGroove,
  };
}
