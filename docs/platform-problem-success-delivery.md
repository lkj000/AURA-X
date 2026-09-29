# AURA-X: problem, success and delivery contract

Updated September 29, 2026. This is the product definition and delivery order for **this repository** —
`GitHub/AURA-X`: Express API, Python/FastAPI audio service, `packages/ctl` CTL_v1, Supabase (eu-west-2),
Railway. It is not a claim that the platform is complete. Companion of the same shape:
`nexus/docs/nexus-problem-success-delivery-contract.md`.

## Core problem

An amapiano producer has an idea and must coordinate disconnected things to get it out: generators that
take a prompt and return audio nobody can edit, recordings, MIDI, samples, a DAW, plugins, processing
services, feedback and release tools. The musical intent is re-entered at every boundary, files lose
the reason they exist, results are hard to revise without starting again, and automation can spend
money or change work without a dependable result.

The costs are specific to this genre and this workflow. A log drum that is nearly right cannot be
nudged — it can only be regenerated, and the next generation is different in ways nobody asked for. A
groove that works is a rendered file, not a description, so it cannot be reused at a different tempo or
in a different key. And a producer who wants an assistant to do the tedious parts has to accept an
agent that may act on a stale plan, spend without a ceiling, or report success it cannot substantiate.

AURA-X should reduce those costs while leaving musical control with the producer.

Primary user: an **independent amapiano producer** moving from a musical idea to an editable, finished
track. Amapiano is the specialisation on purpose, not a placeholder — `packages/ac-ami` and the CTL_v1
block vocabulary encode genre structure, and a genre-agnostic first version would have encoded nothing.
Broader creators and general workspace automation can follow the same architecture; amapiano is the
first complete workflow to prove.

## Product promise

AURA-X is a music-production platform whose intent layer is **CTL_v1** — a typed, validated description
of a track that generation, audio processing, the DJ engine and the agent all read from and write to.
One declaration, many consumers. On top of it sits an agent that can select an action, plan, remember
what happened, learn from outcomes, run unattended under a budget, and say why it chose what it chose
and what it cannot know.

"Platform" means a coordinated production workspace with a shared intent schema and an accountable
agent.

**It does not mean, and these are not current capabilities:**

- **A mature DAW.** Phase 10 is in progress: D-01 through D-12 are all *In Progress*; D-13 (third-party
  plugin hosting) and D-14 (AURA-X as a plugin) are *Not started*.
- **An autonomous agent running in production.** Phase 09 is complete, and autonomy is **unarmed** —
  `AGENT_AUTONOMY=true` plus a budget from A-07 are both required and **neither is set**.
- **Plugin support in a browser.** VST3 and AU are native binaries with host APIs a browser cannot
  satisfy. This is physics, not roadmap.
- **Reliable live monitoring through browser effects.** Round-trip latency is worse than native and is
  not fixable in software. Overdubbing to a click works.
- **A replacement for FL Studio.** The desktop bridge is a separate track, and what FL Studio exposes is
  currently **believed, not confirmed** (see the delivery queue, D-12).

## Pain points and measurable outcomes

| Pain | Required outcome | Evidence |
|---|---|---|
| Musical intent re-entered at every tool boundary | One typed intent record every consumer reads — generation, audio, DJ engine, agent | `packages/ctl` CTL_v1 (Zod, 13 blocks, 12 tests, Job 02); AC-AMI translation (Job 04, 16 tests) |
| A generation that is nearly right can only be regenerated | Revise a part without regenerating the whole; preserve what was already accepted | **Partly met and unproven at song scale.** Phase 03–04 complete; the editable-arrangement half is Phase 10 (D-03, D-04, D-09), all *In Progress* |
| A groove that works is a file, not a description | Grooves are structured and reusable at another tempo or key | `packages/ac-ami`; Phase 06 Amapianorize complete. **Reuse across tempo/key is asserted by the schema, not demonstrated by a producer walk** |
| An agent acting on a stale plan | Preconditions evaluated against the state the action will run in, not a global snapshot | A-03. **A real defect found and fixed there:** `rank()` evaluated preconditions over the global state, so a correctly-declared action could be invisible. Every A-03 test removes actions |
| An agent that spends without a ceiling | Refuse before spending, not after; a budget is a precondition of autonomy | A-07 built **before** A-06, deliberately — "autonomy without a budget is an incident". 20 tests on the supervisor |
| An agent that reports success it cannot substantiate | Say why it chose, and say what cannot be known | A-09. **Unarmed, so untested against real unattended runs** |
| Two control surfaces that drift | The agent's action space and the DAW's control surface are **one** declaration | D-10 device control contract — *In Progress*. Until it lands, a declared range in the UI and a declared range for the agent can disagree |
| Lost work and confusing save state | Distinguish current, local and cloud revisions; recover after interruption | D-02 project model and persistence — *In Progress*. **No acceptance gate passed** |
| Paid generation that cannot be reconciled | Quote, cap, record and reconcile every paid call | Mode 2 (Replicate/MusicGen) exists; Mode 3 (Suno API) is **reserved behind a config switch, zero code change**. Reconciliation is **not evidenced** |
| Audio quality asserted rather than measured | Blind, level-matched producer comparison | **Not established.** No listening protocol is recorded in this repository |

## What success looks like

The first end-to-end release gate is **one real amapiano track**, not a phase count:

1. State the musical intent as CTL_v1 — key, tempo, structure, groove — and validate it.
2. Generate or import licensed source material through an active mode.
3. Arrange and edit to the full intended duration, with the log drum, bass and percussion editable as
   notes and stems rather than as a rendered mixdown.
4. Direct the agent to make a bounded change. **Review its plan and its cost before it runs**, execute,
   audition, and undo it.
5. Save and reopen with equivalent intent, sources, settings and rendered output. Survive a forced
   interruption without losing the last confirmed save.
6. Mix and compare finishing candidates by independent measurement **and** blind level-matched
   listening.
7. Export the mix, stems, MIDI and a portable project, and verify duration, alignment and content on
   reimport.

General release criteria: zero known critical defects in data loss, ownership or duplicate charge; every
enabled paid adapter has verified admission **and** reconciliation; autonomy armed only with a budget in
force and a recorded decision to arm it; and an explicit, tested browser and DAW compatibility matrix.
**Audio quality must be measured through blind, level-matched producer comparison — never asserted from
a model name, a phase marker or a feature list.**

Measure: task success rate · manual transfers per finished track · time from intent to accepted output ·
recovery success rate · cost per accepted result · agent plans accepted without revision. **Set
numerical targets after collecting a baseline.** There is no baseline: nothing has been walked end to
end as a single track.

Commercial completion additionally requires onboarding, account recovery, deployment monitoring,
support, retention and deletion controls, accessibility, billing operations, and release-partner
contracts. Native components additionally require host save/reopen, automation, routing, offline render,
crash isolation and signed installers.

## Sequential delivery queue

Each stage finishes its acceptance gate before the next production capability is enabled. Research and
unarmed scaffolding may proceed while external access is pending.

1. **Intent and foundation — ✓ complete.** Monorepo, CTL_v1, Supabase schema, ingestion. Phases 01–02.
2. **Generation — ✓ complete, one mode active.** Mode 1 Suno prompt export is active. Mode 2
   Replicate/MusicGen exists. Mode 3 Suno API is reserved behind a config switch. Phase 03.
3. **Audio production, DJ engine, Amapianorize — ✓ complete.** Phases 04–06.
4. **Agent loop and ML scaffold — ✓ complete.** Phases 07–08 (08 is explicitly *scaffold*).
5. **Platform integration — ✓ complete.** Phase I, I-01 to I-12.
6. **Agency — ✓ built, deliberately unarmed.** A-01 registry · A-02 goal model · A-03 planner ·
   A-04 episodic memory · A-05 policy learning · A-06 autonomy loop · A-07 budget envelope ·
   A-09 explanation. **Arming is a decision, not a build step:** `AGENT_AUTONOMY=true` and a budget,
   neither set. Arming it is a cold decision on its own — an agent that runs unattended and spends is
   not the tail of a phase completion.
7. **Browser DAW — in progress, no gate passed.** D-01 to D-12 all *In Progress*. The four constraints
   are physics and are designed around rather than solved: native plugins cannot load in a browser ·
   `SharedArrayBuffer` needs COOP/COEP across the whole origin and retrofitting means auditing every
   embed · round-trip latency is worse than native · the agent's action space and the DAW's control
   surface must stay one declaration (D-10).
8. **Desktop bridge — blocked on an unverified fact.** D-12 is scoped on the belief that FL Studio
   exposes MIDI in/out, controller scripting and file interchange, and **no general remote-control
   API**. That is *believed, not confirmed*. **Confirm against Image-Line's current documentation
   before scoping D-12 further** — the shape of the job depends on it, and it is the cheapest
   outstanding item in this document.
9. **Native components — not started.** D-13 third-party plugin hosting, D-14 AURA-X as a plugin.
   Separate deliverables, not stages of the browser DAW.
10. **Production acceptance.** The single-track gate above, the operational requirements, a published
    capability matrix, and the remaining limits disclosed.

## Where this actually stands

Nine phases are complete and **nothing has been walked end to end as one track.** Both halves are true
and either alone misleads.

Built: a typed intent schema every consumer reads · genre encoding in `ac-ami` · a generation pipeline
with one active mode and two held in reserve · audio production, a DJ engine and Amapianorize ·
platform integration · and a complete agency layer that selects, remembers, learns, budgets and
explains. 88 test files; 169 tests documented against individual jobs in `JOBS.md`. The A-03
precondition defect is the kind of finding that suggests the tests are doing work.

Not established: no single track has gone intent → arrangement → agent-assisted revision → save and
reopen → measured mix → export. Autonomy is unarmed and therefore untested in the only mode that
matters. The browser DAW has twelve jobs in progress and no acceptance gate passed. Paid-adapter
reconciliation is not evidenced. Audio quality has never been compared blind and level-matched, which
means quality claims currently rest on model and phase names — the one thing the success criteria above
forbid. And D-12's central premise about FL Studio is unconfirmed.

**No deadline or completion claim is justified until the single-track gate in §What success looks like
has been walked once, by a producer, and recorded — and until arming autonomy has been decided on its
own terms rather than inherited from a phase marker.**
