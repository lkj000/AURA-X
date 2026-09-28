/**
 * A-03 — PLANNER
 *
 * The criterion that matters most is "two different goals produce two different action sequences",
 * because it is the one a fixed procedure cannot pass however it is dressed up.
 */
import { plan, rank, scoreAction, renderLog } from "../agent/planner";
import { ACTIONS, getAction, initialState, type ActionPorts, type AgentState } from "../agent/actionRegistry";
import { evaluateGoal, type AgentGoal } from "../agent/goal";
import type { CTLv1 } from "@aura-x/ctl";

const CTL = { meta: { title: "t" } } as unknown as CTLv1;
const CONSTRAINTS = { title: "Ke Star", subgenre: "private_school", created_by: "u1" };

function goal(over: Partial<AgentGoal> = {}): AgentGoal {
  return {
    constraints: CONSTRAINTS,
    target: { requireValidation: true, requireStored: true },
    effort: { maxIterations: 6, maxActions: 20 },
    ...over,
  };
}

function ports(over: Partial<ActionPorts> = {}, score = 84): ActionPorts {
  return {
    createTrack:      async () => ({ trackId: "trk_1" }),
    synthesizeRemote: async () => ({ ctl: CTL }),
    synthesizeLocal:  () => CTL,
    persistCtl:       async () => ({ ctlId: "ctl_1" }),
    revise:           async () => ({
      ctl: CTL, compositeScore: score, validationPassed: true, iterationsRun: 1, mutationsApplied: 1,
    }),
    storeResult:      async () => undefined,
    ...over,
  };
}

const seq = (r: Awaited<ReturnType<typeof plan>>) => r.decisions.map((d) => d.chosen);

describe("A-03 · action order is not hard-coded", () => {
  it("reaches the goal without any sequence being written down", async () => {
    const r = await plan(goal(), ports());
    expect(r.conclusion.outcome).toBe("met");
    expect(seq(r)).toEqual([
      "create_track", "synthesize_ctl_remote", "persist_ctl", "revise", "store_result",
    ]);
  });

  it("does nothing at all when the goal is already satisfied", async () => {
    // Otherwise the agent works to reach a place it is standing in.
    const done: AgentState = { ...initialState(), validationPassed: true, stored: true };
    const r = await plan(goal(), ports(), { from: done });
    expect(r.decisions).toHaveLength(0);
    expect(r.conclusion.outcome).toBe("met");
  });
});

describe("A-03 · two different goals produce two different sequences", () => {
  it("skips storing when the goal never asked for it", async () => {
    const stored   = await plan(goal({ target: { requireValidation: true, requireStored: true } }), ports());
    const unstored = await plan(goal({ target: { requireValidation: true } }), ports());
    expect(seq(stored)).toContain("store_result");
    expect(seq(unstored)).not.toContain("store_result");
    expect(seq(stored)).not.toEqual(seq(unstored));
  });

  it("revises repeatedly for a score target it keeps missing, and once for one it meets", async () => {
    const hard = await plan(
      goal({ target: { minCompositeScore: 95 }, effort: { maxIterations: 4, maxActions: 20 } }),
      ports({}, 60),
    );
    const easy = await plan(
      goal({ target: { minCompositeScore: 50 }, effort: { maxIterations: 4, maxActions: 20 } }),
      ports({}, 60),
    );
    const revisions = (r: typeof hard) => seq(r).filter((id) => id === "revise").length;
    expect(revisions(hard)).toBeGreaterThan(revisions(easy));
    expect(hard.conclusion.outcome).toBe("effort_exhausted");
    expect(easy.conclusion.outcome).toBe("met");
  });

  it("stops at the effort bound and names it rather than reporting complete", async () => {
    const r = await plan(
      goal({ target: { minCompositeScore: 99 }, effort: { maxIterations: 2, maxActions: 20 } }),
      ports({}, 41),
    );
    expect(r.conclusion.outcome).toBe("effort_exhausted");
    if (r.conclusion.outcome === "effort_exhausted") {
      expect(r.conclusion.bound).toBe("maxIterations");
      expect(r.conclusion.verdict.fails).toContain("composite_score");
    }
  });
});

describe("A-03 · a failing action does not abort the run where an alternative exists", () => {
  it("falls back to the local engine after the remote one throws, and still meets the goal", async () => {
    const r = await plan(goal(), ports({ synthesizeRemote: async () => { throw new Error("down"); } }));
    expect(seq(r)).toEqual([
      "create_track", "synthesize_ctl_remote", "synthesize_ctl_local",
      "persist_ctl", "revise", "store_result",
    ]);
    expect(r.state.ctlSource).toBe("local");
    expect(r.conclusion.outcome).toBe("met");
    // The fallback is a recorded decision, not a swallowed exception.
    expect(r.decisions[1].ok).toBe(false);
    expect(r.decisions[1].error).toBe("ACTION_THREW");
  });

  it("prefers the better engine until it has evidence against it", () => {
    const s = { ...initialState(), trackId: "trk_1" };
    expect(rank(s, goal())[0].action.id).toBe("synthesize_ctl_remote");
    const burned = { ...s, failures: { synthesize_ctl_remote: 1 } };
    expect(rank(burned, goal())[0].action.id).toBe("synthesize_ctl_local");
  });

  it("does not let cost route around the better engine", () => {
    // The local engine is free and worse. Scored on cost alone it would win every time.
    const s = { ...initialState(), trackId: "trk_1" };
    const remote = scoreAction(getAction("synthesize_ctl_remote")!, s, goal());
    const local  = scoreAction(getAction("synthesize_ctl_local")!,  s, goal());
    expect(remote.why.costPenalty).toBeGreaterThan(local.why.costPenalty);
    expect(remote.score).toBeGreaterThan(local.score);
  });
});

describe("A-03 · every selection records what was chosen, what else was eligible, and why", () => {
  it("records the alternatives alongside the choice", async () => {
    const r = await plan(goal(), ports());
    const synth = r.decisions.find((d) => d.chosen === "synthesize_ctl_remote")!;
    expect(synth.considered.map((c) => c.id)).toEqual(
      expect.arrayContaining(["synthesize_ctl_remote", "synthesize_ctl_local"]),
    );
    expect(synth.reason).toContain("prior");
    expect(synth.cost).toBe("compute");
    expect(typeof synth.durationMs).toBe("number");
  });

  it("derives the readable log from the decisions rather than writing it separately", async () => {
    const r = await plan(goal(), ports());
    expect(r.log).toEqual(renderLog(r.decisions));
    expect(r.log[0]).toContain("create_track");
  });

  it("is reproducible on identical input", async () => {
    const a = await plan(goal(), ports(), { now: () => 0 });
    const b = await plan(goal(), ports(), { now: () => 0 });
    expect(seq(a)).toEqual(seq(b));
    expect(a.decisions.map((d) => d.reason)).toEqual(b.decisions.map((d) => d.reason));
  });
});

describe("A-03 · removing an action changes behaviour with no code edit", () => {
  it("routes through the local engine when the remote action is not in the set", async () => {
    const without = ACTIONS.filter((a) => a.id !== "synthesize_ctl_remote");
    const r = await plan(goal(), ports(), { actions: without });
    expect(seq(r)).not.toContain("synthesize_ctl_remote");
    expect(r.state.ctlSource).toBe("local");
    expect(r.conclusion.outcome).toBe("met");
  });

  it("reports no_action_available when nothing can establish what the goal needs", async () => {
    const crippled = ACTIONS.filter((a) => a.id === "create_track");
    const r = await plan(goal(), ports(), { actions: crippled });
    expect(r.conclusion.outcome).toBe("no_action_available");
    // An honest incompletion, not a failure and not a success.
    expect(r.conclusion.verdict.fails).toContain("stored");
  });
});

describe("A-03 · necessary work no clause mentions still happens", () => {
  it("chooses create_track even though no goal clause asks for a track", () => {
    // Without the establishesNew term this scores zero on goal advancement and is never chosen —
    // and every run stalls before it starts.
    const g = goal({ target: { requireStored: true } });
    expect(evaluateGoal(g, initialState()).fails).toContain("stored");
    expect(rank(initialState(), g)[0].action.id).toBe("create_track");
  });
});

describe("A-03 · a supplied action set may extend the registry, not only narrow it", () => {
  it("selects an action the global registry has never seen", async () => {
    // Regression. rank() used to evaluate preconditions over the global ACTIONS and then filter by
    // the supplied set, so a runtime-registered action was invisible however correctly it was
    // declared. Every test here removed actions, so none caught it — A-07's first paid action did.
    // It would also have blocked D-10, where DAW device controls become actions that do not exist
    // at build time.
    // A third synthesis route, free and highly rated, so it wins on score rather than by being the
    // only option — the test must prove the action was CONSIDERED, not merely unavoidable.
    const extra = {
      id: "synthesize_ctl_cached",
      title: "Reuse a cached CTL",
      cost: "free" as const,
      prior: 1.0,
      effects: ["ctl", "ctlSource"] as const,
      precondition: (s: AgentState) => !!s.trackId && !s.ctl,
      run: async () => ({ ok: true as const, patch: { ctl: CTL, ctlSource: "local" as const }, note: "cached" }),
    };
    const r = await plan(goal(), ports(), { actions: [...ACTIONS, extra] });
    expect(seq(r)).toContain("synthesize_ctl_cached");
    expect(seq(r)).not.toContain("synthesize_ctl_remote");
  });

  it("still honours preconditions for actions outside the registry", async () => {
    const never = {
      id: "impossible",
      title: "Never runnable",
      cost: "free" as const,
      prior: 1.0,
      effects: ["stored"] as const,
      precondition: () => false,
      run: async () => ({ ok: true as const, patch: {}, note: "" }),
    };
    const r = await plan(goal(), ports(), { actions: [...ACTIONS, never] });
    expect(seq(r)).not.toContain("impossible");
  });
});
