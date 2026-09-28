/**
 * A-02 — GOAL MODEL
 *
 * One test per success criterion, and the three-valued logic gets the most of them — it is the part
 * that is easy to write, easy to believe, and wrong in a way that only shows up on a run where the
 * evidence had not arrived yet.
 */
import {
  clausesFor,
  evaluateGoal,
  effortRemaining,
  describeConclusion,
  defaultGoal,
  type AgentGoal,
} from "../agent/goal";
import { initialState, type AgentState } from "../agent/actionRegistry";

const CONSTRAINTS = { title: "Ke Star", subgenre: "private_school", created_by: "u1" };

function goal(over: Partial<AgentGoal> = {}): AgentGoal {
  return {
    constraints: CONSTRAINTS,
    target: { minCompositeScore: 80, requireValidation: true },
    effort: { maxIterations: 6, maxActions: 20 },
    ...over,
  };
}

function state(over: Partial<AgentState> = {}): AgentState {
  return { ...initialState(), ...over };
}

describe("A-02 · a goal states a success predicate, not only a specification", () => {
  it("carries constraints, target and effort as separate things", () => {
    const g = goal();
    expect(g.constraints.subgenre).toBe("private_school");
    expect(g.target.minCompositeScore).toBe(80);
    expect(g.effort.maxIterations).toBe(6);
  });

  it("turns a target into clauses, and omitted fields into no clause at all", () => {
    expect(clausesFor({ minCompositeScore: 80, requireValidation: true }).map((c) => c.id))
      .toEqual(["composite_score", "validation"]);
    // Not a permissive clause — none. The agent was never asked about validation and must not
    // report having checked it.
    expect(clausesFor({ minCompositeScore: 80 }).map((c) => c.id)).toEqual(["composite_score"]);
    expect(clausesFor({})).toHaveLength(0);
  });
});

describe("A-02 · unknown is not failure", () => {
  it("reports an unevaluated score as unknown, never as not met", () => {
    const v = evaluateGoal(goal(), state());
    expect(v.unknown).toContain("composite_score");
    expect(v.fails).not.toContain("composite_score");
    expect(v.met).toBe(false);
    expect(v.settled).toBe(false);
  });

  it("distinguishes a run still gathering evidence from one that has failed", () => {
    const gathering = evaluateGoal(goal(), state());
    const failed    = evaluateGoal(goal(), state({ compositeScore: 41, validationPassed: false }));
    expect(gathering.settled).toBe(false);   // more evidence could still arrive
    expect(failed.settled).toBe(true);       // the evidence is in
    expect(gathering.met).toBe(false);
    expect(failed.met).toBe(false);
  });

  it("does not let an unknown clause satisfy a goal", () => {
    // The failure that would let a run report success before it had evaluated anything.
    const v = evaluateGoal(goal({ target: { minCompositeScore: 80 } }), state());
    expect(v.met).toBe(false);
  });

  it("says 'not yet established' rather than a verdict it has not earned", () => {
    const v = evaluateGoal(goal(), state());
    expect(v.report.some((l) => l.includes("not yet established"))).toBe(true);
  });

  it("treats a two-valued fact as two-valued", () => {
    // `stored` starts false and absence is not expressible, so inventing an unknown state for it
    // would be as wrong as denying one to the score.
    const v = evaluateGoal(goal({ target: { requireStored: true } }), state());
    expect(v.fails).toContain("stored");
    expect(v.unknown).toHaveLength(0);
  });
});

describe("A-02 · the predicate is evaluated against observed state", () => {
  it("holds once the evidence supports every clause", () => {
    const v = evaluateGoal(goal(), state({ compositeScore: 84, validationPassed: true }));
    expect(v.met).toBe(true);
    expect(v.fails).toHaveLength(0);
    expect(v.unknown).toHaveLength(0);
  });

  it("is met by a goal that asked for nothing", () => {
    // Deliberate: an unconstrained run must be able to finish. Stated so nobody "fixes" it.
    expect(evaluateGoal(goal({ target: {} }), state()).met).toBe(true);
  });
});

describe("A-02 · a run meeting its predicate early stops early", () => {
  it("is met at a score above target without exhausting the iteration budget", () => {
    const g = goal();
    const s = state({ compositeScore: 91, validationPassed: true, iterationsRun: 1 });
    expect(evaluateGoal(g, s).met).toBe(true);
    expect(effortRemaining(g, s, 4).exhausted).toBe(false);
  });
});

describe("A-02 · a run that cannot meet its goal reports which clause failed", () => {
  it("names the failing clauses rather than returning a bare status", () => {
    const v = evaluateGoal(goal(), state({ compositeScore: 52, validationPassed: true }));
    expect(v.fails).toEqual(["composite_score"]);
    expect(v.holds).toEqual(["validation"]);
    expect(describeConclusion({ outcome: "unsatisfiable", verdict: v }))
      .toContain("composite_score");
  });

  it("distinguishes the four ways a run can end", () => {
    const v = evaluateGoal(goal(), state({ compositeScore: 52 }));
    expect(describeConclusion({ outcome: "met", verdict: v })).toBe("Goal met.");
    expect(describeConclusion({ outcome: "effort_exhausted", verdict: v, bound: "maxIterations", limit: 6 }))
      .toContain("maxIterations bound of 6");
    expect(describeConclusion({ outcome: "no_action_available", verdict: v }))
      .toContain("No action could run");
    // "Ran out of budget short of target" and "succeeded" must not wear the same word.
    expect(describeConclusion({ outcome: "effort_exhausted", verdict: v, bound: "maxActions", limit: 20 }))
      .not.toContain("Goal met");
  });
});

describe("A-02 · the effort bound is expressed in the goal and honoured", () => {
  it("stops on the iteration bound and names it", () => {
    const r = effortRemaining(goal(), state({ iterationsRun: 6 }), 0);
    expect(r).toEqual({ exhausted: true, bound: "maxIterations", limit: 6 });
  });

  it("stops on the action bound and names it", () => {
    const r = effortRemaining(goal(), state(), 20);
    expect(r).toEqual({ exhausted: true, bound: "maxActions", limit: 20 });
  });

  it("reports the iteration bound first when both are reached", () => {
    // Deterministic reporting: two bounds reached at once must not produce a different answer on
    // different runs, or the trace stops being comparable.
    const r = effortRemaining(goal(), state({ iterationsRun: 9 }), 99);
    expect(r).toMatchObject({ bound: "maxIterations" });
  });

  it("keeps going while both bounds have room", () => {
    expect(effortRemaining(goal(), state({ iterationsRun: 2 }), 5)).toEqual({ exhausted: false });
  });
});

describe("A-02 · the default goal is explicit about being weak", () => {
  it("encodes exactly what the old procedure did", () => {
    const g = defaultGoal(CONSTRAINTS);
    expect(g.effort.maxIterations).toBe(3);
    expect(g.target.minCompositeScore).toBeUndefined();
    // No score target is the old behaviour. Naming it as a default puts the weakness at the call
    // site rather than leaving it implicit in a loop bound.
    expect(evaluateGoal(g, state({ validationPassed: true, stored: true })).met).toBe(true);
  });
});
