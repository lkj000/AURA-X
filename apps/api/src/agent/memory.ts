/**
 * A-04 — EPISODIC MEMORY
 *
 * What happened last time, retrievable.
 *
 * Every run began from nothing. `runAgent` read no previous run, and the results store recorded
 * outcomes that nothing ever consulted — so the platform accumulated data it could not use, and the
 * thousandth run made the same choices as the first. Learning was impossible not because no
 * algorithm existed but because there was no retrievable record of state, action and outcome.
 *
 * An episode is a completed run's trace, kept. Retrieval is by similarity of goal, because the goal
 * is what recurs: the useful question is "what happened the last few times somebody asked for
 * something like this", and the answer has to include the action sequence, not just a score.
 *
 * ABSENCE IS NOT ZERO, AND THIS IS THE PART THAT IS EASY TO GET WRONG. An action with no prior
 * evidence has a success rate of `null`, not 0. A rate of 0 says "this has been tried and it never
 * works", which is a claim about the action; `null` says "nothing has been tried", which is a claim
 * about the record. Collapsing them makes a brand-new action look like a proven failure and it will
 * never be selected, so the agent can never gather the evidence that would exonerate it.
 *
 * EPISODES ARE IMMUTABLE. A correction appends a new episode that names the one it corrects, and
 * the original stays readable. A memory that can be quietly rewritten is not a memory.
 */

import type { AgentGoal } from "./goal";
import type { RunTrace } from "./trace";

// ─── EPISODE ─────────────────────────────────────────────────────────────────

export type Episode = {
  readonly runId: string;
  readonly recordedAt: number;
  readonly goal: AgentGoal;
  readonly trace: RunTrace;
  /** Set on an episode that corrects an earlier one. The earlier one is never removed. */
  readonly corrects?: string;
  /** Set on an episode a later correction supersedes. Written by the store, never by a caller. */
  readonly supersededBy?: string;
};

export function episodeFrom(trace: RunTrace, recordedAt: number, corrects?: string): Episode {
  return { runId: trace.runId, recordedAt, goal: trace.goal, trace, corrects };
}

// ─── SIMILARITY ──────────────────────────────────────────────────────────────

/**
 * How alike two goals are, 0..1.
 *
 * Deliberately simple and deliberately explainable: an opaque similarity score would make retrieval
 * impossible to debug, and "why did it show me that episode" is a question somebody will ask on the
 * first day.
 *
 * Subgenre dominates because it decides which presets, grooves and cultural profile apply — two
 * goals in different subgenres have almost nothing to teach each other, whatever else matches.
 */
export function goalSimilarity(a: AgentGoal, b: AgentGoal): number {
  const ca = a.constraints;
  const cb = b.constraints;

  let score = 0;
  let weight = 0;

  const add = (w: number, v: number) => { score += w * v; weight += w; };

  add(5, ca.subgenre === cb.subgenre ? 1 : 0);

  // Tempo proximity, saturating at 20 BPM — beyond that two tracks are not comparable material.
  if (ca.bpm !== undefined && cb.bpm !== undefined) {
    add(2, Math.max(0, 1 - Math.abs(ca.bpm - cb.bpm) / 20));
  }
  if (ca.key !== undefined && cb.key !== undefined) {
    add(1, ca.key === cb.key ? 1 : 0);
  }
  if (ca.generation_mode !== undefined && cb.generation_mode !== undefined) {
    add(1, ca.generation_mode === cb.generation_mode ? 1 : 0);
  }
  // A comparable score target means comparable difficulty, which is what makes an episode's action
  // sequence worth copying.
  const ta = a.target.minCompositeScore;
  const tb = b.target.minCompositeScore;
  if (ta !== undefined && tb !== undefined) {
    add(2, Math.max(0, 1 - Math.abs(ta - tb) / 40));
  }

  return weight === 0 ? 0 : score / weight;
}

// ─── STORE ───────────────────────────────────────────────────────────────────

export type EpisodeStore = {
  /** Append-only. Writing an episode that corrects another stamps the original as superseded. */
  append(episode: Episode): Promise<void>;
  get(runId: string): Promise<Episode | null>;
  /** Most similar first, then most recent. Superseded episodes are excluded. */
  similar(goal: AgentGoal, limit: number, minSimilarity?: number): Promise<readonly Episode[]>;
  all(): Promise<readonly Episode[]>;
};

export function memoryEpisodeStore(capacity = 500): EpisodeStore {
  let episodes: Episode[] = [];

  return {
    async append(episode) {
      if (episode.corrects) {
        // Stamped, never removed. The wrong record stays readable beside the right one.
        episodes = episodes.map((e) =>
          e.runId === episode.corrects ? { ...e, supersededBy: episode.runId } : e,
        );
      }
      episodes.push(episode);
      if (episodes.length > capacity) episodes = episodes.slice(-capacity);
    },

    async get(runId) {
      return episodes.find((e) => e.runId === runId) ?? null;
    },

    async similar(goal, limit, minSimilarity = 0.5) {
      return episodes
        .filter((e) => !e.supersededBy)
        .map((e) => ({ e, s: goalSimilarity(goal, e.goal) }))
        .filter((x) => x.s >= minSimilarity)
        .sort((x, y) => y.s - x.s || y.e.recordedAt - x.e.recordedAt)
        .slice(0, Math.max(0, limit))
        .map((x) => x.e);
    },

    async all() {
      return [...episodes];
    },
  };
}

// ─── EVIDENCE ────────────────────────────────────────────────────────────────

export type ActionEvidence = {
  readonly attempts: number;
  readonly successes: number;
  /** null when nothing has been attempted. Never 0 for "no evidence". */
  readonly successRate: number | null;
};

/**
 * What a set of episodes says about the agent's actions.
 *
 * The three-valued discipline from A-02 applies again, for the same reason: an action nobody has
 * tried and an action that has never worked must not look alike, or the untried one is condemned
 * before it is tested.
 */
export type PriorEvidence = {
  readonly episodes: readonly Episode[];
  /** True when there is nothing to learn from — stated so callers handle it rather than inferring. */
  readonly isEmpty: boolean;
  forAction(actionId: string): ActionEvidence;
  /** Proportion of these episodes that met their goal, or null when there are none. */
  readonly metRate: number | null;
};

const NO_EVIDENCE: ActionEvidence = { attempts: 0, successes: 0, successRate: null };

export function evidenceFrom(episodes: readonly Episode[]): PriorEvidence {
  const tally = new Map<string, { attempts: number; successes: number }>();
  let met = 0;

  for (const e of episodes) {
    if (e.trace.conclusion.outcome === "met") met += 1;
    for (const d of e.trace.decisions) {
      if (!d.chosen) continue;
      const t = tally.get(d.chosen) ?? { attempts: 0, successes: 0 };
      t.attempts += 1;
      if (d.ok) t.successes += 1;
      tally.set(d.chosen, t);
    }
  }

  return {
    episodes,
    isEmpty: episodes.length === 0,
    metRate: episodes.length === 0 ? null : met / episodes.length,
    forAction(actionId) {
      const t = tally.get(actionId);
      if (!t || t.attempts === 0) return NO_EVIDENCE;
      return { attempts: t.attempts, successes: t.successes, successRate: t.successes / t.attempts };
    },
  };
}

/** The evidence of having none. Used where a caller has no store rather than an empty one. */
export const NO_PRIOR_EVIDENCE: PriorEvidence = evidenceFrom([]);

/**
 * Retrieve evidence for a goal.
 *
 * `minSimilarity` is a floor rather than a default preference: evidence from a goal that is not
 * really comparable is worse than no evidence, because it is confidently wrong and the agent cannot
 * tell the difference.
 */
export async function recall(
  store: EpisodeStore,
  goal: AgentGoal,
  limit = 10,
  minSimilarity = 0.5,
): Promise<PriorEvidence> {
  return evidenceFrom(await store.similar(goal, limit, minSimilarity));
}
