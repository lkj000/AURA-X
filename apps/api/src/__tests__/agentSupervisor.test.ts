/**
 * A-06 — AUTONOMY LOOP
 *
 * No real timers anywhere. The supervisor takes its clock and is stepped by hand, so every test is
 * deterministic and none leaves a background process behind.
 */
import { createSupervisor, backoffMultiplier, autonomyEnabled, type StandingObjective } from "../agent/supervisor";
import type { ActionPorts } from "../agent/actionRegistry";
import type { AgentGoal } from "../agent/goal";
import type { Budget } from "../agent/budget";
import type { CTLv1 } from "@aura-x/ctl";

const CTL = { meta: { title: "t" } } as unknown as CTLv1;
const BUDGET: Budget = { perRun: { paid: 0, compute: 20 } };

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

const objective = (over: Partial<StandingObjective> = {}): StandingObjective => ({
  id: "nightly", goal: goal(), minIntervalMs: 1000, enabled: true, ...over,
});

function harness(over: Partial<Parameters<typeof createSupervisor>[0]> = {}) {
  let clock = 0;
  const runs: string[] = [];
  const sup = createSupervisor({
    enabled: true,
    objectives: [objective()],
    budget: BUDGET,
    ports: ports(),
    now: () => clock,
    newRunId: (id, n) => `${id}-${n}`,
    onRun: (r) => { runs.push(r.runId); },
    ...over,
  });
  return { sup, runs, advance: (ms: number) => { clock += ms; }, at: () => clock };
}

describe("A-06 · a standing objective produces runs with no human request", () => {
  it("runs on the first tick and attributes the run to its objective", async () => {
    const { sup } = harness();
    sup.start();
    const run = await sup.tick();
    expect(run).not.toBeNull();
    expect(run!.objectiveId).toBe("nightly");
    expect(run!.runId).toBe("nightly-1");
    expect(run!.result.conclusion.outcome).toBe("met");
  });

  it("honours the cadence rather than running every tick", async () => {
    const { sup, advance } = harness();
    sup.start();
    expect(await sup.tick()).not.toBeNull();
    expect(await sup.tick()).toBeNull();     // too soon
    advance(1000);
    expect(await sup.tick()).not.toBeNull();
  });

  it("runs at most one objective per tick, so a tick is bounded", async () => {
    const { sup } = harness({ objectives: [objective({ id: "a" }), objective({ id: "b" })] });
    sup.start();
    const first = await sup.tick();
    const second = await sup.tick();
    expect([first!.objectiveId, second!.objectiveId].sort()).toEqual(["a", "b"]);
  });

  it("does not let a frequent objective starve a slower one", async () => {
    const { sup, advance } = harness({
      objectives: [objective({ id: "fast", minIntervalMs: 10 }), objective({ id: "slow", minIntervalMs: 10 })],
    });
    sup.start();
    await sup.tick();            // fast (or slow) first
    await sup.tick();            // the other — longest-waiting first
    advance(100);
    const third = await sup.tick();
    const fourth = await sup.tick();
    expect([third!.objectiveId, fourth!.objectiveId].sort()).toEqual(["fast", "slow"]);
  });

  it("skips a disabled objective and one that has hit its run cap", async () => {
    const { sup, advance } = harness({
      objectives: [objective({ id: "off", enabled: false }), objective({ id: "capped", maxRuns: 1 })],
    });
    sup.start();
    expect((await sup.tick())!.objectiveId).toBe("capped");
    advance(10_000);
    expect(await sup.tick()).toBeNull();
  });
});

describe("A-06 · the loop refuses to start without a budget", () => {
  it("refuses and names the reason", () => {
    const { sup } = harness({ budget: null });
    const r = sup.start();
    expect(r.started).toBe(false);
    if (!r.started) {
      expect(r.reason).toBe("NO_BUDGET");
      expect(r.detail).toContain("requires a budget");
    }
  });

  it("does nothing on tick when it refused to start", async () => {
    // A refusal that still ran would be a warning wearing a refusal's clothes.
    const { sup } = harness({ budget: null });
    sup.start();
    expect(await sup.tick()).toBeNull();
    expect(sup.status().runsCompleted).toBe(0);
  });

  it("refuses with nothing to pursue", () => {
    const { sup } = harness({ objectives: [] });
    const r = sup.start();
    expect(r.started).toBe(false);
    if (!r.started) expect(r.reason).toBe("NO_OBJECTIVES");
  });
});

describe("A-06 · the loop is off by default; arming is explicit and reversible", () => {
  it("does not run until started", async () => {
    const { sup } = harness();
    expect(await sup.tick()).toBeNull();
    expect(sup.status().running).toBe(false);
  });

  it("refuses to start when not armed", () => {
    const { sup } = harness({ enabled: false });
    const r = sup.start();
    expect(r.started).toBe(false);
    if (!r.started) expect(r.reason).toBe("DISABLED");
  });

  it("can be stopped and started again", async () => {
    const { sup, advance } = harness();
    sup.start();
    await sup.tick();
    sup.stop();
    advance(10_000);
    expect(await sup.tick()).toBeNull();
    expect(sup.start().started).toBe(true);
    expect(await sup.tick()).not.toBeNull();
  });

  it("reads its arming flag as exactly true", () => {
    expect(autonomyEnabled({})).toBe(false);
    expect(autonomyEnabled({ AGENT_AUTONOMY: "1" })).toBe(false);
    expect(autonomyEnabled({ AGENT_AUTONOMY: "true" })).toBe(true);
  });
});

describe("A-06 · stopping is immediate and leaves no run half-written", () => {
  it("ends the in-flight run at an action boundary rather than mid-action", async () => {
    let sup: ReturnType<typeof createSupervisor>;
    const h = harness({
      ports: ports({
        // Stop is requested from inside an action. The run must finish this action and then end.
        persistCtl: async () => { sup.stop(); return { ctlId: "ctl" }; },
      }),
    });
    sup = h.sup;
    sup.start();
    const run = await sup.tick();
    expect(run!.result.conclusion.outcome).toBe("stopped");
    // The action that was in flight completed and is on the record — nothing half-written.
    const persisted = run!.result.decisions.find((d) => d.chosen === "persist_ctl")!;
    expect(persisted.ok).toBe(true);
    expect(run!.result.state.ctlId).toBe("ctl");
    // And nothing after it was attempted.
    expect(run!.result.decisions.map((d) => d.chosen)).not.toContain("revise");
  });

  it("records a stop as neither success nor failure of the work", async () => {
    const { sup } = harness();
    sup.start();
    sup.stop();
    const status = sup.status();
    expect(status.running).toBe(false);
    expect(status.inFlight).toBeNull();
  });

  it("clears in-flight even when a port throws", async () => {
    const { sup } = harness({ ports: ports({ createTrack: async () => { throw new Error("db down"); } }) });
    sup.start();
    await sup.tick();
    // Otherwise the supervisor believes a run is going for ever and never reports itself idle.
    expect(sup.status().inFlight).toBeNull();
  });
});

describe("A-06 · a broken objective quiets down instead of spending for ever", () => {
  it("doubles the interval per consecutive unmet run, capped", () => {
    expect(backoffMultiplier(0)).toBe(1);
    expect(backoffMultiplier(1)).toBe(2);
    expect(backoffMultiplier(3)).toBe(8);
    expect(backoffMultiplier(10)).toBe(8);
  });

  it("waits longer after a run that did not meet its goal", async () => {
    const { sup, advance } = harness({
      objectives: [objective({ goal: { ...goal(), target: { minCompositeScore: 99 }, effort: { maxIterations: 2, maxActions: 9 } } })],
    });
    sup.start();
    const first = await sup.tick();
    expect(first!.result.conclusion.outcome).not.toBe("met");
    advance(1000);                      // would be due at the base cadence
    expect(await sup.tick()).toBeNull();
    advance(1000);                      // doubled
    expect(await sup.tick()).not.toBeNull();
  });

  it("resets the backoff after a run that met its goal", async () => {
    const { sup, advance } = harness();
    sup.start();
    await sup.tick();
    advance(1000);
    await sup.tick();
    expect(sup.status().objectives["nightly"].consecutiveUnmet).toBe(0);
  });
});

describe("A-06 · spend accumulates across runs", () => {
  it("carries a run's ledger into the next run's window check", async () => {
    const { sup, advance } = harness();
    sup.start();
    await sup.tick();
    const afterOne = sup.status().spend.counts.compute;
    advance(1000);
    await sup.tick();
    expect(sup.status().spend.counts.compute).toBeGreaterThan(afterOne);
  });

  it("reports every objective's state for inspection", async () => {
    const { sup } = harness();
    sup.start();
    await sup.tick();
    const st = sup.status().objectives["nightly"];
    expect(st.runs).toBe(1);
    expect(st.lastOutcome).toBe("met");
    expect(st.lastStartedAt).toBe(0);
  });
});
