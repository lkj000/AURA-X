/**
 * A-07 — BUDGET AND SAFETY ENVELOPE
 *
 * No registered action is `paid` today, so the tests register one. That is deliberate: the control
 * has to be proven before the first expensive action exists, not after — which is the whole reason
 * A-06 is gated on this job.
 */
import {
  emptyLedger, record, countInWindow, checkBudget, budgetFromEnv, describeRefusal, type Budget,
} from "../agent/budget";
import { plan } from "../agent/planner";
import { ACTIONS, initialState, type ActionPorts, type AgentAction } from "../agent/actionRegistry";
import type { AgentGoal } from "../agent/goal";
import type { CTLv1 } from "@aura-x/ctl";

const CTL = { meta: { title: "t" } } as unknown as CTLv1;
const goal = (): AgentGoal => ({
  constraints: { title: "Ke Star", subgenre: "private_school", created_by: "u1" },
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

/**
 * A paid route to a CTL.
 *
 * `prior` is 1.0 and it still loses to the free and compute routes on score, because a paid action
 * carries a cost penalty of 4 — which is the scoring working as intended. So the tests that need it
 * chosen give it a set where it is the only synthesis route, rather than tilting the prior until
 * cost stops mattering.
 */
const PAID_SYNTH: AgentAction = {
  id: "synthesize_ctl_vendor",
  title: "Synthesise via a paid vendor",
  cost: "paid",
  prior: 1.0,
  effects: ["ctl", "ctlSource"],
  precondition: (s) => !!s.trackId && !s.ctl,
  run: async () => ({ ok: true, patch: { ctl: CTL, ctlSource: "remote" as const }, note: "vendor" }),
};
const WITH_PAID = [...ACTIONS, PAID_SYNTH];
/** Sets where the paid route is the ONLY way to a CTL. */
const PAID_ONLY_SYNTH = [...ACTIONS.filter((a) => !a.id.startsWith("synthesize_")), PAID_SYNTH];

const entry = (at: number, cost: "free" | "compute" | "paid") =>
  ({ at, actionId: "a", cost, unitCost: null });

describe("A-07 · with no budget configured, paid actions refuse rather than proceed", () => {
  it("refuses a paid action and names why", () => {
    const v = checkBudget(null, "paid", emptyLedger(), emptyLedger(), 0);
    expect(v.allowed).toBe(false);
    if (!v.allowed) {
      expect(v.scope).toBe("unbudgeted");
      expect(v.limit).toBeNull();
      expect(describeRefusal(v)).toContain("no budget is configured");
    }
  });

  it("still allows free and compute, which bill nobody", () => {
    expect(checkBudget(null, "free", emptyLedger(), emptyLedger(), 0).allowed).toBe(true);
    expect(checkBudget(null, "compute", emptyLedger(), emptyLedger(), 0).allowed).toBe(true);
  });

  it("routes around the paid action and still meets the goal", async () => {
    // Absence is not permission — but it is also not a dead end where an alternative exists.
    const r = await plan(goal(), ports(), { actions: WITH_PAID });
    expect(r.decisions.map((d) => d.chosen)).not.toContain("synthesize_ctl_vendor");
    expect(r.conclusion.outcome).toBe("met");
    expect(r.spend.counts.paid).toBe(0);
  });
});

describe("A-07 · every paid action is checked before invocation", () => {
  it("never invokes the paid route when it is unaffordable", async () => {
    let invoked = false;
    const spy: AgentAction = { ...PAID_SYNTH, run: async () => { invoked = true; return { ok: true, patch: { ctl: CTL }, note: "" }; } };
    await plan(goal(), ports(), {
      actions: [...ACTIONS.filter((a) => !a.id.startsWith("synthesize_")), spy],
      budget: { perRun: { paid: 0 } },
    });
    // After the call the money is spent whatever a check says, so "before" is the only useful time.
    expect(invoked).toBe(false);
  });

  it("invokes it when the budget allows", async () => {
    const r = await plan(goal(), ports(), { actions: PAID_ONLY_SYNTH, budget: { perRun: { paid: 1 } } });
    expect(r.decisions.map((d) => d.chosen)).toContain("synthesize_ctl_vendor");
    expect(r.spend.counts.paid).toBe(1);
  });
});

describe("A-07 · exceeding a ceiling refuses and names the ceiling", () => {
  const budget: Budget = { perRun: { paid: 2 } };

  it("names the run ceiling", () => {
    let l = emptyLedger();
    l = record(l, entry(0, "paid"));
    l = record(l, entry(1, "paid"));
    const v = checkBudget(budget, "paid", l, l, 2);
    expect(v.allowed).toBe(false);
    if (!v.allowed) {
      expect(v.scope).toBe("run");
      expect(v.limit).toBe(2);
      expect(v.reason).toContain("ceiling of 2");
    }
  });

  it("names the window ceiling and counts only inside the window", () => {
    const windowed: Budget = { perRun: {}, perWindow: { windowMs: 1000, limits: { paid: 1 } } };
    let l = emptyLedger();
    l = record(l, entry(0, "paid"));
    expect(checkBudget(windowed, "paid", emptyLedger(), l, 500).allowed).toBe(false);
    // Same spend, later — outside the window, so it no longer counts.
    expect(checkBudget(windowed, "paid", emptyLedger(), l, 5000).allowed).toBe(true);
  });

  it("stops the run and says it was cost, not effort", async () => {
    // Different remedies: this one wants a bigger budget or a cheaper route, not more iterations.
    const r = await plan(goal(), ports(), { actions: PAID_ONLY_SYNTH, budget: { perRun: { paid: 0 } } });
    expect(r.conclusion.outcome).toBe("budget_exhausted");
    if (r.conclusion.outcome === "budget_exhausted") expect(r.conclusion.reason).toContain("ceiling of 0");
  });

  it("puts the refusal in the trace beside the action it stopped", async () => {
    const r = await plan(goal(), ports(), { actions: PAID_ONLY_SYNTH, budget: { perRun: { paid: 0 } } });
    expect(r.log.join("\n")).toContain("create_track");
    expect(r.conclusion.outcome).toBe("budget_exhausted");
  });
});

describe("A-07 · spend is recorded per action and per run", () => {
  it("records an entry for every chargeable action taken", async () => {
    const r = await plan(goal(), ports());
    expect(r.spend.entries.length).toBe(r.decisions.length);
    expect(r.spend.counts.compute).toBeGreaterThan(0);
    expect(r.spend.entries.every((e) => e.unitCost === null)).toBe(true);
  });

  it("records a failed action's spend too", async () => {
    // A vendor call that failed was still a vendor call. A ledger counting only successes
    // under-reports exactly when things are going wrong.
    const r = await plan(goal(), ports({ synthesizeRemote: async () => { throw new Error("down"); } }));
    const failed = r.decisions.find((d) => !d.ok)!;
    expect(r.spend.entries.some((e) => e.actionId === failed.chosen)).toBe(true);
  });

  it("carries prior spend into the window check", async () => {
    const windowed: Budget = { perRun: {}, perWindow: { windowMs: 1_000_000, limits: { paid: 1 } } };
    let prior = emptyLedger();
    prior = record(prior, entry(1, "paid"));
    const r = await plan(goal(), ports(), {
      actions: WITH_PAID, budget: windowed, priorSpend: prior, now: () => 2,
    });
    expect(r.decisions.map((d) => d.chosen)).not.toContain("synthesize_ctl_vendor");
  });

  it("counts a trailing window correctly", () => {
    let l = emptyLedger();
    l = record(l, entry(0, "paid"));
    l = record(l, entry(900, "paid"));
    expect(countInWindow(l, "paid", 1000, 500)).toBe(1);
    expect(countInWindow(l, "paid", 1000, 2000)).toBe(2);
  });
});

describe("A-07 · a budget cannot be raised by the loop itself", () => {
  it("exposes no operation that raises one", () => {
    // Enforced by absence: a setter the loop merely promises not to call is not a control.
    const api = require("../agent/budget");
    const raising = Object.keys(api).filter((k) => /raise|increase|extend|grant|topUp/i.test(k));
    expect(raising).toEqual([]);
  });

  it("leaves the budget it was given unchanged across a run", async () => {
    const budget: Budget = { perRun: { paid: 1 } };
    const snapshot = JSON.stringify(budget);
    await plan(goal(), ports(), { actions: WITH_PAID, budget });
    expect(JSON.stringify(budget)).toBe(snapshot);
  });
});

describe("A-07 · configuration fails closed", () => {
  it("returns null when nothing is configured, which blocks paid actions", () => {
    expect(budgetFromEnv({})).toBeNull();
  });

  it("treats an unparseable ceiling as absent rather than infinite", () => {
    // A typo must not be the thing that authorises spending.
    expect(budgetFromEnv({ AGENT_BUDGET_PAID_PER_RUN: "lots" })).toBeNull();
    expect(budgetFromEnv({ AGENT_BUDGET_PAID_PER_RUN: "-3" })).toBeNull();
  });

  it("reads run and window ceilings when they are given", () => {
    const b = budgetFromEnv({
      AGENT_BUDGET_PAID_PER_RUN: "4",
      AGENT_BUDGET_PAID_PER_WINDOW: "20",
      AGENT_BUDGET_WINDOW_MS: "3600000",
    })!;
    expect(b.perRun.paid).toBe(4);
    expect(b.perWindow).toEqual({ windowMs: 3_600_000, limits: { paid: 20 } });
  });

  it("ignores a window ceiling with no window to measure it over", () => {
    const b = budgetFromEnv({ AGENT_BUDGET_PAID_PER_RUN: "4", AGENT_BUDGET_PAID_PER_WINDOW: "20" })!;
    expect(b.perWindow).toBeUndefined();
  });

  it("meters invocations, not currency, and says so on the ledger", () => {
    // A currency ceiling would be enforced against a price no action can declare.
    let l = emptyLedger();
    l = record(l, entry(0, "paid"));
    expect(l.counts.paid).toBe(1);
    expect(l.entries[0].unitCost).toBeNull();
  });
});
