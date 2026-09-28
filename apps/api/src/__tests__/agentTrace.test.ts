/**
 * A-08 — DECISION TRACE
 */
import { buildTrace, totalsFor, renderTrace, compareTraces, memoryTraceStore, type RunTrace } from "../agent/trace";
import { plan } from "../agent/planner";
import { initialState, type ActionPorts } from "../agent/actionRegistry";
import { evaluateGoal, type AgentGoal } from "../agent/goal";
import type { CTLv1 } from "@aura-x/ctl";

const CTL = { meta: { title: "t" } } as unknown as CTLv1;
const goal = (over: Partial<AgentGoal> = {}): AgentGoal => ({
  constraints: { title: "Ke Star", subgenre: "private_school", created_by: "u1" },
  target: { requireValidation: true, requireStored: true },
  effort: { maxIterations: 6, maxActions: 20 },
  ...over,
});

function ports(over: Partial<ActionPorts> = {}, score = 84): ActionPorts {
  return {
    createTrack:      async () => ({ trackId: "trk_1" }),
    synthesizeRemote: async () => ({ ctl: CTL }),
    synthesizeLocal:  () => CTL,
    persistCtl:       async () => ({ ctlId: "ctl_1" }),
    revise:           async () => ({ ctl: CTL, compositeScore: score, validationPassed: true, iterationsRun: 1, mutationsApplied: 1 }),
    storeResult:      async () => undefined,
    ...over,
  };
}

async function traceOf(runId: string, g = goal(), p = ports()): Promise<RunTrace> {
  let clock = 0;
  const r = await plan(g, p, { now: () => (clock += 5) });
  return buildTrace({ runId, goal: g, startedAt: 0, endedAt: clock, decisions: r.decisions, conclusion: r.conclusion });
}

describe("A-08 · every decision writes a structured record", () => {
  it("carries the run's decisions with cost and duration on each", async () => {
    const t = await traceOf("run_1");
    expect(t.decisions.length).toBeGreaterThan(0);
    for (const d of t.decisions) {
      expect(typeof d.durationMs).toBe("number");
      expect(d.considered.length).toBeGreaterThan(0);
      expect(typeof d.reason).toBe("string");
    }
  });

  it("stores the goal with the trace rather than referencing it", async () => {
    // A trace read a year later must be interpretable alone. A goal edited since would silently
    // re-describe what the run was trying to do.
    const g = goal();
    const t = await traceOf("run_1", g);
    expect(t.goal).toEqual(g);
  });
});

describe("A-08 · cost and duration are on the record", () => {
  it("totals actions by cost class", async () => {
    const t = await traceOf("run_1");
    expect(t.totals.byCost.free + t.totals.byCost.compute + t.totals.byCost.paid).toBe(t.totals.actions);
    expect(t.totals.byCost.compute).toBeGreaterThan(0); // synthesis and revision
    expect(t.totals.durationMs).toBeGreaterThan(0);
  });

  it("counts repeated failure of one action as one failing action", () => {
    // Four retries of one broken thing is one problem, not four.
    const d = (chosen: string, ok: boolean) => ({
      step: 1, chosen, reason: "", considered: [], ok, note: "", cost: "compute" as const, durationMs: 1,
      ...(ok ? {} : { error: "ACTION_THREW" }),
    });
    const t = totalsFor([d("a", false), d("a", false), d("b", true)]);
    expect(t.failed).toBe(2);
    expect(t.failedActions).toEqual(["a"]);
  });
});

describe("A-08 · the readable account is generated, never authored", () => {
  it("renders the run from the trace including its conclusion and verdict", async () => {
    const t = await traceOf("run_1");
    const lines = renderTrace(t);
    expect(lines[0]).toContain("run_1");
    expect(lines.join("\n")).toContain("create_track");
    expect(lines.join("\n")).toContain("Goal met.");
  });

  it("reports an incomplete run as incomplete in the rendered account", async () => {
    const t = await traceOf(
      "run_2",
      goal({ target: { minCompositeScore: 99 }, effort: { maxIterations: 2, maxActions: 20 } }),
      ports({}, 41),
    );
    const text = renderTrace(t).join("\n");
    expect(text).not.toContain("Goal met.");
    expect(text).toContain("maxIterations bound");
    expect(text).toContain("not met");
  });

  it("is a pure function of the trace", async () => {
    const t = await traceOf("run_1");
    expect(renderTrace(t)).toEqual(renderTrace(t));
  });
});

describe("A-08 · traces are comparable across runs", () => {
  it("reports an identical sequence as identical", async () => {
    const a = await traceOf("a");
    const b = await traceOf("b");
    const c = compareTraces(a, b);
    expect(c.sameSequence).toBe(true);
    expect(c.divergedAt).toBeNull();
    expect(c.summary).toContain("identical sequence");
  });

  it("finds the step where two runs diverged", async () => {
    const healthy = await traceOf("a");
    const degraded = await traceOf("b", goal(), ports({ synthesizeRemote: async () => { throw new Error("down"); } }));
    const c = compareTraces(healthy, degraded);
    expect(c.sameSequence).toBe(false);
    expect(c.divergedAt).toBe(2); // both chose create_track, then remote; step 3 differs
    expect(c.summary).toContain("diverged at step 3");
    expect(c.deltaActions).toBe(1);
  });

  it("treats a run that stopped early as diverging, not agreeing", async () => {
    // The trap: equal as far as both go looks like agreement and is not.
    const full  = await traceOf("a");
    const short = await traceOf("b", goal({ target: { requireValidation: true } }));
    const c = compareTraces(full, short);
    expect(c.sameSequence).toBe(false);
    expect(c.divergedAt).toBe(short.decisions.length);
  });

  it("names differing outcomes even when the sequence matched", async () => {
    const met = await traceOf("a", goal({ target: { minCompositeScore: 50 } }), ports({}, 84));
    const missed = await traceOf("b", goal({ target: { minCompositeScore: 50 } }), ports({}, 84));
    expect(compareTraces(met, missed).summary).toContain("both met");
  });
});

describe("A-08 · the store is a port, and works in memory", () => {
  it("round-trips a trace", async () => {
    const store = memoryTraceStore();
    const t = await traceOf("run_1");
    await store.put(t);
    expect(await store.get("run_1")).toEqual(t);
    expect(await store.get("absent")).toBeNull();
  });

  it("returns the most recent first and bounds the read", async () => {
    const store = memoryTraceStore();
    for (const id of ["a", "b", "c"]) await store.put(await traceOf(id));
    expect((await store.recent(2)).map((t) => t.runId)).toEqual(["c", "b"]);
    expect(await store.recent(0)).toHaveLength(0);
  });

  it("evicts oldest beyond capacity rather than growing without bound", async () => {
    const store = memoryTraceStore(2);
    for (const id of ["a", "b", "c"]) await store.put(await traceOf(id));
    expect(await store.get("a")).toBeNull();
    expect((await store.recent(10)).map((t) => t.runId)).toEqual(["c", "b"]);
  });

  it("replaces rather than duplicating on the same run id", async () => {
    const store = memoryTraceStore();
    await store.put(await traceOf("run_1"));
    await store.put(await traceOf("run_1"));
    expect(await store.recent(10)).toHaveLength(1);
  });
});

describe("A-08 · the verdict travels with the trace", () => {
  it("keeps the clause-level report so a failure is still named later", async () => {
    const t = await traceOf("r", goal({ target: { minCompositeScore: 99 }, effort: { maxIterations: 2, maxActions: 9 } }), ports({}, 41));
    expect(t.conclusion.verdict.fails).toContain("composite_score");
    expect(evaluateGoal(t.goal, { ...initialState(), compositeScore: 41 }).fails).toContain("composite_score");
  });
});
