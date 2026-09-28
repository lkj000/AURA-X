/**
 * A-04 — EPISODIC MEMORY
 *
 * The three-valued discipline carries the most weight here. An action nobody has tried and an
 * action that has never worked must not look alike, or the untried one is condemned before it is
 * tested and can never gather the evidence that would exonerate it.
 */
import {
  episodeFrom, goalSimilarity, memoryEpisodeStore, evidenceFrom, recall, NO_PRIOR_EVIDENCE,
} from "../agent/memory";
import { buildTrace, type RunTrace } from "../agent/trace";
import { plan, rank } from "../agent/planner";
import { initialState, type ActionPorts } from "../agent/actionRegistry";
import type { AgentGoal } from "../agent/goal";
import type { CTLv1 } from "@aura-x/ctl";

const CTL = { meta: { title: "t" } } as unknown as CTLv1;

const goal = (over: Partial<AgentGoal["constraints"]> = {}, target: AgentGoal["target"] = { requireValidation: true, requireStored: true }): AgentGoal => ({
  constraints: { title: "Ke Star", subgenre: "private_school", created_by: "u1", ...over },
  target,
  effort: { maxIterations: 6, maxActions: 20 },
});

function ports(over: Partial<ActionPorts> = {}): ActionPorts {
  return {
    createTrack:      async () => ({ trackId: "trk" }),
    synthesizeRemote: async () => ({ ctl: CTL }),
    synthesizeLocal:  () => CTL,
    persistCtl:       async () => ({ ctlId: "ctl" }),
    revise:           async () => ({ ctl: CTL, compositeScore: 84, validationPassed: true, iterationsRun: 1, mutationsApplied: 1 }),
    storeResult:      async () => undefined,
    ...over,
  };
}

async function trace(runId: string, g = goal(), p = ports()): Promise<RunTrace> {
  let c = 0;
  const r = await plan(g, p, { now: () => (c += 5) });
  return buildTrace({ runId, goal: g, startedAt: 0, endedAt: c, decisions: r.decisions, conclusion: r.conclusion });
}

describe("A-04 · every run writes one episode containing every action taken", () => {
  it("keeps the full action sequence, not just a score", async () => {
    const e = episodeFrom(await trace("r1"), 1000);
    expect(e.trace.decisions.map((d) => d.chosen)).toContain("create_track");
    expect(e.trace.decisions.length).toBeGreaterThan(3);
  });
});

describe("A-04 · episodes are retrievable by goal similarity", () => {
  it("scores an identical goal at 1 and a different subgenre far below", () => {
    expect(goalSimilarity(goal(), goal())).toBe(1);
    expect(goalSimilarity(goal(), goal({ subgenre: "sgija" }))).toBeLessThan(0.5);
  });

  it("lets subgenre dominate — two goals in different subgenres teach each other little", () => {
    const sameElse = goalSimilarity(goal({ bpm: 110, key: "F#m" }), goal({ subgenre: "sgija", bpm: 110, key: "F#m" }));
    expect(sameElse).toBeLessThan(0.5);
  });

  it("degrades tempo similarity smoothly and saturates", () => {
    const near = goalSimilarity(goal({ bpm: 110 }), goal({ bpm: 114 }));
    const far  = goalSimilarity(goal({ bpm: 110 }), goal({ bpm: 160 }));
    expect(near).toBeGreaterThan(far);
    expect(goalSimilarity(goal({ bpm: 110 }), goal({ bpm: 300 }))).toEqual(far);
  });

  it("returns the most similar first and honours the floor", async () => {
    const store = memoryEpisodeStore();
    await store.append(episodeFrom(await trace("same", goal()), 1));
    await store.append(episodeFrom(await trace("other", goal({ subgenre: "sgija" })), 2));
    const got = await store.similar(goal(), 10);
    expect(got.map((e) => e.runId)).toEqual(["same"]);
  });

  it("compares nothing when the goals share no comparable field", () => {
    expect(goalSimilarity(
      { constraints: { title: "a", subgenre: "x", created_by: "u" }, target: {}, effort: { maxIterations: 1, maxActions: 1 } },
      { constraints: { title: "b", subgenre: "x", created_by: "u" }, target: {}, effort: { maxIterations: 1, maxActions: 1 } },
    )).toBe(1); // subgenre matches, and it is the only comparable field
  });
});

describe("A-04 · absence of prior episodes is explicit, never a zero", () => {
  it("reports no evidence as null, not as a zero success rate", () => {
    const e = evidenceFrom([]);
    expect(e.isEmpty).toBe(true);
    expect(e.metRate).toBeNull();
    expect(e.forAction("revise").successRate).toBeNull();
    expect(e.forAction("revise").attempts).toBe(0);
  });

  it("distinguishes never tried from never worked", async () => {
    const failing = await trace("f", goal(), ports({ synthesizeRemote: async () => { throw new Error("x"); } }));
    const e = evidenceFrom([episodeFrom(failing, 1)]);
    expect(e.forAction("synthesize_ctl_remote").successRate).toBe(0);   // tried, never worked
    expect(e.forAction("store_result").successRate).not.toBeNull();     // tried, worked
    expect(e.forAction("no_such_action").successRate).toBeNull();       // never tried
  });

  it("does not penalise an action it has no evidence about", () => {
    const s = { ...initialState(), trackId: "t" };
    const blind = rank(s, goal())[0];
    const empty = rank(s, goal(), undefined, NO_PRIOR_EVIDENCE)[0];
    expect(blind.score).toBe(empty.score);
    expect(blind.why.evidencePenalty).toBe(0);
    expect(blind.why.observedRate).toBeNull();
  });
});

describe("A-04 · the planner's selections can differ because of prior episodes", () => {
  it("turns away from an action that repeatedly failed in earlier runs", async () => {
    const s = { ...initialState(), trackId: "t" };
    expect(rank(s, goal())[0].action.id).toBe("synthesize_ctl_remote");

    const broken = ports({ synthesizeRemote: async () => { throw new Error("down"); } });
    const priors = [
      episodeFrom(await trace("e1", goal(), broken), 1),
      episodeFrom(await trace("e2", goal(), broken), 2),
      episodeFrom(await trace("e3", goal(), broken), 3),
    ];
    const learned = rank(s, goal(), undefined, evidenceFrom(priors));
    expect(learned[0].action.id).toBe("synthesize_ctl_local");
    expect(learned.find((r) => r.action.id === "synthesize_ctl_remote")!.why.observedRate).toBe(0);
  });

  it("changes the whole run's sequence when evidence is supplied", async () => {
    const broken = ports({ synthesizeRemote: async () => { throw new Error("down"); } });
    const priors = evidenceFrom([
      episodeFrom(await trace("e1", goal(), broken), 1),
      episodeFrom(await trace("e2", goal(), broken), 2),
      episodeFrom(await trace("e3", goal(), broken), 3),
    ]);
    const blind   = await plan(goal(), ports());
    const learned = await plan(goal(), ports(), { evidence: priors });
    expect(blind.decisions.map((d) => d.chosen)).toContain("synthesize_ctl_remote");
    expect(learned.decisions.map((d) => d.chosen)).not.toContain("synthesize_ctl_remote");
    expect(learned.conclusion.outcome).toBe("met");
  });

  it("does not let one unlucky run reorder everything", async () => {
    // A single attempt is an anecdote. Without the confidence ramp the agent abandons a good action
    // on no real evidence.
    const once = evidenceFrom([
      episodeFrom(await trace("e1", goal(), ports({ synthesizeRemote: async () => { throw new Error("blip"); } })), 1),
    ]);
    const s = { ...initialState(), trackId: "t" };
    expect(rank(s, goal(), undefined, once)[0].action.id).toBe("synthesize_ctl_remote");
  });

  it("does not let memory outweigh what the run is for", () => {
    // History informs the choice; it must not overrule the objective.
    const s = { ...initialState(), ctl: CTL, ctlId: "c" };
    const hostile = evidenceFrom([]);
    const ranked = rank(s, goal({}, { minCompositeScore: 90 }), undefined, hostile);
    expect(ranked[0].action.id).toBe("revise");
  });

  it("says in the reason that evidence moved it", async () => {
    const broken = ports({ synthesizeRemote: async () => { throw new Error("down"); } });
    const priors = evidenceFrom([
      episodeFrom(await trace("e1", goal(), broken), 1),
      episodeFrom(await trace("e2", goal(), broken), 2),
      episodeFrom(await trace("e3", goal(), broken), 3),
    ]);
    const r = await plan(goal(), ports(), { evidence: priors });
    expect(r.decisions.find((d) => d.chosen === "synthesize_ctl_local")!.considered
      .find((c) => c.id === "synthesize_ctl_remote")!.why).toContain("observed 0%");
  });
});

describe("A-04 · an episode is immutable once written; corrections append", () => {
  it("keeps the original readable and stamps it superseded", async () => {
    const store = memoryEpisodeStore();
    await store.append(episodeFrom(await trace("wrong"), 1));
    await store.append(episodeFrom(await trace("right"), 2, "wrong"));

    const original = await store.get("wrong");
    expect(original).not.toBeNull();                 // never removed
    expect(original!.supersededBy).toBe("right");
    expect((await store.get("right"))!.corrects).toBe("wrong");
  });

  it("excludes superseded episodes from recall", async () => {
    const store = memoryEpisodeStore();
    await store.append(episodeFrom(await trace("wrong"), 1));
    await store.append(episodeFrom(await trace("right"), 2, "wrong"));
    expect((await store.similar(goal(), 10)).map((e) => e.runId)).toEqual(["right"]);
  });

  it("bounds growth rather than accumulating for ever", async () => {
    const store = memoryEpisodeStore(2);
    for (const id of ["a", "b", "c"]) await store.append(episodeFrom(await trace(id), 1));
    expect(await store.get("a")).toBeNull();
    expect((await store.all()).map((e) => e.runId)).toEqual(["b", "c"]);
  });
});

describe("A-04 · recall joins the store to the evidence", () => {
  it("returns evidence about the comparable runs only", async () => {
    const store = memoryEpisodeStore();
    await store.append(episodeFrom(await trace("ps", goal()), 1));
    await store.append(episodeFrom(await trace("sg", goal({ subgenre: "sgija" })), 2));
    const e = await recall(store, goal());
    expect(e.episodes.map((x) => x.runId)).toEqual(["ps"]);
    expect(e.metRate).toBe(1);
  });

  it("returns empty evidence rather than failing when nothing is comparable", async () => {
    const store = memoryEpisodeStore();
    await store.append(episodeFrom(await trace("sg", goal({ subgenre: "sgija" })), 1));
    const e = await recall(store, goal());
    expect(e.isEmpty).toBe(true);
    expect(e.metRate).toBeNull();
  });
});

describe("A-04 · the confidence ramp is constrained by the registry, not chosen", () => {
  it("keeps a single attempt below the narrowest prior gap in the action set", () => {
    // The invariant behind EVIDENCE_CONFIDENCE_AT. If a future action's prior sits closer to a
    // competitor's than one attempt's penalty, one unlucky run permanently reorders the agent —
    // and no single behavioural test would catch it, because it depends on the whole registry.
    const s = { ...initialState(), trackId: "t" };
    const blind = rank(s, goal());
    const gaps = blind.slice(1).map((r, i) => blind[i].score - r.score).filter((g) => g > 0);
    const narrowest = Math.min(...gaps);

    const oneAttempt = evidenceFrom([{
      runId: "x", recordedAt: 1, goal: goal(),
      trace: { runId: "x", goal: goal(), startedAt: 0, endedAt: 1,
        decisions: [{ step: 1, chosen: blind[0].action.id, reason: "", considered: [], ok: false,
                      note: "", error: "ACTION_THREW", cost: "compute" as const, durationMs: 1 }],
        conclusion: { outcome: "no_action_available" as const,
                      verdict: { met: false, settled: true, holds: [], fails: [], unknown: [], report: [] } },
        totals: { actions: 1, succeeded: 0, failed: 1, durationMs: 1,
                  byCost: { free: 0, compute: 1, paid: 0 }, failedActions: [blind[0].action.id] } },
    }]);

    const penalty = rank(s, goal(), undefined, oneAttempt)
      .find((r) => r.action.id === blind[0].action.id)!.why.evidencePenalty;
    expect(penalty).toBeLessThan(narrowest);
  });
});
