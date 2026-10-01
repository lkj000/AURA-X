# Temporal is already integrated here, and nothing runs it

**Found 1 October 2026**, while assessing whether to adopt Temporal. The assessment answered a
different question than the one asked.

## What exists

| | |
|---|---|
| Dependencies | `@temporalio/activity` · `client` · `worker` · `workflow`, all `^1.16.0`, in `apps/api/package.json` |
| Client | `apps/api/src/temporal/client.ts` |
| Worker | `apps/api/src/temporal/worker.ts` |
| Workflows | `workflows/datasetIngestion.ts` · `workflows/autonomousGeneration.ts` (real retry policies — `maximumAttempts: 3`, `initialInterval: "5s"`) |
| Activities | `activities/agentActivities.ts` · `activities/datasetActivities.ts` |
| Tests | `__tests__/temporal.test.ts` |
| Env | `TEMPORAL_ADDRESS` · `TEMPORAL_NAMESPACE` · `TEMPORAL_TASK_QUEUE` · `TEMPORAL_AGENT_TASK_QUEUE` · **`TEMPORAL_TLS_CERT`** · **`TEMPORAL_TLS_KEY`** |

The TLS client cert and key are the detail that matters: that is how Temporal **Cloud** authenticates.
This was not scaffolded for a local dev server. Somebody intended a Cloud namespace.

## What runs

**Nothing.**

- `worker.ts` exports factories that **`return worker`**. Neither calls `.run()`, and nothing in the
  repository invokes either factory.
- `apps/api/package.json` scripts are `dev`, `build`, `start`, `test`. **There is no worker script.**
- `railway.json` has one `startCommand`: `node apps/api/dist/index.js` — the API. A Temporal worker is
  a separate long-running process. There is no second service.
- `apps/api/src/index.ts` does not import the worker.

So the workflows have never executed. A workflow with no worker is not a slow workflow; it is a queued
task nobody is listening for.

## And the agent was built around it

`apps/api/src/routes/agent.ts:97`:

> `// POST /api/agent/run — FULL AUTONOMOUS AGENT (in-process, no Temporal dependency)`

It returns a `workflowId` and is polled at `GET /api/agent/workflow/:workflowId` — **Temporal's
vocabulary, Temporal's shape, none of Temporal's guarantees.** The autonomous agent runs in the API
process, so a Railway restart or deploy mid-run loses it, which is the exact failure durable execution
exists to prevent.

That is not a criticism of the decision — routing around a dependency that does not run is correct.
It is a criticism of leaving both in place, because the result reads as a working integration from
every angle a reader would check: the dependency list, the directory, the tests, the `workflowId`
vocabulary in the live route.

## This is a shape, not an incident

The sibling repository has a catalogue of the same thing, and it is worth naming so this is recognised
rather than re-derived:

- `RepatriationPolicy.administratorOrgId` — a column, a relation, documented as how an administrator
  gains access, **null on every row** because nothing populates it.
- `BANK_TRANSFER` withdrawals — `mock_wire_*` unconditionally, with a comment in the future tense
  *"live mode would route to the appropriate rail"* doing duty as an implementation.
- `api.okovanggo.ai` — a CNAME planned in a job checklist, never created.
- Temporal here.

**The common property is that each one is indistinguishable from a working feature until something
depends on it.** None fails loudly. All four were found by someone looking, and three of the four were
found this week.

## The decision owed: arm it or remove it

**Arming is a deploy change, not a flag.** A second Railway service with its own start command running
a worker that actually calls `.run()`, plus a Cloud namespace, plus the TLS pair in variables. Then
`/api/agent/run` can hand off to `autonomousGeneration` and survive a restart — which for a paid
model-and-render pipeline is a real gain, not a theoretical one.

**Removing is four dependencies, one directory and one test file**, and it makes the repository tell
the truth about itself.

**Either is better than today.** What must not happen is adopting *more* Temporal — the AI-agent
integrations, the MCP server, the developer skill — on top of an integration that has never executed a
workflow. That compounds the exact confusion this note exists to end.

## Order, if arming

1. Confirm whether a Temporal Cloud namespace exists and whether those six variables are set on
   Railway. **Not checkable from the repository** — the account is the authority, and the pasted Cloud
   console showed `Version: local`, which suggests a local server rather than a Cloud namespace.
2. Add the worker as a second Railway service with its own start command.
3. Prove one workflow end to end — `datasetIngestion` is the safer first walk than
   `autonomousGeneration`, because it spends nothing.
4. Only then point `/api/agent/run` at it, and delete the in-process path rather than leaving both.
