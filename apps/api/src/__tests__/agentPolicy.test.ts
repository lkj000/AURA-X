/**
 * A-05 — POLICY LEARNING
 *
 * The criterion carrying the most weight is "off by default and armed deliberately", because a
 * learner wired into a money-spending agent and enabled merely by existing is how a system acquires
 * behaviour nobody chose.
 */
import {
  emptyPolicy, updateFromEpisode, updateFromEpisodes, policyAdjustment, utilityOf,
  inspect, reset, gateFromEnv, POLICY_OFF, MAX_EXPLORATION_RATE,
} from "../agent/policy";
import { episodeFrom, type Episode } from "../agent/memory";
import { buildTrace } from "../agent/trace";
import { plan, rank } from "../agent/planner";
import { initialState, type ActionPorts } from "../agent/actionRegistry";
import type { AgentGoal } from "../agent/goal";
import type { CTLv1 } from "@aura-x/ctl";

const CTL = { meta: { title: "t" } } as unknown as CTLv1;
const goal = (subgenre = "private_school"): AgentGoal => ({
  constraints: { title: "Ke Star", subgenre, created_by: "u1" },
  target: { requireValidation: true, requireStored: true },
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

async function episode(id: string, g = goal(), p = ports()): Promise<Episode> {
  let c = 0;
  const r = await plan(g, p, { now: () => (c += 1) });
  return episodeFrom(buildTrace({ runId: id, goal: g, startedAt: 0, endedAt: c, decisions: r.decisions, conclusion: r.conclusion }), 1);
}

const ARMED = { enabled: true, explorationRate: 0 };

describe("A-05 · action values update from episode outcomes", () => {
  it("records support and utility for every action an episode took", async () => {
    const p = updateFromEpisode(emptyPolicy(), await episode("e1"));
    const rows = inspect(p, "private_school");
    expect(rows.map((r) => r.actionId)).toEqual(expect.arrayContaining(["create_track", "revise"]));
    expect(rows.every((r) => r.support === 1)).toBe(true);
  });

  it("scores a succeeding action in a met run above one in a run that fell short", () => {
    expect(utilityOf(true, true)).toBe(1);
    expect(utilityOf(true, false)).toBe(0.5);
    expect(utilityOf(false, true)).toBe(0);
  });

  it("does not punish a correct action for a run that fell short elsewhere", () => {
    // Without the middle value the agent unlearns the things that work on hard goals.
    expect(utilityOf(true, false)).toBeGreaterThan(utilityOf(false, false));
  });

  it("keeps contexts apart — what works in one lane need not in another", async () => {
    let p = emptyPolicy();
    p = updateFromEpisode(p, await episode("e1", goal("private_school")));
    expect(inspect(p, "private_school").length).toBeGreaterThan(0);
    expect(inspect(p, "sgija")).toHaveLength(0);
  });
});

describe("A-05 · a demonstrably bad action is selected less often after evidence", () => {
  it("penalises an action that keeps failing", async () => {
    const broken = ports({ synthesizeRemote: async () => { throw new Error("down"); } });
    const eps = [await episode("e1", goal(), broken), await episode("e2", goal(), broken), await episode("e3", goal(), broken)];
    const p = updateFromEpisodes(emptyPolicy(), eps);
    expect(policyAdjustment(p, "private_school", "synthesize_ctl_remote")).toBeLessThan(0);
    expect(policyAdjustment(p, "private_school", "synthesize_ctl_local")).toBeGreaterThan(0);
  });

  it("says nothing at all below the support threshold", async () => {
    // One observation is not a weak signal; it is no signal. Treating it as weak still lets it
    // decide between closely matched options.
    const p = updateFromEpisode(emptyPolicy(), await episode("e1"));
    expect(policyAdjustment(p, "private_school", "create_track")).toBe(0);
    expect(inspect(p, "private_school").every((r) => r.active === false)).toBe(true);
  });

  it("leaves the score untouched for an action it has never seen", async () => {
    const p = updateFromEpisodes(emptyPolicy(), [await episode("e1"), await episode("e2")]);
    expect(policyAdjustment(p, "private_school", "never_seen")).toBe(0);
  });
});

describe("A-05 · learning is off by default and armed deliberately", () => {
  it("changes nothing when a policy is supplied but the gate is closed", async () => {
    const broken = ports({ synthesizeRemote: async () => { throw new Error("down"); } });
    const p = updateFromEpisodes(emptyPolicy(), [
      await episode("e1", goal(), broken), await episode("e2", goal(), broken), await episode("e3", goal(), broken),
    ]);
    const s = { ...initialState(), trackId: "t" };
    const closed = rank(s, goal(), undefined, undefined, null);
    const supplied = await plan(goal(), ports(), { policy: p });   // gate omitted → off
    expect(supplied.decisions.map((d) => d.chosen)).toContain("synthesize_ctl_remote");
    expect(closed[0].why.policyAdjustment).toBe(0);
  });

  it("changes the choice once armed", async () => {
    const broken = ports({ synthesizeRemote: async () => { throw new Error("down"); } });
    const p = updateFromEpisodes(emptyPolicy(), [
      await episode("e1", goal(), broken), await episode("e2", goal(), broken), await episode("e3", goal(), broken),
    ]);
    const armed = await plan(goal(), ports(), { policy: p, gate: ARMED });
    expect(armed.decisions.map((d) => d.chosen)).not.toContain("synthesize_ctl_remote");
  });

  it("scores identically to never having had a policy when disarmed", async () => {
    // What makes arming safe to reverse.
    const p = updateFromEpisodes(emptyPolicy(), [await episode("e1"), await episode("e2"), await episode("e3")]);
    const a = await plan(goal(), ports(), { now: () => 0 });
    const b = await plan(goal(), ports(), { now: () => 0, policy: p, gate: POLICY_OFF });
    expect(a.decisions.map((d) => d.reason)).toEqual(b.decisions.map((d) => d.reason));
  });

  it("reads the gate from configuration, failing closed on both halves", () => {
    expect(gateFromEnv({})).toEqual({ enabled: false, explorationRate: 0 });
    expect(gateFromEnv({ AGENT_POLICY_LEARNING: "1" }).enabled).toBe(false);       // not "true"
    expect(gateFromEnv({ AGENT_POLICY_LEARNING: "true" }).enabled).toBe(true);
    // A typo in a rate must not turn the agent into a random walk.
    expect(gateFromEnv({ AGENT_POLICY_EXPLORATION_RATE: "banana" }).explorationRate).toBe(0);
    expect(gateFromEnv({ AGENT_POLICY_EXPLORATION_RATE: "-1" }).explorationRate).toBe(0);
    expect(gateFromEnv({ AGENT_POLICY_EXPLORATION_RATE: "0.9" }).explorationRate).toBe(MAX_EXPLORATION_RATE);
  });
});

describe("A-05 · exploration is explicit and bounded", () => {
  it("never explores when the rate is zero", async () => {
    const r = await plan(goal(), ports(), { gate: ARMED, explore: () => 0 });
    expect(r.decisions.every((d) => d.exploratory === false)).toBe(true);
  });

  it("takes the runner-up when the draw falls inside the rate, and records it", async () => {
    const r = await plan(goal(), ports(), {
      gate: { enabled: true, explorationRate: 0.2 },
      explore: () => 0.1,   // always inside
    });
    const explored = r.decisions.filter((d) => d.exploratory);
    expect(explored.length).toBeGreaterThan(0);
    expect(explored[0].reason).toContain("exploratory");
  });

  it("does not explore when there is only one eligible action", async () => {
    const r = await plan(goal(), ports(), { gate: { enabled: true, explorationRate: 1 }, explore: () => 0 });
    expect(r.decisions[0].chosen).toBe("create_track");   // the only option at step 1
    expect(r.decisions[0].exploratory).toBe(false);
  });

  it("cannot explore at all while the gate is closed", async () => {
    const r = await plan(goal(), ports(), { gate: POLICY_OFF, explore: () => 0 });
    expect(r.decisions.every((d) => d.exploratory === false)).toBe(true);
  });

  it("is reproducible when the draw source is injected", async () => {
    const opts = { gate: { enabled: true, explorationRate: 0.5 }, explore: () => 0.1, now: () => 0 };
    const a = await plan(goal(), ports(), opts);
    const b = await plan(goal(), ports(), opts);
    expect(a.decisions.map((d) => d.chosen)).toEqual(b.decisions.map((d) => d.chosen));
  });
});

describe("A-05 · the policy can be inspected and reset", () => {
  it("renders as a table, best first, saying which rows are doing nothing", async () => {
    const p = updateFromEpisodes(emptyPolicy(), [await episode("e1"), await episode("e2"), await episode("e3")]);
    const rows = inspect(p, "private_school");
    expect(rows.length).toBeGreaterThan(0);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].adjustment).toBeGreaterThanOrEqual(rows[i].adjustment);
    expect(rows.every((r) => typeof r.active === "boolean")).toBe(true);
  });

  it("resets one context without touching another", async () => {
    let p = emptyPolicy();
    p = updateFromEpisode(p, await episode("e1", goal("private_school")));
    p = updateFromEpisode(p, await episode("e2", goal("sgija")));
    const cleared = reset(p, "private_school");
    expect(inspect(cleared, "private_school")).toHaveLength(0);
    expect(inspect(cleared, "sgija").length).toBeGreaterThan(0);
  });

  it("resets everything, keeping the configuration", async () => {
    // Resetting learning is not reconfiguring.
    const p = updateFromEpisode(emptyPolicy(), await episode("e1"));
    const cleared = reset(p);
    expect(cleared.contexts).toEqual({});
    expect(cleared.alpha).toBe(p.alpha);
    expect(cleared.minSupport).toBe(p.minSupport);
  });
});

describe("A-05 · a new action starts neutral, not condemned", () => {
  it("never scores a consistently succeeding action negative while it learns", async () => {
    // The cold-start bug, kept as a regression. Initialised at 0 — which in this utility scale
    // means "fails every time" — a perfect action scored negative for its first three observations,
    // and the variance from climbing out made it worse. Same rule as A-04: no evidence must never
    // wear the costume of bad evidence.
    let p = emptyPolicy();
    for (let i = 1; i <= 6; i++) {
      p = updateFromEpisode(p, await episode(`e${i}`));
      expect(policyAdjustment(p, "private_school", "create_track")).toBeGreaterThanOrEqual(0);
    }
  });

  it("puts an unobserved action exactly level with a disarmed policy", () => {
    const p = emptyPolicy();
    expect(policyAdjustment(p, "private_school", "revise")).toBe(0);
  });
});
