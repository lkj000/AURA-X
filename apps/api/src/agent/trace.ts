/**
 * A-08 — DECISION TRACE
 *
 * What the agent did, as data rather than prose.
 *
 * `agent_log` was an array of human-readable strings. It cannot be queried, compared across runs,
 * or reduced to the evidence behind a decision — so debugging an agent decision meant reading
 * sentences and inferring what must have happened. A-03 already emits structured `Decision` records
 * and renders the readable log from them; this job turns a run's worth of those into an artefact
 * that can be stored, totalled and compared.
 *
 * STRUCTURED FIRST, PROSE DERIVED. The two must not both be written by hand, because the moment
 * they are, they disagree — and the prose is what people read, so the disagreement is invisible
 * until someone checks the numbers. Every human-readable line in this file is generated.
 *
 * The trace is also where cost becomes visible. A-07 needs to know what a run spent before it can
 * refuse the next one, and it can only know that if spending was recorded per action as it happened.
 */

import type { CostClass } from "./actionRegistry";
import type { AgentGoal, RunConclusion } from "./goal";
import { describeConclusion } from "./goal";
import type { Decision } from "./planner";
import { renderLog } from "./planner";

// ─── TOTALS ──────────────────────────────────────────────────────────────────

export type TraceTotals = {
  actions: number;
  succeeded: number;
  failed: number;
  durationMs: number;
  /** Actions taken per cost class. What A-07 meters, and what a run is judged expensive by. */
  byCost: Readonly<Record<CostClass, number>>;
  /** Distinct actions that failed at least once. Repeated failure of one action is not four problems. */
  failedActions: readonly string[];
};

export function totalsFor(decisions: readonly Decision[]): TraceTotals {
  const byCost: Record<CostClass, number> = { free: 0, compute: 0, paid: 0 };
  const failedActions = new Set<string>();
  let succeeded = 0;
  let failed = 0;
  let durationMs = 0;

  for (const d of decisions) {
    if (d.cost) byCost[d.cost] += 1;
    durationMs += d.durationMs;
    if (d.ok) succeeded += 1;
    else {
      failed += 1;
      if (d.chosen) failedActions.add(d.chosen);
    }
  }

  return {
    actions: decisions.length,
    succeeded,
    failed,
    durationMs,
    byCost,
    failedActions: [...failedActions],
  };
}

// ─── THE TRACE ───────────────────────────────────────────────────────────────

/**
 * One run, whole.
 *
 * The goal is stored with it rather than referenced. A trace read a year later has to be
 * interpretable on its own, and a goal that has since been edited would silently re-describe what
 * the run was trying to do — which is the failure mode that makes old traces worse than no traces.
 */
export type RunTrace = {
  readonly runId: string;
  readonly goal: AgentGoal;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly decisions: readonly Decision[];
  readonly conclusion: RunConclusion;
  readonly totals: TraceTotals;
};

export function buildTrace(input: {
  runId: string;
  goal: AgentGoal;
  startedAt: number;
  endedAt: number;
  decisions: readonly Decision[];
  conclusion: RunConclusion;
}): RunTrace {
  return { ...input, totals: totalsFor(input.decisions) };
}

// ─── RENDERING ───────────────────────────────────────────────────────────────

/**
 * The readable account of a run. Generated, every line of it.
 *
 * This is what replaces `agent_log`. It is produced from the trace on demand rather than
 * accumulated during the run, so there is no second copy to fall out of step.
 */
export function renderTrace(t: RunTrace): readonly string[] {
  const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;
  const spend = (Object.entries(t.totals.byCost) as [CostClass, number][])
    .filter(([, n]) => n > 0)
    .map(([c, n]) => `${n} ${c}`)
    .join(", ");

  return [
    `run ${t.runId} — ${t.goal.constraints.subgenre} "${t.goal.constraints.title}"`,
    ...renderLog(t.decisions),
    describeConclusion(t.conclusion),
    `${plural(t.totals.actions, "action")}, ${t.totals.failed} failed, ` +
      `${t.totals.durationMs}ms${spend ? ` — ${spend}` : ""}`,
    ...t.conclusion.verdict.report,
  ];
}

// ─── COMPARISON ──────────────────────────────────────────────────────────────

export type TraceComparison = {
  sameSequence: boolean;
  /** Step index of the first divergence, or null when the sequences agree as far as both go. */
  divergedAt: number | null;
  sequenceA: readonly (string | null)[];
  sequenceB: readonly (string | null)[];
  outcomeA: string;
  outcomeB: string;
  deltaActions: number;
  deltaDurationMs: number;
  /** Generated summary. Never authored. */
  summary: string;
};

/**
 * Compare two runs.
 *
 * The question this exists to answer is "why did this run go differently from that one", which is
 * unanswerable from prose logs and is the first thing anybody asks when a planner changes. The
 * divergence point matters more than the totals: two runs that differ only in their last step share
 * a cause, and two that differ at step one do not.
 */
export function compareTraces(a: RunTrace, b: RunTrace): TraceComparison {
  const seqA = a.decisions.map((d) => d.chosen);
  const seqB = b.decisions.map((d) => d.chosen);

  let divergedAt: number | null = null;
  const shared = Math.min(seqA.length, seqB.length);
  for (let i = 0; i < shared; i++) {
    if (seqA[i] !== seqB[i]) { divergedAt = i; break; }
  }
  // Equal as far as both go, but one continued — that is a divergence at the shorter one's end,
  // not agreement. Reporting it as agreement would hide a run that stopped early.
  if (divergedAt === null && seqA.length !== seqB.length) divergedAt = shared;

  const outcomeA = a.conclusion.outcome;
  const outcomeB = b.conclusion.outcome;
  const sameSequence = divergedAt === null;

  const summary =
    divergedAt === null
      ? `identical sequence; ${outcomeA === outcomeB ? `both ${outcomeA}` : `${outcomeA} vs ${outcomeB}`}`
      : `diverged at step ${divergedAt + 1}: ${seqA[divergedAt] ?? "—"} vs ${seqB[divergedAt] ?? "—"}` +
        `; ${outcomeA} vs ${outcomeB}`;

  return {
    sameSequence,
    divergedAt,
    sequenceA: seqA,
    sequenceB: seqB,
    outcomeA,
    outcomeB,
    deltaActions: b.totals.actions - a.totals.actions,
    deltaDurationMs: b.totals.durationMs - a.totals.durationMs,
    summary,
  };
}

// ─── STORE ───────────────────────────────────────────────────────────────────

/**
 * Where traces live. A port, for the same reason the registry's capability is a port: a trace store
 * that could only be exercised against a real database would be exercised rarely.
 */
export type TraceStore = {
  put(trace: RunTrace): Promise<void>;
  get(runId: string): Promise<RunTrace | null>;
  /** Most recent first. `limit` bounds the read, because a growing store must not become a full scan. */
  recent(limit: number): Promise<readonly RunTrace[]>;
};

/**
 * An in-memory store. Real by default in tests, and deliberately available in production too — a
 * trace kept only in memory is worth more than no trace, and it means nothing in the agent path
 * fails because a database is unreachable.
 */
export function memoryTraceStore(capacity = 200): TraceStore {
  const byId = new Map<string, RunTrace>();
  const order: string[] = [];

  return {
    async put(trace) {
      if (!byId.has(trace.runId)) order.unshift(trace.runId);
      byId.set(trace.runId, trace);
      while (order.length > capacity) {
        const evicted = order.pop();
        if (evicted) byId.delete(evicted);
      }
    },
    async get(runId) {
      return byId.get(runId) ?? null;
    },
    async recent(limit) {
      return order.slice(0, Math.max(0, limit)).map((id) => byId.get(id)!).filter(Boolean);
    },
  };
}
