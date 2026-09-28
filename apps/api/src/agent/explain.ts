/**
 * A-09 — EXPLANATION
 *
 * Why the output is what it is, reduced to the decisions that produced it.
 *
 * The system returned a track and a score and could say nothing about how either came about, or
 * what would have to change for a better one. Output was accepted or rejected whole, and the
 * platform taught nobody anything.
 *
 * GENERATED FROM THE TRACE, NEVER AUTHORED ALONGSIDE IT. Every sentence below is built from a
 * recorded field. A narrative written next to a run is a second artefact that can disagree with
 * what happened, and being the readable one it wins — so the only safe arrangement is that the
 * explanation cannot say anything the trace does not contain.
 *
 * IT STATES WHAT IT DOES NOT KNOW. Two things this system genuinely cannot tell a producer, both
 * inherited from limits named elsewhere rather than discovered here:
 *
 *   - which action caused the score. A-05 assigns credit uniformly across a run because proper
 *     attribution needs counterfactuals, and generation is not repeatable at that granularity.
 *   - what a different route would have scored. Only the path taken was ever evaluated.
 *
 * Naming them is the point. An explanation that quietly omits its limits reads as complete, and a
 * producer acts on it as though it were.
 */

import type { RunTrace } from "./trace";
import type { Decision } from "./planner";

// ─── SHAPE ───────────────────────────────────────────────────────────────────

export type LeveragePoint = {
  /** The single change most likely to improve the result. */
  readonly change: string;
  /** The recorded fact it follows from. Never a guess dressed as a reason. */
  readonly because: string;
};

export type Explanation = {
  readonly runId: string;
  /** One line: what came out. */
  readonly outcome: string;
  /** What the agent did, reduced from the decisions. */
  readonly whatHappened: readonly string[];
  /** Why the result is what it is, clause by clause. */
  readonly whyThisResult: readonly string[];
  /** What this run cannot tell you. Stated, not omitted. */
  readonly unknowns: readonly string[];
  /** The highest-leverage available change, or null when the goal was met. */
  readonly highestLeverage: LeveragePoint | null;
  readonly provenance: {
    readonly generatedFrom: "trace";
    readonly decisions: number;
    readonly runId: string;
  };
};

// ─── REDUCTION ───────────────────────────────────────────────────────────────

function describeDecision(d: Decision): string {
  if (d.chosen === null) return "nothing could run";
  const head = d.exploratory
    ? `tried ${d.chosen} to gather evidence`
    : `chose ${d.chosen}`;
  if (!d.ok) return `${head}, which failed (${d.error})`;
  const alternatives = d.considered.length - 1;
  const over = alternatives > 0 ? ` over ${alternatives} alternative${alternatives === 1 ? "" : "s"}` : "";
  return `${head}${over} — ${d.note}`;
}

/**
 * The limits of what this run can support, drawn from what it did rather than from a fixed list.
 *
 * A run with one synthesis route cannot be asked what the other would have done; a run where an
 * action failed cannot say whether it would have helped. Deriving them from the trace keeps the
 * statement true for the run in hand instead of generically cautious.
 */
function unknownsFor(trace: RunTrace): readonly string[] {
  const out: string[] = [];
  const taken = trace.decisions.filter((d) => d.ok && d.chosen).map((d) => d.chosen!);

  if (taken.length > 1) {
    out.push(
      "which of these actions moved the score — credit is assigned evenly across a run, because " +
      "separating them needs a comparison this platform cannot run twice identically",
    );
  }

  const notTaken = new Set<string>();
  for (const d of trace.decisions) {
    for (const c of d.considered) if (c.id !== d.chosen) notTaken.add(c.id);
  }
  for (const t of taken) notTaken.delete(t);
  if (notTaken.size > 0) {
    out.push(`what ${[...notTaken].sort().join(", ")} would have produced — only the route taken was evaluated`);
  }

  const failed = trace.decisions.filter((d) => !d.ok && d.chosen);
  for (const f of failed) {
    out.push(`whether ${f.chosen} would have helped — it failed with ${f.error} and produced nothing to judge`);
  }

  if (trace.conclusion.verdict.unknown.length > 0) {
    out.push(
      `whether ${trace.conclusion.verdict.unknown.join(", ")} would have held — the run ended before ` +
      "the evidence was gathered",
    );
  }

  return out;
}

/**
 * The single change most worth making.
 *
 * One, not a list. A list of five improvements is a way of not choosing, and the producer reading it
 * has to do the ranking the system declined to do. Each is tied to the recorded fact that implies
 * it, so it can be checked rather than believed.
 */
function leverageFor(trace: RunTrace): LeveragePoint | null {
  const c = trace.conclusion;

  switch (c.outcome) {
    case "met":
      return null;

    case "effort_exhausted":
      return {
        change: `raise the ${c.bound} bound above ${c.limit}`,
        because: `the run stopped at that bound with ${[...c.verdict.fails, ...c.verdict.unknown].join(", ") || "clauses"} still unmet`,
      };

    case "budget_exhausted":
      return {
        change: "raise the cost ceiling, or register a cheaper route to the same effect",
        because: c.reason,
      };

    case "unsatisfiable": {
      const failed = c.verdict.fails.join(", ");
      return {
        change: `relax ${failed}, or change the inputs that feed it`,
        because: `${failed} did not hold and no available action affects it`,
      };
    }

    case "no_action_available": {
      const blocked = [...c.verdict.fails, ...c.verdict.unknown].join(", ");
      return {
        change: `register an action that establishes ${blocked}`,
        because: `nothing eligible could advance ${blocked}`,
      };
    }

    case "stopped":
      return {
        change: "let the run finish",
        because: "it was stopped on request before reaching a conclusion of its own",
      };
  }
}

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────

export function explainRun(trace: RunTrace): Explanation {
  const failedCount = trace.totals.failed;
  const outcome =
    trace.conclusion.outcome === "met"
      ? `Met the goal in ${trace.totals.actions} actions.`
      : `Did not meet the goal: ${trace.conclusion.outcome.replace(/_/g, " ")}, after ${trace.totals.actions} actions.`;

  const whatHappened = trace.decisions.map(describeDecision);
  if (failedCount > 0) {
    whatHappened.push(
      `${failedCount} action${failedCount === 1 ? "" : "s"} failed and ${failedCount === 1 ? "was" : "were"} routed around.`,
    );
  }

  return {
    runId: trace.runId,
    outcome,
    whatHappened,
    // Straight from the verdict: the clause text the goal itself produced, not a paraphrase.
    whyThisResult: trace.conclusion.verdict.report,
    unknowns: unknownsFor(trace),
    highestLeverage: leverageFor(trace),
    provenance: { generatedFrom: "trace", decisions: trace.decisions.length, runId: trace.runId },
  };
}

/** The explanation as lines, for a terminal or a log. Rendering only — it adds no claim. */
export function renderExplanation(e: Explanation): readonly string[] {
  const lines = [e.outcome, "", "What happened:"];
  lines.push(...e.whatHappened.map((l) => `  · ${l}`));

  if (e.whyThisResult.length > 0) {
    lines.push("", "Why:");
    lines.push(...e.whyThisResult.map((l) => `  · ${l}`));
  }

  if (e.highestLeverage) {
    lines.push("", "Most worth changing:", `  ${e.highestLeverage.change}`, `  because ${e.highestLeverage.because}`);
  }

  if (e.unknowns.length > 0) {
    lines.push("", "This run cannot tell you:");
    lines.push(...e.unknowns.map((l) => `  · ${l}`));
  }

  return lines;
}
