/**
 * A-09 — EXPLANATION
 *
 * The hardest criterion to test honestly is "contains no claim the trace does not support", because
 * a passing test can only ever sample. The approach here is structural: every action named in an
 * explanation must appear in the trace, and an explanation must never name an action the run did
 * not consider.
 */
import { explainRun, renderExplanation } from "../agent/explain";
import { buildTrace, type RunTrace } from "../agent/trace";
import { plan } from "../agent/planner";
import { ACTIONS, type ActionPorts } from "../agent/actionRegistry";
import type { AgentGoal } from "../agent/goal";
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
    createTrack:      async () => ({ trackId: "trk" }),
    synthesizeRemote: async () => ({ ctl: CTL }),
    synthesizeLocal:  () => CTL,
    persistCtl:       async () => ({ ctlId: "ctl" }),
    revise:           async () => ({ ctl: CTL, compositeScore: score, validationPassed: true, iterationsRun: 1, mutationsApplied: 1 }),
    storeResult:      async () => undefined,
    ...over,
  };
}

async function trace(g = goal(), p = ports(), opts = {}): Promise<RunTrace> {
  let c = 0;
  const r = await plan(g, p, { now: () => (c += 3), ...opts });
  return buildTrace({ runId: "run_1", goal: g, startedAt: 0, endedAt: c, decisions: r.decisions, conclusion: r.conclusion });
}

describe("A-09 · any output reduces to the decisions that produced it", () => {
  it("accounts for every decision the run took", async () => {
    const t = await trace();
    const e = explainRun(t);
    expect(e.whatHappened.length).toBeGreaterThanOrEqual(t.decisions.length);
    for (const d of t.decisions) {
      expect(e.whatHappened.join("\n")).toContain(d.chosen!);
    }
    expect(e.provenance).toEqual({ generatedFrom: "trace", decisions: t.decisions.length, runId: "run_1" });
  });

  it("says what each choice was made over", async () => {
    const e = explainRun(await trace());
    expect(e.whatHappened.join("\n")).toMatch(/over \d+ alternative/);
  });

  it("names a failure and says it was routed around", async () => {
    const e = explainRun(await trace(goal(), ports({ synthesizeRemote: async () => { throw new Error("down"); } })));
    const text = e.whatHappened.join("\n");
    expect(text).toContain("synthesize_ctl_remote");
    expect(text).toContain("failed");
    expect(text).toContain("routed around");
  });

  it("marks an exploratory action as evidence-gathering rather than a preference", async () => {
    const e = explainRun(await trace(goal(), ports(), {
      gate: { enabled: true, explorationRate: 0.5 }, explore: () => 0.1,
    }));
    expect(e.whatHappened.join("\n")).toContain("to gather evidence");
  });
});

describe("A-09 · it is generated from the trace, never authored alongside", () => {
  it("is a pure function of the trace", async () => {
    const t = await trace();
    expect(explainRun(t)).toEqual(explainRun(t));
  });

  it("takes its 'why' verbatim from the goal's own verdict", async () => {
    // A paraphrase is a second description that can drift from the first.
    const t = await trace(goal({ target: { minCompositeScore: 99 }, effort: { maxIterations: 2, maxActions: 9 } }), ports({}, 41));
    expect(explainRun(t).whyThisResult).toEqual(t.conclusion.verdict.report);
  });

  it("names no action the run did not consider", async () => {
    // The structural form of "no claim the trace does not support".
    const t = await trace();
    const e = explainRun(t);
    const mentioned = ACTIONS.map((a) => a.id).filter((id) =>
      [...e.whatHappened, ...e.unknowns, e.highestLeverage?.change ?? ""].join("\n").includes(id));
    const considered = new Set(t.decisions.flatMap((d) => d.considered.map((c) => c.id)));
    for (const id of mentioned) expect(considered.has(id)).toBe(true);
  });

  it("renders without adding a claim", async () => {
    const e = explainRun(await trace());
    const rendered = renderExplanation(e).join("\n");
    for (const line of e.whatHappened) expect(rendered).toContain(line);
    expect(rendered).toContain(e.outcome);
  });
});

describe("A-09 · it names the highest-leverage available change", () => {
  it("names nothing when the goal was met", async () => {
    expect(explainRun(await trace()).highestLeverage).toBeNull();
  });

  it("names the bound that stopped an exhausted run, and cites it", async () => {
    const e = explainRun(await trace(goal({ target: { minCompositeScore: 99 }, effort: { maxIterations: 2, maxActions: 20 } }), ports({}, 41)));
    expect(e.highestLeverage!.change).toContain("maxIterations");
    expect(e.highestLeverage!.because).toContain("composite_score");
  });

  it("names the missing capability when nothing could run", async () => {
    const e = explainRun(await trace(goal(), ports(), { actions: [ACTIONS[0]] }));
    expect(e.highestLeverage!.change).toContain("register an action");
    expect(e.highestLeverage!.because).toContain("stored");
  });

  it("names the ceiling when cost stopped it", async () => {
    const paid = {
      id: "vendor", title: "v", cost: "paid" as const, prior: 1,
      effects: ["ctl", "ctlSource"] as const,
      precondition: (s: { trackId?: string; ctl?: unknown }) => !!s.trackId && !s.ctl,
      run: async () => ({ ok: true as const, patch: { ctl: CTL }, note: "" }),
    };
    const e = explainRun(await trace(goal(), ports(), {
      actions: [...ACTIONS.filter((a) => !a.id.startsWith("synthesize_")), paid],
      budget: { perRun: { paid: 0 } },
    }));
    expect(e.highestLeverage!.change).toContain("cheaper route");
    expect(e.highestLeverage!.because).toContain("ceiling of 0");
  });

  it("offers exactly one change, not a list", async () => {
    // A list of five improvements is a way of not choosing, and hands the ranking back.
    const e = explainRun(await trace(goal({ target: { minCompositeScore: 99 }, effort: { maxIterations: 2, maxActions: 20 } }), ports({}, 41)));
    expect(Array.isArray(e.highestLeverage)).toBe(false);
    expect(e.highestLeverage!.change.split(/[.;]/).filter(Boolean).length).toBe(1);
  });
});

describe("A-09 · it states what it does not know", () => {
  it("admits it cannot say which action moved the score", async () => {
    const e = explainRun(await trace());
    expect(e.unknowns.join("\n")).toContain("which of these actions moved the score");
  });

  it("admits it cannot say what the route not taken would have produced", async () => {
    const e = explainRun(await trace());
    expect(e.unknowns.join("\n")).toContain("synthesize_ctl_local");
    expect(e.unknowns.join("\n")).toContain("only the route taken was evaluated");
  });

  it("admits a failed action produced nothing to judge", async () => {
    const e = explainRun(await trace(goal(), ports({ synthesizeRemote: async () => { throw new Error("down"); } })));
    expect(e.unknowns.join("\n")).toContain("produced nothing to judge");
  });

  it("admits a clause that was never established", async () => {
    const e = explainRun(await trace(goal({ target: { minCompositeScore: 90 }, effort: { maxIterations: 1, maxActions: 2 } }), ports({}, 41)));
    expect(e.unknowns.join("\n")).toContain("the run ended before the evidence was gathered");
  });

  it("does not claim an unknown it does not have", async () => {
    // A run with no alternatives cannot say a route was not taken. Generic caution would say it
    // anyway, and be wrong.
    const e = explainRun(await trace(goal(), ports(), {
      actions: ACTIONS.filter((a) => a.id !== "synthesize_ctl_local"),
    }));
    expect(e.unknowns.join("\n")).not.toContain("synthesize_ctl_local");
  });

  it("puts the limits in the rendered output rather than hiding them", async () => {
    const rendered = renderExplanation(explainRun(await trace())).join("\n");
    expect(rendered).toContain("This run cannot tell you:");
  });
});
