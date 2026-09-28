/**
 * A-01 — ACTION REGISTRY
 *
 * One test per success criterion in JOBS.md, plus the refusal cases.
 *
 * No database, no audio service, no vendor account: the registry takes its capability through
 * ports, so the whole action set is exercised against a fake. That is the point of the port
 * boundary — a registry that could only be tested against Supabase would be tested rarely.
 */
import {
  ACTIONS,
  getAction,
  eligibleActions,
  executeAction,
  initialState,
  type AgentState,
  type ActionPorts,
} from "../agent/actionRegistry";
import type { CTLv1 } from "@aura-x/ctl";

const CTL = { meta: { title: "t" } } as unknown as CTLv1;

function ports(over: Partial<ActionPorts> = {}): ActionPorts {
  return {
    createTrack:      async () => ({ trackId: "trk_1" }),
    synthesizeRemote: async () => ({ ctl: CTL }),
    synthesizeLocal:  () => CTL,
    persistCtl:       async () => ({ ctlId: "ctl_1" }),
    revise:           async () => ({
      ctl: CTL, compositeScore: 81, validationPassed: true, iterationsRun: 2, mutationsApplied: 3,
    }),
    storeResult:      async () => undefined,
    ...over,
  };
}

/**
 * Drive the registry to completion by always taking the first eligible action.
 *
 * `max` is a runaway guard, not a schedule — it must never be the thing that ends the run. A test
 * that stops because its own loop ran out cannot tell a terminating action set from a
 * non-terminating one, which is exactly the defect this file found on its first execution.
 */
async function runToCompletion(
  p: ActionPorts,
  opts: { from?: AgentState; exclude?: readonly string[]; max?: number } = {},
): Promise<AgentState> {
  const { from = initialState(), exclude = [], max = 64 } = opts;
  let s = from;
  for (let i = 0; i < max; i++) {
    const next = eligibleActions(s).find((a) => !exclude.includes(a.id));
    if (!next) return s;
    ({ state: s } = await executeAction(next.id, s, p));
  }
  throw new Error("driver hit its runaway guard — the action set did not terminate");
}

describe("A-01 · every action runAgent performs is registered", () => {
  it("registers the six steps the procedure performs", () => {
    expect(ACTIONS.map((a) => a.id).sort()).toEqual([
      "create_track",
      "persist_ctl",
      "revise",
      "store_result",
      "synthesize_ctl_local",
      "synthesize_ctl_remote",
    ]);
  });

  it("reaches a stored result from an empty state using only the registry", async () => {
    const s = await runToCompletion(ports());
    expect(s.trackId).toBe("trk_1");
    expect(s.ctlId).toBe("ctl_1");
    expect(s.compositeScore).toBe(81);
    expect(s.stored).toBe(true);
  });
});

describe("A-01 · each entry declares preconditions, effects and cost class", () => {
  it.each(ACTIONS.map((a) => [a.id, a] as const))("%s is fully declared", (_id, a) => {
    expect(typeof a.precondition).toBe("function");
    expect(a.effects.length).toBeGreaterThan(0);
    expect(["free", "compute", "paid"]).toContain(a.cost);
  });

  it("declares effects that the action actually establishes", async () => {
    // Guards the failure mode where `effects` drifts from `run` — a planner scoring on a stale
    // declaration would choose an action that cannot move it toward the goal.
    let s = initialState();
    const p = ports();
    for (let i = 0; i < 12; i++) {
      const [next] = eligibleActions(s);
      if (!next) break;
      const before = s;
      const { outcome, state } = await executeAction(next.id, s, p);
      if (outcome.ok) {
        for (const key of Object.keys(outcome.patch) as (keyof AgentState)[]) {
          if (before[key] !== state[key]) expect(next.effects).toContain(key);
        }
      }
      s = state;
    }
  });
});

describe("A-01 · the registry is the single source of the action set", () => {
  it("resolves every id through the registry and nothing else", () => {
    for (const a of ACTIONS) expect(getAction(a.id)).toBe(a);
  });

  it("refuses an id it does not hold", async () => {
    const { outcome, state } = await executeAction("teleport", initialState(), ports());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toBe("UNKNOWN_ACTION");
    expect(state).toEqual(initialState());
  });

  it("is frozen, so no caller can extend it at runtime", () => {
    expect(Object.isFrozen(ACTIONS)).toBe(true);
  });
});

describe("A-01 · an action whose preconditions are unmet cannot execute, and says so", () => {
  it("refuses persist_ctl before a CTL exists, and changes nothing", async () => {
    const s = initialState();
    const { outcome, state } = await executeAction("persist_ctl", s, ports());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toBe("PRECONDITION_UNMET");
    expect(state).toEqual(s);
  });

  it("does not offer create_track once a track exists", () => {
    const ids = eligibleActions({ ...initialState(), trackId: "trk_1" }).map((a) => a.id);
    expect(ids).not.toContain("create_track");
  });

  it("distinguishes an ineligible choice from a failed one", async () => {
    // Different mistakes: one is the planner's, one is evidence about the capability. Only the
    // second should count against the action.
    const s = { ...initialState(), trackId: "trk_1" };
    const threw = await executeAction("synthesize_ctl_remote", s, ports({
      synthesizeRemote: async () => { throw new Error("audio service unreachable"); },
    }));
    expect(threw.outcome.ok).toBe(false);
    if (!threw.outcome.ok) expect(threw.outcome.error).toBe("ACTION_THREW");
    expect(threw.state.failures["synthesize_ctl_remote"]).toBe(1);

    const unmet = await executeAction("revise", s, ports());
    expect(unmet.state.failures["revise"]).toBeUndefined();
  });
});

describe("A-01 · two actions share one effect, so a fallback is a choice", () => {
  it("offers both synthesis routes when neither has run", () => {
    const ids = eligibleActions({ ...initialState(), trackId: "trk_1" }).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(["synthesize_ctl_remote", "synthesize_ctl_local"]));
  });

  it("reaches a stored result via the local route when the remote one throws", async () => {
    // The criterion A-03 will have to demonstrate, available already because the alternative is
    // registered rather than buried in a catch block.
    let s: AgentState = { ...initialState(), trackId: "trk_1" };
    const p = ports({ synthesizeRemote: async () => { throw new Error("down"); } });

    ({ state: s } = await executeAction("synthesize_ctl_remote", s, p));
    expect(s.ctl).toBeUndefined();

    ({ state: s } = await executeAction("synthesize_ctl_local", s, p));
    expect(s.ctlSource).toBe("local");

    s = await runToCompletion(p, { from: s, exclude: ["synthesize_ctl_remote"] });
    expect(s.stored).toBe(true);
  });

  it("charges the two routes differently, so cost can decide between them", () => {
    expect(getAction("synthesize_ctl_remote")!.cost).toBe("compute");
    expect(getAction("synthesize_ctl_local")!.cost).toBe("free");
  });
});

describe("A-01 · effort accumulates rather than resetting", () => {
  it("adds a second revision's iterations to the first", async () => {
    let s: AgentState = { ...initialState(), trackId: "t", ctl: CTL, ctlId: "c" };
    const p = ports();
    ({ state: s } = await executeAction("revise", s, p));
    expect(s.iterationsRun).toBe(2);
    ({ state: s } = await executeAction("revise", s, p));
    expect(s.iterationsRun).toBe(4);
    expect(s.mutationsApplied).toBe(6);
  });
});

describe("A-01 · not-yet-evaluated is not zero", () => {
  it("leaves compositeScore undefined until an evaluation happens", () => {
    // A score of 0 is a claim about the music. Absent is a claim about the run.
    expect(initialState().compositeScore).toBeUndefined();
    expect(eligibleActions(initialState()).map((a) => a.id)).not.toContain("store_result");
  });
});

describe("A-01 · no action is eligible for ever", () => {
  it("stops offering revise once the ceiling is reached", () => {
    const { REVISION_CEILING } = require("../agent/actionRegistry");
    const at = { ...initialState(), ctl: CTL, ctlId: "c", iterationsRun: REVISION_CEILING };
    expect(eligibleActions(at).map((a) => a.id)).not.toContain("revise");
  });

  it("terminates from an empty state under a driver that always takes the first eligible action", async () => {
    // The property the first draft lacked. A registry whose action set does not terminate cannot be
    // planned over, whatever the planner does — found by this test, not by reading the code.
    let s = initialState();
    const p = ports();
    let steps = 0;
    while (steps < 64) {
      const [next] = eligibleActions(s);
      if (!next) break;
      ({ state: s } = await executeAction(next.id, s, p));
      steps++;
    }
    expect(eligibleActions(s)).toHaveLength(0);
    expect(s.stored).toBe(true);
  });
});
