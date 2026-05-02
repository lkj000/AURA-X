AURA X — JOB REGISTRY
═══════════════════════════════════════════════════════════
All jobs documented with Problem Definition, Solution, and
Success Criteria. New jobs: copy JOB_TEMPLATE.md, fill in,
append here, commit.
═══════════════════════════════════════════════════════════


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 01 — FOUNDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


JOB 01 — MONOREPO SCAFFOLD
─────────────────────────────────────────
Phase:  Phase 01 — Foundation
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → No project structure exists. Two services (API, audio) share
    packages but have no common home — every developer sets up
    their own layout.
Who experiences this problem?
  → Every engineer on the project from day one.
What happens today without this solution?
  → Dependency versions diverge, port assignments drift, and
    there is no single install command — the project can't be
    reliably reproduced.

SOLUTION
What are we building?
  → A pnpm monorepo with apps/api (TypeScript/Express, port 3002),
    apps/audio (Python/FastAPI, port 8000), and a packages/ directory
    for shared modules.
How does it solve the problem?
  → Single root pnpm install resolves all dependencies. Port
    assignments are locked in config. All services start from one
    place.
Why this approach and not another?
  → pnpm workspaces enforce internal package linking without
    publishing; faster than npm on Windows and native to the
    Node ecosystem we're building in.

SUCCESS CRITERIA
  [x] pnpm install from root completes without error
  [x] apps/api responds 200 on GET /health at port 3002
  [x] apps/audio responds 200 on GET /health at port 8000


─────────────────────────────────────────


JOB 02 — CTL_V1 SCHEMA
─────────────────────────────────────────
Phase:  Phase 01 — Foundation
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → No shared language exists between agents, services, and
    planners. Every service would invent its own track
    representation.
Who experiences this problem?
  → Every agent and service that needs to describe or pass a
    track — all of them.
What happens today without this solution?
  → Impossible to validate, mutate, or safely pass track data
    between the API, audio service, and generation agents.
    Integration is manual guesswork.

SOLUTION
What are we building?
  → CTL_v1 (Creative Track Language) — a Zod schema with 13 blocks
    covering all musical and production dimensions of a track.
How does it solve the problem?
  → Single source of truth every agent reads and writes. Zod
    gives runtime validation and TypeScript type inference from
    the same definition. All other jobs depend on it.
Why this approach and not another?
  → Zod over JSON Schema: runtime validation + inferred types in
    one step. 13 blocks over a flat struct: compositional — each
    planner only touches its own block.

SUCCESS CRITERIA
  [x] Schema exports cleanly from packages/ctl
  [x] All 13 blocks validate correct input and reject invalid input
  [x] 12 tests pass


─────────────────────────────────────────


JOB 03 — SUPABASE SCHEMA
─────────────────────────────────────────
Phase:  Phase 01 — Foundation
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → No persistence layer. Audio files, track metadata, generation
    results, and evaluations have nowhere to live.
Who experiences this problem?
  → Every job after Job 01 — nothing can be stored or retrieved.
What happens today without this solution?
  → Downstream jobs each invent their own tables, producing
    conflicting schemas and broken foreign key relationships.

SOLUTION
What are we building?
  → 6 Supabase tables (tracks, generations, evaluations,
    dataset_records, queue_jobs, agent_logs) and a storage bucket
    in eu-west-2.
How does it solve the problem?
  → Structured schema up front means every downstream job writes
    to known tables with enforced foreign key integrity.
Why this approach and not another?
  → Supabase over raw Postgres: managed hosting, built-in storage,
    and row-level security without ops overhead. eu-west-2 for
    GDPR proximity to our primary users.

SUCCESS CRITERIA
  [x] All 6 tables exist with correct columns and types
  [x] Storage bucket created and accessible
  [x] Migrations run clean with no constraint errors


─────────────────────────────────────────


JOB 04 — MODE 1 SUNO EXPORTER
─────────────────────────────────────────
Phase:  Phase 01 — Foundation
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → CTL blocks are machine-readable structs. Suno requires a
    specific style tag and lyric prompt format. No translation
    exists.
Who experiences this problem?
  → The generation pipeline — Mode 1 can't start without it.
What happens today without this solution?
  → CTL is generated but can't be consumed by Suno. Mode 1
    is dead.

SOLUTION
What are we building?
  → An AC-AMI translator that converts CTL_v1 → Suno-compatible
    style string and lyric prompt bundle.
How does it solve the problem?
  → Producer can take the exported bundle and paste it directly
    into Suno. Mode 1 generation lifecycle begins.
Why this approach and not another?
  → Mode 1 first because it requires no GPU, no Replicate account,
    and no additional infrastructure — fastest path to hearing
    generated audio.

SUCCESS CRITERIA
  [x] Given a valid CTL, exporter returns a Suno-ready bundle
  [x] Style string reflects subgenre, BPM, key, and energy correctly
  [x] 16 tests pass


─────────────────────────────────────────


JOB 05 — AUDIO INGESTION
─────────────────────────────────────────
Phase:  Phase 01 — Foundation
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → No way to get audio files into the system. Producers generate
    audio externally and have no return path.
Who experiences this problem?
  → Producers using Mode 1, and every downstream processing job
    that needs stored audio.
What happens today without this solution?
  → Audio exists on the producer's machine but nowhere the pipeline
    can reach. No processing, no analysis, no evaluation can run.

SOLUTION
What are we building?
  → An upload endpoint that accepts audio files, stores them in
    Supabase Storage, and returns signed URLs.
How does it solve the problem?
  → Audio is now accessible to every downstream service via a
    durable signed URL. Foundation for all audio processing jobs.
Why this approach and not another?
  → Signed URLs over public URLs: they expire and don't expose
    the storage bucket — necessary for any future rights management.

SUCCESS CRITERIA
  [x] Upload endpoint accepts audio file and stores it
  [x] Signed URL returned and file retrievable via that URL
  [x] 10 tests pass


─────────────────────────────────────────


JOB 06 — BULLMQ QUEUE
─────────────────────────────────────────
Phase:  Phase 01 — Foundation
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → Audio processing and generation are long-running tasks. Running
    them inside HTTP request handlers causes timeouts and blocks
    the API.
Who experiences this problem?
  → API consumers — every request that triggers audio work hangs
    until the work completes.
What happens today without this solution?
  → Long-running jobs timeout or block. No retries. No visibility
    into job state. No way to handle failures gracefully.

SOLUTION
What are we building?
  → BullMQ with two queues: audio-processing and generation.
    Workers execute jobs independently of the request lifecycle.
How does it solve the problem?
  → API enqueues a job and returns immediately. Worker picks it up
    asynchronously. Status is queryable. Failures retry
    automatically.
Why this approach and not another?
  → BullMQ over raw queues: Redis-backed durability, built-in
    retry with backoff, dead-letter queues, and a UI — no custom
    queue infrastructure to maintain.

SUCCESS CRITERIA
  [x] Jobs enqueue from API endpoints and return job ID immediately
  [x] Workers pick up and process jobs independently
  [x] Failed jobs retry and land in dead-letter queue after max attempts
  [x] 8 tests pass


─────────────────────────────────────────


JOB 07 — CI/CD
─────────────────────────────────────────
Phase:  Phase 01 — Foundation
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → No automated pipeline validates changes before they ship.
    Every commit is a manual, untested integration risk.
Who experiences this problem?
  → Every developer — regressions are discovered in production,
    not at the PR gate.
What happens today without this solution?
  → Broken code merges freely. Docker builds are manual and
    untested. Deploys happen without knowing if tests pass.

SOLUTION
What are we building?
  → GitHub Actions 3-job pipeline (lint → test → build) and a
    Railway Dockerfile for production deployment.
How does it solve the problem?
  → Every push runs the pipeline. Failing tests block the merge.
    Docker image is built and validated before any deploy.
Why this approach and not another?
  → GitHub Actions: zero additional infrastructure, native to the
    repo. Railway: single Dockerfile deploy, no Kubernetes overhead
    for a monorepo at this stage.

SUCCESS CRITERIA
  [x] Pipeline runs green on push to main
  [x] Failing test blocks merge
  [x] Docker image builds and Railway deploy succeeds


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 02 — AC-AMI CORE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


JOB 08 — CTL PRESET LIBRARY
─────────────────────────────────────────
Phase:  Phase 02 — AC-AMI Core
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → Generating CTL from scratch requires deep musical expertise.
    Planners have nothing to start from.
Who experiences this problem?
  → The AC-AMI planners (Jobs 09–11) — they can't run without
    a seeded CTL.
What happens today without this solution?
  → Every generation starts from an empty schema. Planners
    produce generic output with no subgenre identity.

SOLUTION
What are we building?
  → A preset library with 8 subgenre presets (Piano Ballad,
    Soulful, Log Drum Heavy, etc.) that seed valid CTL instances.
How does it solve the problem?
  → Presets establish the genre envelope. Planners extend them
    rather than inventing from nothing. Each preset encodes a
    distinct sonic fingerprint.
Why this approach and not another?
  → Presets over procedural generation: deterministic, auditable,
    and fast. A human expert encoded each subgenre once — the
    system reuses that knowledge forever.

SUCCESS CRITERIA
  [x] All 8 presets load and validate against CTL_v1 schema
  [x] No two presets produce identical CTL output
  [x] 27 tests pass


─────────────────────────────────────────


JOB 09 — HARMONY PLANNER
─────────────────────────────────────────
Phase:  Phase 02 — AC-AMI Core
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → CTL harmony fields are empty after preset load. No system
    decides key, mode, or chord progression.
Who experiences this problem?
  → The generation agent — it can't produce harmonically coherent
    tracks without a populated harmony block.
What happens today without this solution?
  → Child tracks generated without lineage awareness clash
    harmonically with parent tracks. DJ mixing between related
    tracks produces dissonance.

SOLUTION
What are we building?
  → A lineage-aware harmony planner that selects key and mode,
    plans chord progressions, and respects harmonic distance
    from parent tracks.
How does it solve the problem?
  → Harmony block is fully populated before generation. Lineage
    constraint ensures child tracks stay within a defined harmonic
    distance of their parent.
Why this approach and not another?
  → Lineage awareness over random key selection: Amapiano sets
    are built in harmonic families. Making the agent respect this
    produces DJ-ready output from the start.

SUCCESS CRITERIA
  [x] Harmony block fully populated after planner runs
  [x] Lineage constraint honoured when parent CTL is provided
  [x] 18 tests pass


─────────────────────────────────────────


JOB 10 — GROOVE PLANNER
─────────────────────────────────────────
Phase:  Phase 02 — AC-AMI Core
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → CTL rhythm fields are static after preset load. No system
    assigns groove patterns or microtiming offsets.
Who experiences this problem?
  → The mixing and render pipeline — without microtiming data,
    audio sounds quantised and lifeless.
What happens today without this solution?
  → Generated tracks have the right BPM but none of Amapiano's
    groove feel. They pass a BPM test but fail the ear test.

SOLUTION
What are we building?
  → A groove planner with 13 Amapiano-specific patterns and
    per-pattern microtiming offset tables.
How does it solve the problem?
  → Assigns a groove template to CTL and populates microtiming
    deltas. Downstream audio processing reads these to inject
    the actual groove feel into the audio.
Why this approach and not another?
  → 13 discrete patterns over continuous parameters: each pattern
    is a named, auditioned groove template — not a random offset.
    Musical knowledge encoded once, reused by the machine.

SUCCESS CRITERIA
  [x] Groove block populated with pattern name, BPM, and microtiming values
  [x] All 13 patterns selectable and produce distinct microtiming profiles
  [x] 20 tests pass


─────────────────────────────────────────


JOB 11 — INSTRUMENTATION PLANNER
─────────────────────────────────────────
Phase:  Phase 02 — AC-AMI Core
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → CTL instrumentation fields are empty after preset load. No
    system decides which instruments or patch classes to use.
Who experiences this problem?
  → The generation agent — without instrumentation, Mode 2 prompts
    are generic and Mode 1 style strings are incomplete.
What happens today without this solution?
  → Generated tracks have no subgenre-appropriate sonic palette.
    A Log Drum Heavy track sounds the same as a Soulful piano track.

SOLUTION
What are we building?
  → An instrumentation planner that assigns patch classes (log drum,
    piano, bass, pads, percussion) based on subgenre and energy
    profile from CTL.
How does it solve the problem?
  → Instrumentation block is fully populated with subgenre-
    appropriate patch class assignments before generation runs.
Why this approach and not another?
  → Abstract patch classes over specific synth patches: classes
    are portable across Mode 1 (Suno tags) and Mode 2 (MusicGen
    prompts) without requiring mode-specific logic.

SUCCESS CRITERIA
  [x] Instrumentation block populated with patch class assignments
  [x] Assignments are subgenre-appropriate and vary meaningfully between presets
  [x] 18 tests pass


─────────────────────────────────────────


JOB 12 — VALIDATOR SUITE
─────────────────────────────────────────
Phase:  Phase 02 — AC-AMI Core
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → Planners can produce internally inconsistent CTL — a key that
    violates lineage, instrumentation that contradicts the style
    block, or a groove that mismatches the BPM.
Who experiences this problem?
  → The generation agent and the revision loop — invalid CTL
    produces incorrect prompts and wasted generation calls.
What happens today without this solution?
  → Invalid CTL reaches the generation backend silently. Bad
    generations have no clear cause. Debugging requires tracing
    back through every planner manually.

SOLUTION
What are we building?
  → A validator suite covering four dimensions: lineage consistency,
    style coherence, instrumentation rules, and harmony validity.
How does it solve the problem?
  → Returns a scored validation report that identifies exactly which
    dimensions are failing — not just that something is wrong.
    Gates generation behind a clean validation pass.
Why this approach and not another?
  → Scored report over binary pass/fail: the revision loop needs
    to know *which* dimension failed to apply the right mutation.
    Binary feedback forces blind retries.

SUCCESS CRITERIA
  [x] Invalid CTLs caught with specific error codes per dimension
  [x] Valid CTLs pass with zero false positives
  [x] 22 tests pass


─────────────────────────────────────────


JOB 13 — MUTATION ENGINE
─────────────────────────────────────────
Phase:  Phase 02 — AC-AMI Core
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → When validation fails, there is no automated repair path.
    Manual CTL correction breaks the autonomous loop.
Who experiences this problem?
  → The revision loop (Job 33) — it can't self-correct without
    a targeted mutation system.
What happens today without this solution?
  → A failed validation stops the agent. A human must inspect
    the CTL, identify the violation, and fix it manually before
    the loop can continue.

SOLUTION
What are we building?
  → A mutation engine with 9 targeted repair operations and a
    repairCTL loop that iterates until valid or exhausts attempts.
How does it solve the problem?
  → Each repair operation targets a specific validation failure
    type. The loop runs repair → validate → repeat until the
    CTL passes or max attempts is reached.
Why this approach and not another?
  → Constraint-directed repair over random mutation: random
    mutation may fix one violation and introduce three others.
    Targeted repairs converge faster and are auditable.

SUCCESS CRITERIA
  [x] Given an invalid CTL, repairCTL produces a valid CTL
  [x] All 9 repair types execute correctly on their target constraint
  [x] Loop terminates — no infinite loops possible
  [x] 18 tests pass


─────────────────────────────────────────


JOB 14 — PHASE 02 INTEGRATION TEST
─────────────────────────────────────────
Phase:  Phase 02 — AC-AMI Core
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → Each AC-AMI planner was tested in isolation. Planner
    interactions — where the output of one conflicts with the
    input constraints of another — are untested.
Who experiences this problem?
  → The generation agent in production, where integration failures
    surface as unexplained bad generations.
What happens today without this solution?
  → Integration bugs between planners go undetected until
    generation time. Root cause is hard to find.

SOLUTION
What are we building?
  → An integration test that runs the full chain — preset →
    harmony → groove → instrumentation → validate → mutate —
    for all 8 subgenres.
How does it solve the problem?
  → Catches planner-interaction bugs that unit tests miss. Confirms
    the complete AC-AMI chain produces valid CTL for every
    subgenre before Phase 03 starts.
Why this approach and not another?
  → Integration test as a gate job: runs last in Phase 02 so any
    individual planner fix is caught here before it causes a
    Phase 03 regression.

SUCCESS CRITERIA
  [x] All 8 subgenres produce valid, fully-planned CTL through the complete chain
  [x] No planner-to-planner conflicts on any subgenre
  [x] 16 tests pass


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 03 — GENERATION PIPELINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


JOB 15 — REPLICATE CLIENT
─────────────────────────────────────────
Phase:  Phase 03 — Generation Pipeline
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → No client exists to submit generation jobs to Replicate's
    MusicGen API. Mode 2 generation can't start.
Who experiences this problem?
  → The generation agent — it has no way to call MusicGen.
What happens today without this solution?
  → Mode 2 is a dead path. Async predictions submitted to
    Replicate have no polling mechanism, so they complete
    remotely but results are never retrieved.

SOLUTION
What are we building?
  → A typed Replicate client with prediction submission, status
    polling, exponential backoff retry, and error classification.
How does it solve the problem?
  → Client submits a prediction, polls until complete, and returns
    the audio URL. Retry logic handles Replicate's occasional
    transient errors without crashing.
Why this approach and not another?
  → Polling over webhooks: webhooks require a public endpoint —
    not available in local dev or CI. Polling works everywhere
    and is simpler to test.

SUCCESS CRITERIA
  [x] Client submits prediction and returns a prediction ID
  [x] Polling detects completion and returns audio URL
  [x] Retry logic handles transient errors without crashing
  [x] 12 tests pass


─────────────────────────────────────────


JOB 16 — MODE 2 CTL→MUSICGEN CONDITIONING
─────────────────────────────────────────
Phase:  Phase 03 — Generation Pipeline
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → MusicGen accepts text prompts, not CTL objects. No translation
    layer exists for Mode 2.
Who experiences this problem?
  → The generation agent running in Mode 2 — it holds a CTL
    but can't produce a MusicGen-compatible input.
What happens today without this solution?
  → Mode 2 submissions to MusicGen carry no Amapiano-specific
    context. Output is generic, unconditioned music.

SOLUTION
What are we building?
  → A CTL→MusicGen conditioning translator that converts CTL
    blocks into a structured text prompt tuned for MusicGen's
    conditioning mechanism.
How does it solve the problem?
  → Conditioning encodes BPM, key, groove feel, instrumentation,
    and energy from CTL into a prompt MusicGen understands.
Why this approach and not another?
  → Structured prompt over free-text description: structured
    templates produce consistent, testable outputs. Free-text
    prompts vary unpredictably and are hard to validate.

SUCCESS CRITERIA
  [x] Given a valid CTL, conditioning returns a MusicGen-ready prompt string
  [x] Prompt accurately reflects BPM, key, groove, and instrumentation
  [x] 14 tests pass


─────────────────────────────────────────


JOB 17 — GENERATION AGENT
─────────────────────────────────────────
Phase:  Phase 03 — Generation Pipeline
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → All generation backends exist independently but nothing
    routes CTL to the right one based on config.
Who experiences this problem?
  → Every caller above the generation layer — the revision loop,
    the autonomous agent — they'd each need to implement routing.
What happens today without this solution?
  → Callers must know which mode is active and call the right
    backend directly. Switching modes requires code changes
    in multiple places.

SOLUTION
What are we building?
  → A generation agent that reads generation_mode from config
    and routes to Mode 1 (Suno), Mode 2 (Replicate/MusicGen),
    or Mode 3 (reserved stub).
How does it solve the problem?
  → Single entry point. The revision loop and autonomous agent
    above it call one function regardless of which backend
    is active.
Why this approach and not another?
  → Config-driven routing over code switches: changing mode
    requires zero code change — just a config value. This was
    a design requirement from the start.

SUCCESS CRITERIA
  [x] Mode 1 routes to Suno exporter and returns bundle
  [x] Mode 2 routes to Replicate client and returns prediction ID
  [x] Mode 3 returns reserved status without error
  [x] 12 tests pass


─────────────────────────────────────────


JOB 18 — MODE 2 COMPLETION WORKER
─────────────────────────────────────────
Phase:  Phase 03 — Generation Pipeline
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → MusicGen predictions complete asynchronously on Replicate.
    No worker monitors completion or retrieves results.
Who experiences this problem?
  → The generation pipeline — predictions finish on Replicate
    but audio never lands in Supabase.
What happens today without this solution?
  → Mode 2 predictions are submitted and forgotten. No audio
    is stored, no generation record is updated, no analysis
    is queued.

SOLUTION
What are we building?
  → A BullMQ worker that polls Replicate prediction status,
    downloads audio on completion, stores to Supabase Storage,
    and marks the generation record complete.
How does it solve the problem?
  → Worker runs continuously, picks up pending predictions,
    and closes the Mode 2 lifecycle end-to-end without
    human intervention.
Why this approach and not another?
  → BullMQ worker over a cron job: workers scale horizontally,
    run only when there is work, and have built-in retry —
    cron jobs run on a fixed schedule regardless of queue depth.

SUCCESS CRITERIA
  [x] Worker detects prediction completion
  [x] Audio downloaded and stored in Supabase Storage
  [x] Generation record updated to complete status
  [x] 10 tests pass


─────────────────────────────────────────


JOB 19 — SUNO UPLOAD INGESTOR
─────────────────────────────────────────
Phase:  Phase 03 — Generation Pipeline
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → Mode 1 generates audio externally on Suno. No return path
    exists to bring that audio back into the system.
Who experiences this problem?
  → Producers using Mode 1 — they generate audio but can't
    close the loop back to the platform.
What happens today without this solution?
  → The Mode 1 lifecycle is permanently open. CTL leaves the
    system as a Suno bundle but audio never returns. No analysis,
    no evaluation, no dataset record.

SOLUTION
What are we building?
  → An upload ingestor endpoint that accepts producer-uploaded
    Suno audio, links it to the originating generation record,
    and queues it for analysis.
How does it solve the problem?
  → Closes the Mode 1 loop: CTL out → producer generates →
    audio in → analysis queued. The full lifecycle completes
    without human coordination of individual API calls.
Why this approach and not another?
  → Upload endpoint over webhook integration: Suno doesn't have
    a webhook API. Producer-initiated upload is the only
    available return path.

SUCCESS CRITERIA
  [x] Upload accepted and stored in Supabase Storage
  [x] Generation record linked to the uploaded audio file
  [x] Analysis job queued automatically on ingest
  [x] 8 tests pass


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 04 — AUDIO PRODUCTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


JOB 20 — DEMUCS STEM SEPARATION
─────────────────────────────────────────
Phase:  Phase 04 — Audio Production
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → Mixing, log drum extraction, and analysis all need individual
    stems. Mixed-down audio can't be processed at the stem level.
Who experiences this problem?
  → The mixing engine, log drum extractor, and analysis pipeline
    — all of Phase 04 is blocked.
What happens today without this solution?
  → Audio arrives as a stereo mix. Every downstream processor
    that needs to touch a specific instrument is stuck.

SOLUTION
What are we building?
  → Demucs htdemucs integration that separates audio into 4
    stems: drums, bass, vocals, other.
How does it solve the problem?
  → Each stem is independently accessible for processing, mixing,
    and analysis. The log drum extractor, mixing engine, and
    harmonic anchor all operate on the right stems.
Why this approach and not another?
  → htdemucs over older Demucs models: current best open-source
    separator for music. Significant quality improvement over v2/v3
    without requiring a different API.

SUCCESS CRITERIA
  [x] Stems endpoint returns 4 audio files (drums, bass, vocals, other)
  [x] htdemucs model runs without error
  [x] Output files are valid, playable audio


─────────────────────────────────────────


JOB 21 — LOG DRUM EXTRACTOR
─────────────────────────────────────────
Phase:  Phase 04 — Audio Production
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → The log drum is the defining element of Amapiano but it
    can't be isolated by stem separation — it lives inside
    the drum stem alongside all other percussion.
Who experiences this problem?
  → The DJ engine, the Amapianorize pipeline, and any producer
    who needs the log drum isolated for remixing.
What happens today without this solution?
  → The log drum can't be independently controlled, analysed,
    or synced at transitions. The DJ engine can't do log drum
    sync without it.

SOLUTION
What are we building?
  → A log drum extractor using FFT bandpass filter (60–300 Hz)
    and onset gate applied to the drum stem.
How does it solve the problem?
  → Bandpass targets the sub-bass frequency range where the log
    drum lives. Onset gate removes sustained bleed from other
    percussion in that range.
Why this approach and not another?
  → FFT bandpass over ML-based source separation: the log drum
    is spectrally distinct enough in the sub-bass range that
    frequency-domain filtering reliably isolates it without
    the overhead of a separate model.

SUCCESS CRITERIA
  [x] Extractor returns a log drum audio file from any drum stem input
  [x] FFT bandpass correctly isolates the 60–300 Hz range
  [x] Onset gate removes bleed without clipping log drum transients


─────────────────────────────────────────


JOB 22 — MIXING ENGINE
─────────────────────────────────────────
Phase:  Phase 04 — Audio Production
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → Individual stems need processing before recombination. Raw
    stem layering sounds unbalanced and unfinished.
Who experiences this problem?
  → The render pipeline — it can't produce a listenable mix
    without per-stem processing.
What happens today without this solution?
  → Stems are either left separate or naively summed. Neither
    produces broadcast-quality output.

SOLUTION
What are we building?
  → A mixing engine using pedalboard that applies per-stem EQ,
    compression, and level drawn from AC-AMI channel strip
    settings in CTL.
How does it solve the problem?
  → Each stem is processed according to CTL before recombination.
    The same schema that generated the track informs how it
    gets mixed — the loop closes.
Why this approach and not another?
  → CTL-driven channel strips over fixed processing: the mix
    reflects the musical intent encoded at generation time,
    not a one-size-fits-all preset.

SUCCESS CRITERIA
  [x] Mix endpoint returns a stereo mixdown from stem inputs
  [x] Channel strip settings from CTL applied to each stem
  [x] Output is audibly balanced — no single stem dominates


─────────────────────────────────────────


JOB 23 — MASTER CHAIN
─────────────────────────────────────────
Phase:  Phase 04 — Audio Production
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → Mixed audio is unmastered — wrong loudness, narrow stereo
    image, uneven tonal balance. It won't compete on streaming
    platforms.
Who experiences this problem?
  → Any listener who plays the output alongside commercial tracks
    — it sounds quiet and thin.
What happens today without this solution?
  → Output fails the loudness normalisation of every major
    streaming platform and sounds amateur next to commercial
    Amapiano releases.

SOLUTION
What are we building?
  → A master chain with stereo widening, multi-band EQ, and
    LUFS loudness limiter targeting −14 LUFS.
How does it solve the problem?
  → LUFS-compliant output survives streaming platform
    normalisation at the right perceived loudness. Stereo
    widening and EQ give competitive presence.
Why this approach and not another?
  → −14 LUFS target: Spotify, Apple Music, and YouTube all
    normalise to −14 LUFS. Tracks mastered hotter get turned
    down; tracks mastered quieter get turned up but lose
    the mix's dynamics.

SUCCESS CRITERIA
  [x] Master endpoint returns LUFS-compliant audio (−14 LUFS ±1)
  [x] Stereo width measurably increased relative to input
  [x] No clipping or inter-sample peaks above 0 dBFS


─────────────────────────────────────────


JOB 24 — RENDER PIPELINE
─────────────────────────────────────────
Phase:  Phase 04 — Audio Production
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → Stem separation, log drum extraction, mixing, and mastering
    exist as separate steps. No orchestrated path runs the full
    chain from raw audio to finished master.
Who experiences this problem?
  → Every caller who needs a finished track — they must manually
    chain four separate API calls and handle intermediate state.
What happens today without this solution?
  → Getting from raw audio to a master requires four manual steps,
    error handling at each, and correct passing of intermediate
    files between them.

SOLUTION
What are we building?
  → A full render pipeline that chains: raw → stems → log drum
    → mix → master in a single API call.
How does it solve the problem?
  → One endpoint, one call, one master file returned. Intermediate
    files produced as side-effects. Pipeline fails fast on any
    step error — no partial output.
Why this approach and not another?
  → Fail-fast pipeline over partial-success: partial output
    (e.g. a mix but no master) is worse than no output — it
    creates ambiguous state that's harder to recover from than
    a clean failure.

SUCCESS CRITERIA
  [x] POST /api/audio/render/full returns a finished master audio file
  [x] All intermediate files produced as side-effects
  [x] Any step failure stops the pipeline and returns a specific error


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 05 — DJ ENGINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


JOB 25 — AUDIO ANALYSIS (BPM + KEY)
─────────────────────────────────────────
Phase:  Phase 05 — DJ Engine
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → The DJ engine needs accurate BPM and key for every track
    to plan compatible transitions. Neither is known for any
    stored track.
Who experiences this problem?
  → The DJ set planner — it can't sequence tracks or check
    harmonic compatibility without BPM and key.
What happens today without this solution?
  → Track library records have no musical metadata. The DJ
    engine is blind to tempo and tonality.

SOLUTION
What are we building?
  → BPM detection and key detection using the Krumhansl-
    Schmuckler algorithm. Results written to the track record
    in Supabase.
How does it solve the problem?
  → Every track in the library gets analysed on ingest and
    carries its BPM and key. The DJ planner has the data it
    needs to sequence and transition correctly.
Why this approach and not another?
  → Krumhansl-Schmuckler over ML-based key detection: it is
    the most musically grounded algorithm available without
    model inference overhead — fast, deterministic, auditable.

SUCCESS CRITERIA
  [x] BPM detection accurate to ±2 BPM on test tracks
  [x] Key detection returns correct key on test tracks
  [x] Results written to Supabase track record


─────────────────────────────────────────


JOB 26 — CAMELOT WHEEL + HARMONIC COMPATIBILITY
─────────────────────────────────────────
Phase:  Phase 05 — DJ Engine
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → Transitions between harmonically incompatible keys sound
    clashing. No system maps keys to Camelot positions or
    checks compatibility.
Who experiences this problem?
  → The DJ set planner — without compatibility logic, it can't
    ensure smooth harmonic transitions.
What happens today without this solution?
  → Track sequencing is harmonically blind. Sets may cycle
    through incompatible keys, producing clashing transitions
    that break the mix.

SOLUTION
What are we building?
  → The full Camelot wheel (24 positions, inner/outer ring),
    a queryable track library indexed by position, and
    compatibility check functions.
How does it solve the problem?
  → Every key maps to a Camelot position. Compatibility checks
    return valid adjacent transitions (±1 position, inner↔outer).
    The DJ planner only sequences compatible transitions.
Why this approach and not another?
  → Camelot wheel over raw interval theory: it is the industry
    standard for DJ harmonic mixing. Producers and DJs already
    use it — the system speaks their language.

SUCCESS CRITERIA
  [x] All 24 Camelot positions map correctly to musical keys
  [x] Compatibility check returns valid adjacent transitions only
  [x] Track library queryable by Camelot position and BPM range


─────────────────────────────────────────


JOB 27 — DJ SET PLANNER
─────────────────────────────────────────
Phase:  Phase 05 — DJ Engine
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → Track ordering for a DJ set is manual. No system plans
    the energy arc that defines a great Amapiano set.
Who experiences this problem?
  → The set renderer — it needs an ordered, arc-shaped sequence
    to produce a coherent set, not just a list.
What happens today without this solution?
  → Sets are random sequences with no build, peak, or release.
    They don't follow Amapiano's structural conventions and
    won't hold a crowd.

SOLUTION
What are we building?
  → A DJ set planner that sequences tracks across 5 Amapiano
    energy phases: warm-up → build → peak → sustain → cool-down.
How does it solve the problem?
  → Energy arc is encoded as target levels per phase. Planner
    selects tracks whose energy and Camelot position match each
    phase, producing a musically intentional sequence.
Why this approach and not another?
  → 5-phase arc over continuous energy curve: discrete phases
    are easier to fill, validate, and explain. Amapiano sets
    have recognisable phase boundaries — this encodes that
    domain knowledge directly.

SUCCESS CRITERIA
  [x] Planner returns an ordered track list covering all 5 energy phases
  [x] All Camelot transitions valid throughout the set
  [x] Energy levels follow the correct arc — not random


─────────────────────────────────────────


JOB 28 — SET RENDERER
─────────────────────────────────────────
Phase:  Phase 05 — DJ Engine
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → A planned track sequence is just a list — it doesn't produce
    audio. No renderer stitches tracks together with transitions.
Who experiences this problem?
  → Anyone expecting the DJ engine to output a continuous mix,
    not a playlist.
What happens today without this solution?
  → The DJ engine plans a set but produces no audio. The output
    is academically correct but practically useless.

SOLUTION
What are we building?
  → A set renderer with three transition modes: crossfade
    (gradual blend), log drum sync (align kick hits at the
    transition point), and hard cut.
How does it solve the problem?
  → Stitches the planned sequence into a continuous audio file.
    Log drum sync is the Amapiano-specific mode — matching the
    log drum hit at transitions is the hallmark of skilled
    Amapiano DJing.
Why this approach and not another?
  → Three modes over one: different transitions serve different
    energy moments in the set. Hard cuts work at peak energy;
    crossfades work at warm-up and cool-down.

SUCCESS CRITERIA
  [x] POST /api/audio/dj/render returns a continuous audio file
  [x] Crossfade transitions audibly smooth
  [x] Log drum sync aligns kick hits at transition boundaries


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 06 — AMAPIANORIZE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


JOB 29 — SOURCE ANALYZER
─────────────────────────────────────────
Phase:  Phase 06 — Amapianorize
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → The Amapianorize pipeline applies transformations blindly.
    Without knowing what the source audio is, it can't calibrate
    how aggressive each transformation needs to be.
Who experiences this problem?
  → The rhythm transplant and harmonic anchor steps — they receive
    audio with no context about its origin.
What happens today without this solution?
  → A 180 BPM drum and bass track and an 85 BPM hip-hop track
    receive the same transformation parameters. One ends up
    correct; the other is mangled.

SOLUTION
What are we building?
  → A source analyzer that produces a SourceProfile: BPM, key,
    energy level, spectral character, and genre classification.
How does it solve the problem?
  → Every subsequent step reads the SourceProfile and calibrates
    accordingly — the right BPM stretch ratio, the right harmonic
    shift distance.
Why this approach and not another?
  → SourceProfile as a typed struct over passing raw analysis
    values: every downstream step gets a consistent, validated
    object. No step makes assumptions about what it was handed.

SUCCESS CRITERIA
  [x] Analyzer returns a complete SourceProfile for any audio input
  [x] Genre classification matches expected labels on test tracks
  [x] BPM and key values match ground truth on test tracks


─────────────────────────────────────────


JOB 30 — RHYTHM TRANSPLANT
─────────────────────────────────────────
Phase:  Phase 06 — Amapianorize
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → Non-Amapiano audio has foreign rhythmic DNA. Tempo-stretching
    to Amapiano BPM produces audio at the right tempo but with
    no Amapiano groove feel.
Who experiences this problem?
  → Anyone using the Amapianorize pipeline — they expect output
    that *feels* like Amapiano, not just runs at the right BPM.
What happens today without this solution?
  → Transformed tracks pass a BPM test but fail the ear test.
    They sound like the source material sped up or slowed down,
    not Amapianorized.

SOLUTION
What are we building?
  → A rhythm transplant module that time-stretches audio to the
    target Amapiano BPM, then injects Amapiano groove microtiming
    offsets from a selected groove template.
How does it solve the problem?
  → Two-step: stretch first (preserves pitch), then inject
    microtiming (changes rhythmic feel without changing pitch
    again). The groove template encodes real Amapiano feel.
Why this approach and not another?
  → Two-step over simultaneous stretch+groove: doing both at
    once produces compounding artefacts. Sequential steps are
    independently tunable and auditable.

SUCCESS CRITERIA
  [x] Output audio matches target BPM
  [x] Groove injection audibly shifts the rhythmic feel toward Amapiano
  [x] No pitch artefacts from time-stretching


─────────────────────────────────────────


JOB 31 — HARMONIC ANCHOR + FULL PIPELINE
─────────────────────────────────────────
Phase:  Phase 06 — Amapianorize
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → After rhythm transplant, the audio may be in a key that
    clashes with Amapiano harmonic conventions. And the full
    transform pipeline has no single entry point.
Who experiences this problem?
  → API consumers who want to Amapianorize a track — they'd need
    to chain 5 separate calls and manage intermediate state.
What happens today without this solution?
  → Harmonically mismatched output even after correct rhythm
    transplant. And no complete pipeline means manual orchestration
    for every transformation.

SOLUTION
What are we building?
  → A harmonic anchor that pitch-shifts audio to the nearest
    Amapiano-compatible key via Camelot wheel proximity, then
    a full pipeline endpoint: analyze → separate → rhythm
    transplant → harmonic anchor → mix → master.
How does it solve the problem?
  → Harmonic anchor ensures the output is in a key that works
    in Amapiano contexts. Single endpoint eliminates manual
    orchestration entirely.
Why this approach and not another?
  → Camelot-proximity over fixed target key: the nearest
    compatible key minimises the pitch shift distance, preserving
    more of the source character.

SUCCESS CRITERIA
  [x] POST /amapianorize/transform completes the full pipeline end-to-end
  [x] Output is in a valid Amapiano-compatible key
  [x] No manual steps required between pipeline stages


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 07 — AGENT LOOP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


JOB 32 — EVALUATION API
─────────────────────────────────────────
Phase:  Phase 07 — Agent Loop
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → No system evaluates generated tracks against their source
    CTL. The agent generates but never knows if it succeeded.
Who experiences this problem?
  → The revision loop — it has no feedback signal to decide
    whether to retry or accept.
What happens today without this solution?
  → Every generation is accepted regardless of quality. The
    revision loop (Job 33) has nothing to measure and nothing
    to improve against.

SOLUTION
What are we building?
  → An evaluation API that scores a generation against its
    source CTL across multiple dimensions: groove fit, harmonic
    accuracy, instrumentation match, energy alignment.
How does it solve the problem?
  → Returns a composite score and per-dimension breakdown. The
    revision loop knows whether to accept and, if not, which
    dimension to target with mutations.
Why this approach and not another?
  → Per-dimension scoring over single composite: the mutation
    engine needs to know *what* failed to apply the right repair.
    A single score tells it a generation is bad but not why.

SUCCESS CRITERIA
  [x] Evaluation returns a composite score (0–100) for any generation
  [x] Per-dimension scores returned alongside composite
  [x] Results written to evaluations table in Supabase


─────────────────────────────────────────


JOB 33 — REVISION LOOP
─────────────────────────────────────────
Phase:  Phase 07 — Agent Loop
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → A single generation attempt rarely hits all CTL targets.
    The agent accepts the first result regardless of quality.
Who experiences this problem?
  → The autonomous agent — it produces output but has no
    mechanism for self-improvement within a single run.
What happens today without this solution?
  → Low-scoring generations are returned as final output.
    Quality is inconsistent and uncontrolled.

SOLUTION
What are we building?
  → A revision loop: evaluate → if score below threshold →
    mutate CTL → regenerate. Max 3 iterations.
How does it solve the problem?
  → The agent improves its output within a single run without
    human intervention. CTL mutations target the specific
    dimensions that failed.
Why this approach and not another?
  → Max 3 iterations over unlimited: most CTL issues resolve
    within 2 iterations. Unlimited retry is unbounded cost.
    Three is the practical ceiling before diminishing returns.

SUCCESS CRITERIA
  [x] Loop terminates on pass (above threshold) or max 3 iterations
  [x] Each iteration produces a new generation with a targeted CTL mutation
  [x] Final score higher than first-attempt score in >50% of runs


─────────────────────────────────────────


JOB 34 — RESULTS STORE
─────────────────────────────────────────
Phase:  Phase 07 — Agent Loop
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → Evaluation results and revision history are ephemeral —
    they live in memory during a run and are lost when it ends.
Who experiences this problem?
  → The weight tuner (Job 35) and dataset builder (Job 36) —
    both require historical evaluation data that doesn't exist.
What happens today without this solution?
  → No way to analyse what the agent tried, scored, and why
    across runs. Every run starts from scratch with no learning.

SOLUTION
What are we building?
  → A results store that persists evaluation scores, CTL mutation
    diffs, and iteration count per track in Supabase.
How does it solve the problem?
  → All evaluation rounds are queryable by track ID. Mutation
    diffs stored as structured JSON — the delta between each
    iteration is inspectable and analysable.
Why this approach and not another?
  → Structured diffs over snapshots: storing the full CTL at
    each iteration is expensive and redundant. Diffs are compact,
    show exactly what changed, and are faster to query.

SUCCESS CRITERIA
  [x] All evaluation rounds queryable by track ID
  [x] Mutation diffs stored as structured, human-readable JSON
  [x] Iteration count accurate per track


─────────────────────────────────────────


JOB 35 — WEIGHT TUNER
─────────────────────────────────────────
Phase:  Phase 07 — Agent Loop
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → Evaluation scoring weights are hardcoded. The system applies
    the same formula regardless of what it has learned.
Who experiences this problem?
  → The evaluation API — its composite score may not reflect
    what actually correlates with quality in Amapiano.
What happens today without this solution?
  → The agent optimises for a fixed formula that may be wrong.
    Accumulated evaluation history has no path to improving
    the scoring model.

SOLUTION
What are we building?
  → A weight tuner that analyses evaluation history and adjusts
    scoring weights toward dimensions that best predict quality
    outcomes in the dataset.
How does it solve the problem?
  → Updated weight vector is fed back into the evaluation API.
    The agent gets smarter over time — not by changing its
    architecture, but by improving what it measures.
Why this approach and not another?
  → Data-driven weight adjustment over manual tuning: manual
    weight selection is guesswork. The data reveals which
    dimensions actually matter for Amapiano quality.

SUCCESS CRITERIA
  [x] Weight tuner runs on dataset and produces an updated weight vector
  [x] Updated weights improve composite score correlation on held-out set
  [x] POST /api/agent/tune completes without error


─────────────────────────────────────────


JOB 36 — DATASET BUILDER
─────────────────────────────────────────
Phase:  Phase 07 — Agent Loop
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → ML training requires a clean, labelled dataset of CTL +
    audio reference + scores. No pipeline constructs this
    automatically from evaluation history.
Who experiences this problem?
  → Phase 08 — the entire ML layer is blocked without a dataset.
What happens today without this solution?
  → Evaluation history exists in Supabase but is unsplit,
    unlabelled, and not in the format ML training expects.
    Phase 08 cannot start.

SOLUTION
What are we building?
  → A dataset builder that assembles dataset_records from
    evaluation history with deterministic 80/10/10
    train/val/test splits.
How does it solve the problem?
  → Each record includes CTL, audio reference, and composite
    score — exactly what the fine-tuning job needs. Hash-based
    split assignment prevents data leakage.
Why this approach and not another?
  → Deterministic hash-based splits over random: the same record
    always lands in the same split across runs. Random splits
    risk the same track appearing in both train and val.

SUCCESS CRITERIA
  [x] GET /api/agent/dataset returns record counts by split
  [x] Each record includes CTL, audio reference, and composite score
  [x] Split ratios correct at 80/10/10 ±1%


─────────────────────────────────────────


JOB 37 — FULL AUTONOMOUS AGENT
─────────────────────────────────────────
Phase:  Phase 07 — Agent Loop
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → All subsystems exist independently but no single entry point
    runs the full end-to-end loop autonomously.
Who experiences this problem?
  → Any consumer of the platform — getting a generated, evaluated
    track requires manually chaining 7 separate API calls.
What happens today without this solution?
  → The platform is a collection of parts, not a product.
    Phases 01–06 built powerful subsystems that no one can
    use without deep knowledge of the internal API surface.

SOLUTION
What are we building?
  → POST /api/agent/run — orchestrates the full pipeline:
    create track → select preset → run planners → revision loop
    → generate → store → return evaluated result.
How does it solve the problem?
  → One call in, one evaluated result out. The entire platform
    collapses to a single API surface. This is the payoff job.
Why this approach and not another?
  → Single endpoint over SDK/workflow: the agent is a product,
    not a library. A single HTTP call is the right abstraction
    for a system that should be autonomous.

SUCCESS CRITERIA
  [x] Single API call returns { status, track_id, ctl, validation_passed,
      composite_score, iterations_run, agent_log }
  [x] Agent completes without manual intervention at any step
  [x] All 7 pipeline stages execute in the correct sequence


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 08 — ML LAYER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


JOB 38 — AUDIO FEATURE BRIDGE
─────────────────────────────────────────
Phase:  Phase 08 — ML Layer
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → dataset_records held placeholder BPM and key values — the
    fields existed but contained dummy data injected at record
    creation time.
Who experiences this problem?
  → The ML training pipeline — it trains on fake features and
    learns noise instead of signal.
What happens today without this solution?
  → Any model trained on this dataset produces unreliable output.
    The 389 existing records are worthless for training until
    corrected.

SOLUTION
What are we building?
  → An audio feature bridge that runs real analysis on every
    stored audio file and writes actual BPM, key, and composite
    score to dataset_records after every audio.analyze job.
    Includes a backfill script for all existing records.
How does it solve the problem?
  → Real features replace placeholders. Every record in the
    dataset now carries ground-truth musical data. New records
    are populated automatically on ingest.
Why this approach and not another?
  → Idempotent backfill script over a migration: a migration
    runs once and can't be safely re-run. An idempotent script
    can be re-run to verify or correct without risk.

SUCCESS CRITERIA
  [x] 389/389 existing records updated with real BPM, key, and score
  [x] Zero placeholder values remaining in dataset_records
  [x] Every new audio.analyze job writes real features automatically
  [x] Backfill script is idempotent — safe to re-run


─────────────────────────────────────────


JOB 39 — TEMPORAL SCAFFOLD
─────────────────────────────────────────
Phase:  Phase 08 — ML Layer
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → Dataset ingestion is a multi-step, long-running process
    with no durable orchestration. Steps fail silently and
    leave records in partially-ingested states.
Who experiences this problem?
  → The dataset pipeline — there is no way to know which
    ingestion step failed, what was completed, or how to retry
    safely.
What happens today without this solution?
  → A crashed worker mid-ingestion leaves the dataset in
    unknown state. Recovery requires manual inspection and
    re-ingestion, risking duplicates.

SOLUTION
What are we building?
  → A DatasetIngestionWorkflow using Temporal that provides
    durable execution, automatic retry, and observable state
    for each ingestion activity.
How does it solve the problem?
  → Temporal persists workflow state to a database. If a worker
    crashes mid-ingestion, the workflow resumes from the last
    successful activity — no data is lost and no step is
    repeated.
Why this approach and not another?
  → Temporal over BullMQ for this workflow: BullMQ retries
    individual jobs but has no concept of multi-step workflow
    state. Temporal was designed for exactly this pattern.

SUCCESS CRITERIA
  [x] DatasetIngestionWorkflow starts and executes activities in order
  [x] Failed activities retry automatically without manual intervention
  [x] Workflow state visible in Temporal UI


─────────────────────────────────────────


JOB 40 — DATASET PIPELINE
─────────────────────────────────────────
Phase:  Phase 08 — ML Layer
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → Dataset splits computed on-demand can drift as new records
    arrive. A record can move between train and val across runs,
    causing silent data leakage.
Who experiences this problem?
  → The ML training job — leakage between train and val produces
    inflated validation metrics and an overfit model.
What happens today without this solution?
  → Split assignment is non-deterministic. The same track can
    appear in both train and val on different runs. Model
    evaluation is unreliable.

SOLUTION
What are we building?
  → A dataset pipeline that assigns records to splits
    deterministically at ingestion time using hash-based
    assignment, maintaining 80/10/10 integrity as the dataset grows.
How does it solve the problem?
  → Hash-based assignment guarantees the same record ID always
    maps to the same split. Leakage is structurally impossible.
Why this approach and not another?
  → Hash-based over sequential assignment: sequential splits
    break when records are deleted or re-ingested. Hash-based
    is robust to any order of operations.

SUCCESS CRITERIA
  [x] Split counts match 80/10/10 ratio on the full dataset
  [x] Same record ID maps to the same split on every run
  [x] New records assigned correctly without touching existing splits


─────────────────────────────────────────


JOB 41 — MUSICGEN FINE-TUNING ON MODAL
─────────────────────────────────────────
Phase:  Phase 08 — ML Layer
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → MusicGen's base model has no Amapiano-specific training.
    Generated audio lacks the log drum feel, piano stab patterns,
    and groove characteristics that define the genre.
Who experiences this problem?
  → Mode 2 generation — it produces generic music, not Amapiano.
What happens today without this solution?
  → Heavy prompt engineering achieves mediocre on-genre results.
    The AC-AMI conditioning helps but the base model has no
    Amapiano priors to activate.

SOLUTION
What are we building?
  → Fine-tuning of MusicGen on the Amapiano dataset using
    AudioCraft on Modal's A10G GPU, triggered by modal run.
How does it solve the problem?
  → The fine-tuned model has Amapiano priors baked in. CTL
    conditioning now activates a model that already understands
    the genre rather than fighting a generic one.
Why this approach and not another?
  → Modal over self-managed GPU: A10G on Modal costs ~$1/hr
    billed per second. No infra to manage, no idle cost, no
    minimum commitment — right for a research-phase training run.

SUCCESS CRITERIA
  [x] Fine-tuned model checkpoint saved to Modal volume
  [x] Training loss converges over the training run
  [x] Sample generations from fine-tuned model audibly more
      Amapiano-like than base model baseline


─────────────────────────────────────────


JOB 42 — ABLATION STUDY
─────────────────────────────────────────
Phase:  Phase 08 — ML Layer
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → No empirical evidence that the full AC-AMI stack improves
    generation quality over simpler approaches.
Who experiences this problem?
  → The research claim — without an ablation, AC-AMI's value
    is an assertion, not a finding. The PhD evidence is absent.
What happens today without this solution?
  → The system produces good output but can't prove *why*.
    Any reviewer can dismiss the contribution as unverified.

SOLUTION
What are we building?
  → A 3-condition ablation: prompt_only (text prompt, no CTL),
    ctl_no_lineage (CTL conditioning without lineage), and
    full_stack (complete AC-AMI pipeline). Composite scores
    measured across conditions.
How does it solve the problem?
  → Isolates the contribution of each system layer. ac_ami_lift
    field quantifies the % improvement of full_stack over
    prompt_only — a citable, reproducible result.
Why this approach and not another?
  → 3 conditions over pairwise: three conditions test both the
    value of CTL conditioning and the specific value of lineage
    — the two claims that need defending.

SUCCESS CRITERIA
  [x] POST /api/agent/ablation returns scores for all 3 conditions
  [x] full_stack outperforms prompt_only on composite score
  [x] ac_ami_lift field populated with % improvement


─────────────────────────────────────────


JOB 43 — VITS2 ISIZULU VOCAL SYNTHESIS
─────────────────────────────────────────
Phase:  Phase 08 — ML Layer
Status: [x] Complete

PROBLEM DEFINITION
What is broken, missing, or creating pain?
  → No system generates isiZulu vocals for Amapiano tracks.
    Standard TTS systems don't support isiZulu. Phonetics must
    be correct for the language to be intelligible.
Who experiences this problem?
  → Producers who need isiZulu vocal lines — currently impossible
    without a human vocalist. AURA X produces instrumentals only.
What happens today without this solution?
  → Vocal synthesis is unavailable. The platform can't participate
    in the full Amapiano production workflow, which is vocal-led.

SOLUTION
What are we building?
  → A VITS2 vocal synthesis scaffold with an IPA phonetics
    pipeline for isiZulu. Input: text. Output: vocal audio.
    Pipeline: text → isiZulu IPA transcription → VITS2 synthesis.
How does it solve the problem?
  → Correct IPA transcription ensures isiZulu phonemes are
    rendered intelligibly. VITS2 produces natural prosody from
    IPA without needing a massive training corpus.
Why this approach and not another?
  → VITS2 over standard TTS: VITS2 accepts IPA directly, which
    is essential for a low-resource language like isiZulu where
    no pre-trained TTS models exist. IPA is the bridge.

SUCCESS CRITERIA
  [x] POST /api/agent/synthesize returns vocal audio for isiZulu text input
  [x] IPA transcription correct for test phrases
  [x] VITS2 model runs on Modal without error


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENGINE PACKAGE — @aura-x/engine
(packages/engine — TypeScript, zero runtime deps)
Each E-job: one module, one export, tests green, tsc clean, one commit.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


E-01 — 8-SUBGENRE EXPANSION
─────────────────────────────────────────
Phase:  Engine — Phase A (Audio Foundation)
Status: [x] Complete

PROBLEM DEFINITION
  → Engine recognised 4 lanes only. stixx_sgija, mbiraiano, three_step,
    gqom_fusion, and hybrid_rnb_amapiano had no scoring, grammar, or
    thresholds — evaluations on those subgenres returned garbage scores.
  → Every producer working outside the 4-lane set hit incorrect lane scores.
  → Without all 8 lanes, the cultural encoding layer had incomplete coverage.

SOLUTION
  → Added all 8 lanes to LANES, LANE_GRAMMARS, LANE_TARGETS, LANE_WEIGHTS,
    and ELITE_THRESHOLDS. Each lane got a calibrated Gaussian target and
    weight vector grounded in sub-genre DSP characteristics.
  → scoreAuthenticityLanes now returns a valid score for every subgenre.
  → Why 8 and not extensible: the 8 lanes are the defined taxonomy; adding
    more is a future schema change, not a runtime concern.

SUCCESS CRITERIA
  [x] All 8 lanes present in LANES array and exported from types.ts
  [x] scoreAuthenticityLanes returns a non-zero score for every lane
  [x] Tests cover all 8 subgenres


E-02 — O.211 PERCEPTION MODEL
─────────────────────────────────────────
Phase:  Engine — Phase A (Audio Foundation)
Status: [x] Complete

PROBLEM DEFINITION
  → Authenticity scoring treated all frequency bands equally. Low-end
    masking and psychoacoustic density were ignored, producing evaluations
    that disagreed with human listeners on Amapiano material.
  → B_eff (effective bass energy) was not modelled; sub-bass and bass
    collisions produced inflated scores.
  → No density labelling existed for the 4-tier sparse/moderate/dense/
    overloaded perceptual scale.

SOLUTION
  → Implemented O.211 perceptual model: B_eff with Bark-scale masking,
    perceptual density labelling, and a 3-anchor quality gate.
  → applyPerceptionModel, computeBEff, computePerceptualDensity, barkScale
    all exported.
  → Bark scale chosen over ERB because it maps more cleanly to the 20–300 Hz
    region dominant in Amapiano production.

SUCCESS CRITERIA
  [x] barkScale returns 24 Bark bands
  [x] computeBEff returns value in [0, 1]
  [x] computePerceptualDensity returns a DensityLabel


E-03 — VIRTUAL STEM DECOMPOSITION
─────────────────────────────────────────
Phase:  Engine — Phase A (Audio Foundation)
Status: [x] Complete

PROBLEM DEFINITION
  → The engine could not separate a mixed buffer into stem contributions
    without running Demucs (Python, slow). A lightweight spectral proxy
    was needed for fast per-stem analysis in the TypeScript pipeline.
  → Lane quality scoring needed per-stem energy estimates it did not have.
  → No tonality or transience scores existed for individual stems.

SOLUTION
  → decomposeStems: 5-band FFT decomposition (sub-bass, bass, mid, high-mid,
    air) with per-band energy, tonality (harmonic ratio), and transience
    (onset sharpness) scores. Returns a VirtualStem per named stem.
  → Purely spectral — no source separation; fast enough for real-time use.

SUCCESS CRITERIA
  [x] decomposeStems returns 5 VirtualStem objects
  [x] Each stem has energy, tonality, transience in [0, 1]
  [x] log_drum stem has highest sub-bass energy on a test log-drum signal


E-04 — CULTURAL ENCODING LAYER
─────────────────────────────────────────
Phase:  Engine — Phase A (Audio Foundation)
Status: [x] Complete

PROBLEM DEFINITION
  → The engine scored audio quality but had no representation of cultural
    authenticity — geographic origin, language context, diaspora reach.
    Evaluations were culturally blind: a South African and a Dutch producer
    making the same track received the same score.
  → CULTURAL_PROFILES did not exist; there was no preset vocabulary.

SOLUTION
  → computeCulturalAlignment: maps CulturalProfile + CtlConditioning to a
    CulturalAlignment score with sub-scores for geographic match, language
    fit, and diaspora accessibility.
  → CULTURAL_PROFILES provides 8 presets covering ZA, NG, GH, KE, ZW, UG,
    diaspora-EU, diaspora-US.

SUCCESS CRITERIA
  [x] computeCulturalAlignment returns score in [0, 1]
  [x] ZA profile scores higher for private_school than diaspora-US profile
  [x] CULTURAL_PROFILES has entries for all 8 subgenres


E-05 — CTL SPEC SYNTHESIS
─────────────────────────────────────────
Phase:  Engine — Phase B (CTL-Aware)
Status: [x] Complete

PROBLEM DEFINITION
  → The engine evaluated audio but could not produce a CTL_v1 document from
    its analysis. There was no bridge from audio features back to the
    structured creative language the rest of the platform runs on.
  → Every post-analysis step (generation, revision) had to construct CTL
    manually from the evaluation output — error-prone and inconsistent.

SOLUTION
  → synthesizeCtl: takes AudioFeatures + lane + GrooveProfile and produces
    a CTLv1 document with bpm, key, subgenre, groove template, and
    instrument conditioning fields fully populated from the analysis.
  → Closes the analysis → generation loop without manual CTL authoring.

SUCCESS CRITERIA
  [x] synthesizeCtl returns a valid CTLv1 object
  [x] bpm field matches input features.bpm within ±2
  [x] subgenre field matches the requested lane


E-06 — FULL ANALYSIS PIPELINE + ROUTE UPGRADE
─────────────────────────────────────────
Phase:  Engine — Phase B (CTL-Aware)
Status: [x] Complete

PROBLEM DEFINITION
  → All engine modules were independently callable but there was no single-
    call path from raw audio features to a complete analysis plan.
  → The /api/amapianorize route still called lib/audio-analysis (legacy),
    not the engine — defeating the purpose of having built the engine.

SOLUTION
  → analyzeAndPlan: feature extraction → lane scoring → groove extraction →
    CTL synthesis → sample plan → groove plan in one call.
  → Route apps/api/src/routes/amapianorize.ts now calls evaluateBuffer +
    buildEnhancement from packages/engine, replacing the legacy library.

SUCCESS CRITERIA
  [x] analyzeAndPlan returns an AnalysisPlan for a synthetic WAV
  [x] /api/amapianorize route uses engine (not lib/audio-analysis)
  [x] Response includes ctl, groovePlan, laneScores


E-07 — GROOVE VARIATION ENGINE
─────────────────────────────────────────
Phase:  Engine — Phase A (Audio Foundation)
Status: [x] Complete

PROBLEM DEFINITION
  → The engine could analyse a groove but could not generate variations.
    Producers needed fills, breakdowns, and alternative patterns derived
    from a seed groove plan — not just a static evaluation.
  → No GrooveVariationSet type or variation taxonomy existed.

SOLUTION
  → generateGrooveVariations: takes a GroovePlan and produces a
    GrooveVariationSet with main/variation/fill/breakdown/build variants.
    Each variant mutates density, velocity profile, or pattern selection
    using hashString-seeded determinism.

SUCCESS CRITERIA
  [x] Returns all 5 variation types
  [x] Each variant has the same totalBars as the original
  [x] Same seed always produces the same set


E-08 — COMPARATIVE EVALUATION ENGINE
─────────────────────────────────────────
Phase:  Engine — Phase D (Audio-CTL Alignment)
Status: [x] Complete

PROBLEM DEFINITION
  → Single-point evaluation scores gave no relative signal. Producers needed
    to compare two renders and know which was better and by how much, but
    there was no comparison primitive.

SOLUTION
  → compareEvaluations / compareBuffers: takes two AmapianEvaluation objects
    or two WAV buffers and returns a ComparisonReport with per-dimension
    deltas, winner field, and improvementPct.

SUCCESS CRITERIA
  [x] compareEvaluations returns winner: "a" | "b" | "tie"
  [x] dimensionDeltas has an entry for every scored lane
  [x] improvementPct is positive when b > a


E-09 — PATTERN FINGERPRINTING & SIMILARITY
─────────────────────────────────────────
Phase:  Engine — Phase D (Audio-CTL Alignment)
Status: [x] Complete

PROBLEM DEFINITION
  → No way to detect if two groove plans were structurally similar.
    Duplicate patterns produced identical outputs silently and the
    variation engine could not measure its own diversity.

SOLUTION
  → fingerprintGroovePlan: step-density vector + Hamming-distance-ready
    hash → PatternFingerprint. comparePatterns: PatternSimilarity score
    in [0, 1] via normalised Hamming distance.

SUCCESS CRITERIA
  [x] Same plan produces identical fingerprint
  [x] comparePatterns returns 1.0 for identical, < 1.0 for different plans
  [x] Hamming distance is symmetric


E-10 — ARRANGEMENT ARC PLANNER
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Groove plans had no macro structure. No concept of intro, drop,
    breakdown, or outro existed — every render was a flat 8-bar loop
    with no energy arc or section identity.

SOLUTION
  → planArrangementArc: takes totalBars + ArcOptions and returns an
    ArrangementArc with 6 named sections (intro/build/drop1/breakdown/
    drop2/outro), bar ranges, and energy targets per section.

SUCCESS CRITERIA
  [x] All 6 section types present in the default arc
  [x] Sections are contiguous and non-overlapping
  [x] Total bars equals sum of all section lengths


E-11 — MIX SPEC GENERATOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Render-to-render quality variation was uncontrolled because no
    adaptive mix spec existed. Gains, sends, and bus routing were
    hardcoded regardless of what the audio analysis showed.

SOLUTION
  → generateMixSpec: derives a MixSpec (per-stem gain, pan, send levels,
    master chain) from GroovePlan + AudioFeatures. Values calibrated to
    Amapiano production standards.

SUCCESS CRITERIA
  [x] MixSpec has an entry for all 6 stem types
  [x] All gain values in [-18, 0] dBFS range
  [x] Master chain includes limiter threshold


E-12 — SAMPLE RECOMMENDATION ENGINE
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → The engine analysed what was there but never suggested what was
    missing. Producers had no guidance on which sample types to layer
    over a generated track.

SOLUTION
  → recommendSamples: takes GroovePlan + AudioFeatures and returns a
    SamplePack with ranked SampleRecommendation entries (role, description,
    priority, reason) based on lane and spectral gap analysis.

SUCCESS CRITERIA
  [x] Returns at least 3 recommendations for any input
  [x] log_drum always recommended when missing
  [x] Recommendations sorted by priority desc


E-13 — TEMPO HUMANIZER
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Groove patterns had perfectly quantised timing. Human drummers apply
    micro-timing variation; without it, generated patterns sound mechanical
    and fail Amapiano feel tests.

SOLUTION
  → humanizePattern: applies per-hit timing jitter (±jitterMs) and velocity
    scatter using hashString-seeded PRNG, producing a HumanizedPattern from
    a GroovePlan.

SUCCESS CRITERIA
  [x] Output tick values differ from input by at most jitterMs in ticks
  [x] Same seed always produces same humanization
  [x] Different seeds produce different results


E-14 — QUALITY GATE PIPELINE
─────────────────────────────────────────
Phase:  Engine — Phase D (Audio-CTL Alignment)
Status: [x] Complete

PROBLEM DEFINITION
  → Individual quality metrics existed but no unified pass/fail gate could
    block a render from advancing to distribution if it failed minimum
    Amapiano standards.

SOLUTION
  → runQualityGates: evaluates a render against 6 gates (BPM range, log drum
    presence, perceptual density, lane score, harmonic tension, groove
    consistency) and returns a QualityGateReport with per-gate GateResult and
    overall pass boolean and GradeLabel.

SUCCESS CRITERIA
  [x] Report contains all 6 gate names
  [x] Overall pass is false if any gate fails
  [x] GradeLabel assigned per gate (S/A/B/C/F)


E-15 — GROOVE INTERPOLATOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Transitioning between two groove patterns required an abrupt cut.
    There was no way to blend patterns gradually across a number of bars,
    which sounded unnatural at section boundaries.

SOLUTION
  → interpolateGrooves: blends two GroovePlan instances over nBars using
    linear, ease-in, ease-out, or crossfade weighting. Returns a
    GrooveInterpolation with a per-bar blended pattern.

SUCCESS CRITERIA
  [x] Output has nBars entries
  [x] First bar matches source at t=0
  [x] Last bar matches target at t=1


E-16 — PRODUCTION REPORT GENERATOR
─────────────────────────────────────────
Phase:  Engine — Phase G (Observability)
Status: [x] Complete

PROBLEM DEFINITION
  → After a full session there was no structured summary a producer or
    monitoring system could read to understand what happened: which lane
    won, what score was reached, what enhancements were applied.

SOLUTION
  → generateProductionReport: takes a FullSession and returns a
    ProductionReport with summary (lane, score, tier, iterations),
    enhancement list, gate results, and a human-readable verdict string.

SUCCESS CRITERIA
  [x] Report contains lane, score, tier, iterations
  [x] Verdict string is non-empty
  [x] enhancements list matches session enhancements


E-17 — CHORD VOICING ENGINE
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → The engine described chord functions in CTL but could not materialise
    MIDI note arrays from them. Harmony planners had no concrete output.

SOLUTION
  → buildChordProgression: takes root, scale, and ChordFunction sequence and
    returns a ChordProgression with voiced MIDI notes, tension labels, and
    suggested durations for each chord.

SUCCESS CRITERIA
  [x] All chords have 3–4 notes in valid MIDI range
  [x] Tension labels match ChordFunction semantics
  [x] Progression length matches requested chord count


E-18 — SESSION DRIFT DETECTOR
─────────────────────────────────────────
Phase:  Engine — Phase G (Observability)
Status: [x] Complete

PROBLEM DEFINITION
  → Across revision iterations, quality scores could drift in unpredictable
    directions with no alarm. Refinement could make a track worse while the
    system kept iterating without flagging it.

SOLUTION
  → detectDrift: analyses a SignalTrace (series of quality scores over
    iterations) and returns a DriftReport with trend classification
    (improving/stable/degrading/volatile), magnitude, and a stop signal.

SUCCESS CRITERIA
  [x] Returns "improving" when scores increase monotonically
  [x] Returns "degrading" when scores decrease monotonically
  [x] Returns "volatile" when scores alternate


E-19 — CHORD-TO-MIDI EXPORTER
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → The chord voicing engine produced ChordProgression objects but there
    was no path to export them as playable MIDI files for DAW import.

SOLUTION
  → exportChordProgressionToMidi: takes ChordProgression + ChordMidiOptions
    and writes a Type-0 MIDI buffer with note-on/note-off per chord note,
    respecting velocity and duration from the voicing.

SUCCESS CRITERIA
  [x] Output buffer starts with MIDI header bytes 4D 54 68 64
  [x] Note count matches sum of notes across all chords
  [x] Duration follows ChordMidiOptions.ticksPerChord


E-20 — FULL SESSION ENGINE
─────────────────────────────────────────
Phase:  Engine — Phase F (Production Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Individual pipeline stages existed but there was no single entry point
    that ran the full end-to-end session: analyse → plan → vary → gate →
    humanize → export. Integration had to be assembled manually each time.

SOLUTION
  → runFullSession: orchestrates all pipeline stages from WAV buffer +
    FullSessionOptions to a FullSession result containing evaluation,
    enhancement, groove variations, quality gate report, and MIDI export.

SUCCESS CRITERIA
  [x] Returns a FullSession for a synthetic WAV
  [x] qualityGateReport is present and has all gates
  [x] midiBuffer is a non-empty Buffer


E-21 — LANE SIMILARITY MATRIX
─────────────────────────────────────────
Phase:  Engine — Phase D (Audio-CTL Alignment)
Status: [x] Complete

PROBLEM DEFINITION
  → Selecting related lanes for blending required manual knowledge of which
    subgenres are sonically close. No data structure existed for pairwise
    lane similarity.

SOLUTION
  → computeLaneSimilarityMatrix: symmetric 8×8 cosine similarity matrix
    over LANE_WEIGHTS feature vectors. Returns a LaneSimilarityMatrix with
    all 28 unique pairs.

SUCCESS CRITERIA
  [x] Matrix is symmetric
  [x] Diagonal entries are 1.0
  [x] All 8×8 entries present


E-22 — GROOVE COMPLEXITY SCORER
─────────────────────────────────────────
Phase:  Engine — Phase D (Audio-CTL Alignment)
Status: [x] Complete

PROBLEM DEFINITION
  → Producers had no objective measure of groove complexity. Fills and
    variations were added without knowing whether the pattern was already
    dense, leading to overcrowded arrangements.

SOLUTION
  → scoreGrooveComplexity: voice-level complexity analysis (density,
    syncopation, polyrhythm) returning GrooveComplexityScore with an
    overall ComplexityTier (minimal/sparse/moderate/complex/dense).

SUCCESS CRITERIA
  [x] Returns a tier for any GroovePlan
  [x] Denser pattern scores higher tier
  [x] All VoiceComplexity scores in [0, 1]


E-23 — KEY TRANSPOSER
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → ChordProgressions were generated in a fixed key with no utility to
    shift them to a target key for remixing or vocal matching.

SOLUTION
  → transposeProgression: shifts all MIDI notes by the semitone delta
    between source and target key names. Returns TransposeResult with
    transposed progression and delta.

SUCCESS CRITERIA
  [x] All notes shifted by correct semitone count
  [x] C→G transposes by +7 semitones
  [x] Notes clamped to [0, 127]


E-24 — STEM GAIN AUTOMATOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Mix specs had static stem gains. There was no way to automate gain
    changes across the arrangement arc — building the log drum through a
    breakdown, dropping it in the outro.

SOLUTION
  → automateGains: maps ArrangementArc + MixSpec to GainAutomation with a
    StemGainCurve per stem. GainPoints at section boundaries derived from
    arc energy targets.

SUCCESS CRITERIA
  [x] Every stem in MixSpec gets a curve
  [x] GainPoints at section boundary ticks
  [x] Drop sections have highest gain


E-25 — SIDECHAIN PATTERN GENERATOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → No sidechain curve matched the kick pattern. The pumping feel
    characteristic of Amapiano bass lines was unrepresentable in
    the engine's MIDI/automation output.

SOLUTION
  → generateSidechain: kick step array + SidechainOptions (attack, release,
    depth, ticksPerStep) → SidechainCurve with gain control points timed
    to each kick hit.

SUCCESS CRITERIA
  [x] One gain dip per kick hit
  [x] Recovery reaches 1.0 before next kick
  [x] Depth parameter controls dip magnitude


E-26 — FILTER AUTOMATION GENERATOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Arrangement arcs changed energy targets but had no effect on filter
    state. Builds and breakdowns sounded flat without automated filter sweeps.

SOLUTION
  → generateFilterAutomation: ArrangementArc → FilterAutomation with
    FilterPoints at each section boundary. Build sweeps cutoff up;
    breakdowns sweep down; drops open fully.

SUCCESS CRITERIA
  [x] FilterPoints at every section boundary
  [x] Drop section has highest cutoff
  [x] Breakdown section has lowest cutoff


E-27 — REVERB TAIL CALCULATOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Reverb settings were hardcoded regardless of audio features or lane,
    leading to reverb that clashed with the dry/wet balance of the material.

SOLUTION
  → calculateReverb: derives ReverbParams (roomSize, preDelayMs, decayS,
    wetDry, earlyReflections) from AudioFeatures + lane with Amapiano
    standards encoded as calibrated defaults.

SUCCESS CRITERIA
  [x] Returns valid ReverbSpec for any lane
  [x] preDelayMs in [0, 50]
  [x] decayS shorter for percussive lanes


E-28 — COMPRESSOR SETTINGS GENERATOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Compressor thresholds and ratios were hardcoded per stem with no
    adaptation to the actual dynamics of the audio being processed.

SOLUTION
  → generateCompressorSpec: derives CompressorParams (threshold, ratio,
    attack, release, knee, makeupGain) per stem from RMS energy and lane.
    Returns a CompressorSpec for all stems.

SUCCESS CRITERIA
  [x] All stems have valid compressor params
  [x] Ratio in [1.5, 20] for all stems
  [x] Attack faster for percussive stems


E-29 — EQ CURVE GENERATOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → The engine identified tonal imbalances from spectral analysis but had
    no module that translated those findings into EQ band settings.

SOLUTION
  → generateEqSpec: derives per-stem StemEq (up to 6 EqBand entries:
    highpass, low-shelf, parametric ×2, high-shelf, lowpass) from
    AudioFeatures and lane. Returns EqSpec for all stems.

SUCCESS CRITERIA
  [x] Each stem has at least a highpass and one parametric band
  [x] All frequency values in [20, 20000] Hz
  [x] Gain values in [-18, +12] dB


E-30 — VOCAL CHOP SCHEDULER
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → No system existed for scheduling vocal chop events against a groove
    grid. Vocal phrases were placed manually with no regard for groove
    density, section type, or rhythmic feel.

SOLUTION
  → scheduleVocalChops: GroovePlan + ChopOptions (density, length, seed) →
    VocalChopPattern with ChopEvent entries on valid 16th-note grid
    positions via hashString-seeded selection.

SUCCESS CRITERIA
  [x] All chop events land on valid 16th-note positions
  [x] Same seed produces same schedule
  [x] density parameter controls event count


E-31 — STEREO WIDTH AUTOMATOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Stereo width was fixed per stem regardless of section. Builds and drops
    sounded identically wide, removing a key spatial production tool.

SOLUTION
  → generateWidthAutomation: ArrangementArc → WidthAutomation with
    WidthPoints at section boundaries. Drops widest; intros and breakdowns
    narrower for contrast.

SUCCESS CRITERIA
  [x] WidthPoints at all section boundaries
  [x] Drop section width >= breakdown section width
  [x] All width values in [0, 1]


E-32 — SCALE QUANTIZER
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → MIDI notes from the arpeggiator and chord engines could land outside
    the target scale, producing dissonant output that passed quality gates
    but offended melodic expectations.

SOLUTION
  → quantizeToScale: snaps each MIDI note to the nearest in-scale note
    (13 built-in scales via SCALE_INTERVALS). Returns ScaleQuantizeResult
    with original and quantized arrays.

SUCCESS CRITERIA
  [x] All output notes are valid scale degrees
  [x] Notes never moved by more than 6 semitones
  [x] SCALE_INTERVALS covers major, minor, pentatonic, dorian, phrygian


E-33 — HARMONIC TENSION SCORER
─────────────────────────────────────────
Phase:  Engine — Phase D (Audio-CTL Alignment)
Status: [x] Complete

PROBLEM DEFINITION
  → Chord progressions had voicing and duration but no tension arc.
    There was no signal for when a progression was harmonically stale
    vs. building toward a resolution.

SOLUTION
  → scoreTension: assigns TensionLabel (low/medium/high/peak) and numeric
    tension score [0,1] per chord based on interval dissonance, voice
    leading distance, and ChordFunction. Returns TensionArc.

SUCCESS CRITERIA
  [x] Dominant chords score higher tension than tonic
  [x] Tension arc has one entry per chord
  [x] Final chord resolves to lower tension


E-34 — SONG STRUCTURE VALIDATOR
─────────────────────────────────────────
Phase:  Engine — Phase D (Audio-CTL Alignment)
Status: [x] Complete

PROBLEM DEFINITION
  → Arrangement arcs could be generated with structural violations: sections
    too short, drops missing, outro absent. No gatekeeper enforced minimum
    Amapiano structure rules before export.

SOLUTION
  → validateStructure: evaluates ArrangementArc against StructureRules
    (min/max section lengths, required sections, ordering) and returns
    StructureValidation with per-rule pass/fail and remediation suggestions.

SUCCESS CRITERIA
  [x] Flags arc missing a drop section
  [x] Flags arc with intro shorter than 4 bars
  [x] Overall valid is false if any rule fails


E-35 — CALL-AND-RESPONSE GENERATOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Groove plans were monophonic — one pattern repeated. Amapiano is
    structurally built on call-and-response; there was no engine primitive
    for the conversational phrase form that defines the genre.

SOLUTION
  → generateCallResponse: takes a call GroovePlan and generates a response
    pattern sharing rhythmic DNA but introducing variation through inversion,
    displacement, or density reduction.

SUCCESS CRITERIA
  [x] Response has same totalBars as call
  [x] Response is not identical to call
  [x] Both call and response are valid GroovePlans


E-36 — MIDI NOTE DEDUPLICATOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Layering groove patterns and chord exports produced duplicate MIDI note
    events at the same tick and pitch. DAWs either ignored duplicates or
    produced double-triggered notes with velocity artefacts.

SOLUTION
  → deduplicateMidi: removes events where tick + midiNote are identical,
    keeping the higher-velocity duplicate. Returns DeduplicateResult with
    deduplicated array and removed count.

SUCCESS CRITERIA
  [x] Output has no duplicate tick+note pairs
  [x] Higher-velocity duplicate is kept
  [x] removedCount = input.length − output.length


E-37 — PATTERN VELOCITY SHAPER
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → MIDI exports had flat velocity across all steps. There was no module
    that applied a velocity shape (ramp, arc, wave) to an existing note
    array — the accent map only covered groove plans.

SOLUTION
  → shapeVelocities: applies VelocityShape (ramp_up/ramp_down/arch/valley/
    flat) to a MidiNoteEvent array, scaling each event's velocity by the
    shape value at that position.

SUCCESS CRITERIA
  [x] ramp_up produces monotonically increasing velocities
  [x] arch produces a bell-curve profile
  [x] All output velocities clamped to [1, 127]


E-38 — GROOVE SWING QUANTIZER
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Quantised patterns were perfectly on-grid. Amapiano's feel depends on
    16th-note swing variation that could not be applied after the fact to
    an existing MIDI event array.

SOLUTION
  → quantizeSwing: displaces every odd-position 16th note forward in time.
    swingRatio = 0.5 + (pct/100)×0.25, mapping swing percentage to the
    [0.5, 0.75] tick ratio range.

SUCCESS CRITERIA
  [x] 50% swing produces no displacement
  [x] 100% swing displaces odd notes by 0.25 × ticksPerBeat
  [x] Even-position notes are not moved


E-39 — STEM MUTE AUTOMATOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Arrangement arcs specified energy levels per section but stems played
    continuously. There was no automated mute schedule that silenced stems
    in appropriate sections (sub_bass in intro, etc.).

SOLUTION
  → generateMuteSchedule: maps stems + ArrangementArc to MuteSchedule with
    StemMuteEvent entries (stem, startTick, endTick). Amapiano-standard
    rules: log_drum never muted; sub_bass muted in intro/breakdown/outro.

SUCCESS CRITERIA
  [x] log_drum has zero mute events
  [x] sub_bass is muted in intro section
  [x] All events have startTick < endTick


E-40 — GROOVE DENSITY NORMALIZER
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Groove complexity scores could flag patterns as too dense or too sparse,
    but there was no module to automatically adjust note density to a target
    level without changing the essential pattern character.

SOLUTION
  → normalizeDensity: if density > target, removes hits (seeded); if <
    target, adds hits at empty steps. Returns DensityNormalizeResult with
    adjusted plan and actual density achieved.

SUCCESS CRITERIA
  [x] Output density within ±0.1 of target
  [x] Same seed produces same normalization
  [x] Essential hits (kick on beat 1) preserved


E-41 — BAR-TO-TICK CONVERTER
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Multiple modules computed ticks independently using different local
    formulas. Inconsistent ticksPerBeat defaults produced MIDI files where
    events from different modules were out of sync.

SOLUTION
  → buildTickMap: given totalBars, ticksPerBeat, beatsPerBar, returns a
    TickMap with SectionTickRange for every bar. Single source of truth
    for all tick arithmetic in the pipeline.

SUCCESS CRITERIA
  [x] bar=0, beat=0 → tick=0
  [x] bar=1, beat=0 → tick=ticksPerBeat×beatsPerBar
  [x] All section ranges non-overlapping and contiguous


E-42 — PATTERN RETROGRADE
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Variation generation used forward-only mutations. Retrograde
    (time-reversal) is a classical technique that produces dramatically
    different feel from the same rhythmic material — it was missing.

SOLUTION
  → retrogradePattern: reverses the step sequence of a GroovePlan's hit
    array while preserving totalBars and ticksPerBar. Returns RetrogradResult.

SUCCESS CRITERIA
  [x] Output step array is exact reverse of input
  [x] totalBars unchanged
  [x] Applying retrograde twice returns the original


E-43 — EUCLIDEAN RHYTHM GENERATOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Groove patterns were hand-authored or library-selected. No algorithmic
    generator could produce rhythmically even, culturally authentic patterns
    from just a hit count and step count.

SOLUTION
  → generateEuclidean: Bjorklund algorithm distributes hits as evenly as
    possible across steps. Returns EuclideanResult with a (0|1)[] pattern.

SUCCESS CRITERIA
  [x] E(3,8) = [1,0,0,1,0,0,1,0]
  [x] Sum of pattern equals hits
  [x] Pattern length equals steps


E-44 — POLYRHYTHM LAYER GENERATOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → The engine generated single-rhythm patterns. Amapiano's signature feel
    comes from layering conflicting subdivisions (3-against-4, 5-against-8)
    — there was no module that created and merged polyrhythm layers.

SOLUTION
  → generatePolyrhythm: takes PolyrhythmLayer array (each with hits+steps),
    combines over LCM grid length, returns PolyrhythmResult with each
    layer's expanded pattern and merged output.

SUCCESS CRITERIA
  [x] Merged pattern length equals LCM of all step values
  [x] Each layer's hits are present in the merged output
  [x] [3,8]×[4,8] produces correct 8-step merged grid


E-45 — GROOVE PATTERN COMBINER
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Patterns from different sources could not be merged without manual
    step-by-step work. No clean combine utility existed with defined
    conflict-resolution semantics.

SOLUTION
  → combinePatterns: takes two (0|1)[] arrays and CombineMode (or/and/xor).
    Returns CombineResult with combined array and hit-count stats.

SUCCESS CRITERIA
  [x] OR of [1,0,1,0] and [0,1,0,1] = [1,1,1,1]
  [x] AND of [1,1,0,0] and [1,0,1,0] = [1,0,0,0]
  [x] XOR of [1,1,0,0] and [1,0,1,0] = [0,1,1,0]


E-46 — NOTE QUANTIZER
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → MIDI events from humanization and variation had fractional tick positions.
    DAWs that require strict grid quantization rejected or misread these files.

SOLUTION
  → quantizeNotes: snaps MidiNoteEvent tick values to the nearest multiple
    of a QuantizeResolution (1/4, 1/8, 1/16, 1/32 note in ticks). Returns
    QuantizeNoteResult with quantized events and displacement stats.

SUCCESS CRITERIA
  [x] All output ticks are multiples of the resolution
  [x] Maximum tick displacement ≤ resolution/2
  [x] Note order preserved


E-47 — CHORD STAB PATTERN GENERATOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → The chord voicing engine produced progressions but had no rhythmic
    placement concept. Piano and organ stabs in Amapiano have specific
    off-beat placement patterns that needed a dedicated generator.

SOLUTION
  → generateChordStab: chord (MIDI notes) + StabOptions (pattern type,
    velocity, duration, ticksPerStep) → StabPattern with MidiNoteEvent
    entries at stab rhythmic positions.

SUCCESS CRITERIA
  [x] Stab positions are on valid off-beat steps
  [x] All chord notes present at each stab position
  [x] Velocity and duration match StabOptions


E-48 — GROOVE ENERGY PROFILE
─────────────────────────────────────────
Phase:  Engine — Phase D (Audio-CTL Alignment)
Status: [x] Complete

PROBLEM DEFINITION
  → The arrangement arc defined target energy per section but there was no
    per-section readout of actual energy contribution from groove elements.
    Producers could not verify whether a breakdown had actually dropped energy.

SOLUTION
  → computeEnergyProfile: GroovePlan + ArrangementArc → EnergyProfile with
    an EnergyLayer per stem per section. Energy = hit density × velocity product.

SUCCESS CRITERIA
  [x] Profile covers all sections in the arc
  [x] Drop section has highest energy layer sum
  [x] Breakdown section lower than drop


E-49 — SECTION TRANSITION FILL GENERATOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Section transitions were abrupt. No transition fill generator could
    place a 1–2 bar drum fill or riser at the exact boundary between
    sections.

SOLUTION
  → generateTransitionFill: source section + target section + lane +
    FillOptions (fillBars, seed) → TransitionFill with hit pattern
    appropriate for the transition type.

SUCCESS CRITERIA
  [x] Fill length equals fillBars
  [x] build_to_drop fills are denser than breakdown_to_build
  [x] Same seed produces same fill


E-50 — PITCH BEND CURVE GENERATOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Melodic MIDI exports had no pitch bend events. Log drum glide — a
    defining Amapiano timbral feature — required pitch bend automation
    that no module could produce.

SOLUTION
  → generatePitchBend: PitchBendShape (glide_up/glide_down/wobble/vibrato)
    + PitchBendOptions (durationTicks, depth, resolution) → PitchBendCurve
    with PitchBendPoint entries.

SUCCESS CRITERIA
  [x] glide_up produces monotonically increasing bend values
  [x] wobble produces a sinusoidal curve
  [x] All bend values in [-8192, 8191]


E-51 — MIDI CC AUTOMATION GENERATOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → MIDI exports had note events only. Filter sweeps, modulation, and
    expression changes required CC automation events the engine could not
    generate.

SOLUTION
  → generateCcAutomation: CcShape (ramp_up/ramp_down/swell/dip/flat) +
    CcAutomationOptions (durationTicks, minValue, maxValue, resolution, CC
    number) → CcAutomation with CcPoint entries.

SUCCESS CRITERIA
  [x] ramp_up produces monotonically increasing CC values
  [x] swell peaks at mid-point
  [x] All CC values in [0, 127]


E-52 — BPM TAP ANALYZER
─────────────────────────────────────────
Phase:  Engine — Phase D (Audio-CTL Alignment)
Status: [x] Complete

PROBLEM DEFINITION
  → There was no way to derive BPM from a human tap sequence. Live
    production workflows require tap-in BPM alongside audio-analysis BPM
    for reconciliation and manual override.

SOLUTION
  → analyzeTaps: array of tap timestamps (ms) → TapAnalysis with estimated
    BPM, inter-tap interval stats (mean, stddev, cv), and confidence score
    based on tap regularity.

SUCCESS CRITERIA
  [x] 4 taps at 500 ms intervals → BPM = 120
  [x] Irregular taps produce low confidence
  [x] confidence in [0, 1]


E-53 — PROBABILISTIC STEP SEQUENCER
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Groove patterns were deterministic. Amapiano performance introduces
    controlled randomness — a hit that fires 70% of the time feels organic
    in a way a fixed pattern cannot replicate.

SOLUTION
  → resolveProb: ProbabilisticPattern (step probability array [0,1]) + seed
    → concrete (0|1)[] step pattern by comparing each probability against a
    hashString-derived value.

SUCCESS CRITERIA
  [x] Steps with probability 1.0 always fire
  [x] Steps with probability 0.0 never fire
  [x] Same seed produces same pattern


E-54 — TEMPO RAMP GENERATOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → MIDI exports had no tempo automation. Gradual BPM ramps (common in
    live Amapiano DJ sets and producer builds) were impossible to represent
    in the exported TempoMap.

SOLUTION
  → generateTempoRamp: TempoMap with one TempoPoint per bar, interpolating
    startBpm → endBpm using linear or exponential shapes.
    tick(bar) = (startBar + bar) × ticksPerBeat × beatsPerBar.

SUCCESS CRITERIA
  [x] linear ramp: BPM increases uniformly
  [x] exponential ramp: BPM follows power curve
  [x] startBpm=endBpm → all points same BPM


E-55 — MIDI DRUM MAPPER
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Groove plan drum hits referenced logical parts (kick, snare, log_drum)
    but MIDI export required concrete note numbers. Different DAWs and drum
    machines use different mappings — no lookup table existed.

SOLUTION
  → buildDrumMap: DrumMapResult (14 parts × MIDI note + name) for requested
    layout (gm/tr808/tr909/ableton). resolveDrumNote: single lookup for a
    specific part+layout.

SUCCESS CRITERIA
  [x] GM kick = note 36
  [x] TR-909 tom_high = note 48
  [x] All 4 layouts map all 14 parts


E-56 — MIDI ARPEGGIATOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → No module converted a chord into a time-sequenced arpeggio. Piano and
    synth leads in Amapiano frequently use arpeggiated patterns the engine
    could not generate.

SOLUTION
  → generateArpeggio: chord (MIDI notes) + mode (up/down/up_down/down_up/
    random) + steps + octaves + timing options → ArpResult with ArpNote
    events at calculated tick positions.

SUCCESS CRITERIA
  [x] up mode produces ascending note order
  [x] up_down cycles without repeating endpoints
  [x] octaves=2 includes notes one octave higher


E-57 — NOTE STUTTER GENERATOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → No way to generate a rapid-fire repeat (stutter/roll) of a single note
    within a tick window. This effect is central to Amapiano log drum fills
    and transition moments.

SOLUTION
  → generateStutter: midiNote repeated N times within windowTicks using
    StutterShape (flat/accelerate/decelerate/crescendo/decrescendo) to
    control both spacing and velocity over the window.

SUCCESS CRITERIA
  [x] accelerate: spacing decreases toward window end
  [x] crescendo: velocity increases across repeats
  [x] All durationTicks positive


E-58 — GHOST NOTE INJECTOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → Drum patterns had only main hits. Ghost notes (low-velocity snare/hat
    hits between main beats) give Amapiano grooves their felt texture —
    there was no module to insert them.

SOLUTION
  → injectGhostNotes: scans empty steps, selects a density fraction via
    hashString-seeded PRNG, places ghost notes with velocity in
    [minVelocity, maxVelocity].

SUCCESS CRITERIA
  [x] density=1 fills every empty step
  [x] density=0 produces no ghosts
  [x] No ghost lands on an occupied step


E-59 — NOTE ECHO
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → MIDI exports had no delay-effect representation. Echo repeats with
    velocity decay — a staple of Amapiano mixing — could not be encoded
    in the exported MIDI.

SOLUTION
  → generateEcho: N echo repeats at delayTicks intervals.
    velocity of echo i = round(initVelocity × decay^i).
    Stops early when velocity < minVelocity.

SUCCESS CRITERIA
  [x] velocity decreases with each repeat
  [x] decay=1 keeps velocity constant
  [x] stops early below minVelocity threshold


E-60 — CHORD INVERSION GENERATOR
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → The chord voicing engine returned root-position chords only. Voice
    leading between chords required inversions, but no module generated
    all valid close-position inversions.

SOLUTION
  → generateInversions: n successive bass-note octave-shifts to produce
    root/first/second/third inversions. Only generates inversions valid
    for the chord size (triad → 3 max).

SUCCESS CRITERIA
  [x] Triad generates exactly root + first + second
  [x] Third inversion only for 4-note chords
  [x] types filter restricts output to requested inversions


E-61 — VELOCITY ACCENT MAP
─────────────────────────────────────────
Phase:  Engine — Phase C (Generation Wiring)
Status: [x] Complete

PROBLEM DEFINITION
  → MIDI patterns had flat velocity across all steps. Applying accent
    patterns manually to every new pattern was repetitive and inconsistent
    across producers and sessions.

SOLUTION
  → generateVelocityMap: maps N steps to velocities using a repeating ratio
    cycle. Presets: amapiano (1.00/0.85/0.65/0.50), straight (4/4 downbeat),
    flat (uniform). velocity = round(floor + ratio × (peak − floor)).

SUCCESS CRITERIA
  [x] amapiano step 0 has peak velocity
  [x] flat preset produces identical velocity on all steps
  [x] customRatios overrides preset and marks result as "custom"


E-62 — STREAM ANALYZER
─────────────────────────────────────────
Phase:  Engine — Phase F (Streaming Analysis) — CLOSES PHASE F
Status: [x] Complete

PROBLEM DEFINITION
  → The engine only analysed complete audio buffers. Real-time production
    workflows — live monitoring, DJ performance, recording sessions —
    require frame-by-frame analysis without waiting for a full buffer.
  → Phase F was partially addressed by runFullSession; this closes the
    streaming dimension that remained open.

SOLUTION
  → StreamAnalyzer class: pushFrame() accepts fixed-size frames, maintains a
    rolling sample window, computes RMS energy per frame, and estimates BPM +
    spectral centroid from the window once filled. flush() forces a final
    estimate from whatever audio has accumulated.

SUCCESS CRITERIA
  [x] bpmEstimate is null before window fills, number after
  [x] rmsEnergy is 0 for silent frames, > 0 for non-silent
  [x] reset() clears all state and restores null estimates


E-63 — ENGINE METRICS COLLECTOR
─────────────────────────────────────────
Phase:  Engine — Phase G (Observability) — CLOSES PHASE G
Status: [x] Complete

PROBLEM DEFINITION
  → Engine pipeline runs produced results but no structured telemetry.
    There was no way to observe pass rates, average quality scores, or
    latency trends across a session without manual logging.
  → Phase G was partially addressed by drift detector + production report;
    this closes the metrics/observability dimension that remained open.

SOLUTION
  → MetricsCollector class: record() stores durationMs, qualityScore,
    passed, lane, error with auto-generated runId and timestamp.
    snapshot() returns totalRuns, passed, failed, avgDurationMs, avgQuality,
    recentRuns sorted by timestamp. reset() clears all metrics.

SUCCESS CRITERIA
  [x] snapshot() counts pass/fail correctly
  [x] avgDurationMs and avgQuality computed correctly
  [x] recentRuns sorted desc, limited by limit param


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Phase H — Platform Integration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---
### JOB H-01 — Engine Quality Gate Integration
---

PROBLEM DEFINITION
  The generation worker's post-download quality check was a 3-signal heuristic:
  contrastScore = 0.50×bpmScore + 0.30×energyScore + 0.20×onsetScore, threshold 0.6.
  It required a round-trip to the Python audio service, could be bypassed when the
  service was unavailable, and evaluated only BPM proximity to 110 — ignoring
  authenticity, cultural alignment, O.211 perception compliance, producer quality,
  and stem balance. Tracks with structurally wrong Amapiano character could pass.

SOLUTION
  Replace step 4a in the generation worker with direct engine evaluation:
    evaluateBuffer(audioBuffer) → AmapianEvaluation (full engine analysis)
    runQualityGates(evaluation) → QualityGateReport (5 gates, grade S/A/B/C/F)
  No audio service round-trip — the WAV buffer downloaded from Replicate is
  evaluated inline. If the buffer is not parseable as 16-bit PCM WAV the gate
  is skipped and the generation advances (graceful fallback). Gate failures write
  status "gate_failed" with a gate_report JSON payload (grade, overallScore,
  passCount, failingGates, summary) into the generation record metadata column.
  Passing generations continue to "complete" as before, now carrying grade +
  overallScore in the worker return value. The legacy mode2QualityGate.ts file
  is preserved for the pre-generation BPM pre-check (validateMode2Bpm) used
  in the generation agent.

SUCCESS CRITERIA
  [x] evaluateBuffer + runQualityGates called on the downloaded audio buffer
  [x] readyForRelease: false → status "gate_failed", metadata.gate_report populated
  [x] evaluateBuffer throws → gate skipped → status "complete" (no false negatives)


---
### JOB H-02 — MetricsCollector API Endpoint
---

PROBLEM DEFINITION
  The engine's MetricsCollector (Phase G, E-63) had no surface in the API —
  pipeline observability data was trapped inside the worker process with no way
  to query pass/fail counts, average quality, or recent run history. Operators
  had no visibility into generation quality trends across the fleet.

SOLUTION
  Create a process-level singleton MetricsCollector (apps/api/src/lib/metricsCollector.ts)
  shared by the generation worker and the new engine router. Wire timing + result
  recording into the worker's step 4a: durationMs covers the evaluateBuffer +
  runQualityGates call, qualityScore = gateReport.overallScore, passed =
  gateReport.readyForRelease, lane = gateReport.lane. When the buffer is
  unparseable, record passed=true with error="buffer_unparseable" (consistent
  with the skip-on-error fallback). Two endpoints:
    GET  /api/engine/metrics?limit=N  — MetricsSnapshot (totalRuns, passed,
                                        failed, avgDurationMs, avgQuality,
                                        recentRuns[limit])
    POST /api/engine/metrics/reset    — clear all metrics, 204 No Content
  limit clamped to [1, 100], NaN falls back to 10.

SUCCESS CRITERIA
  [x] GET /api/engine/metrics returns correct snapshot shape with all 6 fields
  [x] limit query param clamped correctly (min 1, max 100, NaN → 10)
  [x] POST /api/engine/metrics/reset calls collector.reset() and returns 204


---
### JOB H-03 — Production Report Endpoint
---

PROBLEM DEFINITION
  The engine's generateProductionReport (E-16) — which orchestrates quality
  gates, mix spec, sample recommendations, and arrangement arc into a single
  consolidated report — had no API surface. Producers had no way to request
  an actionable breakdown of a track's production quality without running the
  engine locally.

SOLUTION
  Add POST /api/tracks/:id/report to the tracks router. The handler:
    1. Confirms the track exists (404 if not)
    2. Fetches the latest raw_generation audio file from audio_files (422 if none)
    3. Downloads the WAV buffer from Supabase storage aura-x-audio bucket
    4. Calls evaluateBuffer(buffer) → AmapianEvaluation
    5. Calls generateProductionReport(evaluation) → ProductionReport
    6. Returns the full report as JSON
  Non-WAV / unparseable buffers return 422. Storage failures return 500.
  No auth required (read-only, compute-only — no writes).

SUCCESS CRITERIA
  [x] 200 + full ProductionReport JSON when track + audio exist
  [x] 404/422/500 guard cases all handled and tested
  [x] 15 prior tracks tests still green (no regressions)


---
### JOB H-04 — Engine Harmony Voicing Integration
---

PROBLEM DEFINITION
  The ac-ami harmony planner (planHarmony) produced abstract CTL-level parameters
  (tonal_center, extension_policy, harmonic_rhythm) but had no path to concrete
  MIDI note output. Producers received chord names and progression labels but not
  the actual MIDI voicings they could use in a DAW. The engine's buildChordProgression
  and generateInversions (E-17 / E-60) were unused by the planning pipeline.

SOLUTION
  Add planHarmonyWithVoicings(ctl, opts) to packages/ac-ami/src/harmony/harmonyPlanner.ts.
  The function chains the full pipeline:
    planHarmony(ctl, opts) → abstract HarmonyPlan (tonal_center, mode, etc.)
    buildChordProgression({ lane }) → ChordProgression (4 voicings, MIDI notes, tension)
    generateInversions({ notes }) per voicing → InversionSet (root + close-position inversions)
  Returns HarmonyPlanWithVoicings — all HarmonyPlan fields plus voicings + inversions[].
  The CTL subgenre maps 1:1 to the engine Lane type. Added @aura-x/engine as a
  workspace dependency of @aura-x/ac-ami. Exported from ac-ami/src/index.ts.

SUCCESS CRITERIA
  [x] planHarmonyWithVoicings returns both abstract plan and 4 concrete MIDI voicings
  [x] Each voicing has root + valid close-position inversions via generateInversions
  [x] All 8 presets work without throwing; 18 existing harmony tests unaffected


---
### JOB H-05 — Engine Groove Variation Integration
---

PROBLEM DEFINITION
  The ac-ami groove planner (planGroove) produced CTL-level GroovePattern[]
  (abstract velocity/swing-adapted patterns) but had no path to the engine's
  richer variation system: named structural variants (main/fill/breakdown/build),
  swing-aware humanized timing per hit, or MIDI-tick quantized kick positions.
  The engine's generateGrooveVariations, humanizePattern, and quantizeSwing
  were unused by the planning pipeline.

SOLUTION
  Add planGrooveWithVariations(ctl, opts) to packages/ac-ami/src/groove/groovePlanner.ts.
  The function chains the full pipeline:
    planGroove(ctl, opts) → GroovePattern[] (existing CTL-level patterns)
    generateGrooveVariations(lane, { bpm }) → GrooveVariationSet (5 engine variants)
    humanizePattern(variationSet.main, { bpm, humanness }) → HumanizedPattern (timing offsets per hit)
    quantizeSwing(kickSteps, { swingPercent }) → SwingResult (kick ticks with swing)
  Kick active steps extracted from kickPattern as indices. SwingPercent derived
  from variationSet.swing ratio: (swing - 0.5) / 0.5 × 100. Returns
  GroovePlanWithVariations — all four outputs in one call.

SUCCESS CRITERIA
  [x] variationSet has all 5 named variants; lane + bpm match CTL values
  [x] humanized.hits non-empty with step/voice/offsetMs/velocityScale per hit
  [x] kickSwing.tickPositions are non-negative integers; 20 existing tests unaffected


---
### JOB H-06 — MIDI Download Endpoint
---

PROBLEM DEFINITION
  The engine's DAW export layer (exportGrooveToMidi, exportChordProgressionToMidi)
  produced Standard MIDI files but had no API surface. Producers using Mode 1 or
  Mode 2 generation had no way to download a MIDI file for the track's groove or
  chord progression without running the engine locally.

SOLUTION
  Add GET /api/tracks/:id/midi to the tracks router. The endpoint:
    1. Fetches track metadata (subgenre, bpm) — no audio needed
    2. Routes on ?track=drums|chords (default drums), ?bars=1-32 (default 4)
    3. drums: generateGrooveVariations(lane, {bpm}) → exportGrooveToMidi(main, bpm, bars)
    4. chords: buildChordProgression({lane}) → exportChordProgressionToMidi({bpm, ...})
    5. Sets Content-Type: audio/midi, Content-Disposition: attachment, sends Buffer
  Filename sanitized from track.title (non-alphanumeric → underscore).
  bars param clamped to [1, 32] with isNaN fallback to 4.
  Invalid ?track value returns 400.

SUCCESS CRITERIA
  [x] drums + chords paths both return 200 with audio/midi Content-Type
  [x] bars param clamped correctly; ?track=invalid → 400
  [x] 25 prior tracks tests still green (no regressions)


---

### JOB H-07 — Webhook Retry / Outbound Producer Notifications
---

PROBLEM DEFINITION
  Mode 2 generation is asynchronous: the producer receives `status: "queued"`
  immediately and must poll GET /api/generate/status/:id to know when the job
  finishes. There was no push-based notification mechanism, so producers had to
  implement polling loops instead of reacting to events.

SOLUTION
  Added an outbound webhook delivery system:
    1. POST /api/generate now accepts optional `webhook_url` in the request body.
    2. `webhook_url` is threaded through GenerationRequest → enqueueMode2Completion
       → the BullMQ generation job payload so the worker has it at completion time.
    3. After each terminal state (complete / gate_failed / prediction failed),
       generationWorker enqueues a `webhook.deliver` job if `webhook_url` is present.
    4. A new `webhookWorker` (BullMQ "webhook" queue, concurrency 5) POSTs a JSON
       body `{ generation_id, event, ...payload }` to the producer-supplied URL.
    5. Retry policy: 5 attempts, exponential backoff 2s — rethrows on 5xx/network
       errors (retry) and returns `{ skipped }` on 4xx (no retry, job completes).
    6. `WebhookJobData` type + `_webhookQueue` + `enqueueWebhook` helper added to
       `queue/index.ts`. Queue created alongside audio-processing and generation.

SUCCESS CRITERIA
  [x] webhookWorker registered on "webhook" queue
  [x] 2xx → { delivered: true }; 4xx → { skipped: true } no throw; 5xx/net → throws
  [x] axios.post called with correct URL, body, timeout: 10000
  [x] generationWorker enqueues webhook on complete, gate_failed, prediction failed
  [x] No webhook enqueued when webhook_url absent
  [x] 434 tests passing, audio.test.ts pre-existing failures unchanged


---

### JOB H-08 — Rate Limiting Hardening
---

PROBLEM DEFINITION
  The API had no rate limiting — every endpoint was unthrottled. An attacker or
  runaway client could flood POST /api/generate with AI inference requests, brute-
  force POST /api/auth/login with OTP attempts, or hammer the evaluation pipeline,
  causing cost overruns and availability issues.

SOLUTION
  Added `express-rate-limit` (v8) with four tiered limiters in
  `src/middleware/rateLimit.ts`, wired into `src/index.ts`:
    - globalLimiter:     120 req / 15 min  — all routes (automatic scanning defence)
    - authLimiter:        10 req / 15 min  — /api/auth (brute-force OTP protection)
    - generationLimiter:  10 req / min     — /api/generate (AI inference cost guard)
    - evaluateLimiter:    20 req / min     — /api/evaluate (CPU-bound WAV analysis)
  All limiters use `standardHeaders: "draft-7"` (RateLimit + RateLimit-Policy) and
  `legacyHeaders: false` (no X-RateLimit-* headers). 429 body is `{ error: "..." }`.

SUCCESS CRITERIA
  [x] globalLimiter applied before all route handlers
  [x] authLimiter, generationLimiter, evaluateLimiter applied per-route
  [x] Request beyond max → 429 with error JSON body
  [x] draft-7 RateLimit headers present; legacy X-RateLimit-* absent
  [x] 15 rate-limit tests, 450 total passing


---

### JOB H-09 — RLS Audit
---

PROBLEM DEFINITION
  Five tables added in migrations 003–006 had no Row Level Security enabled.
  While the API uses the service_role key (which bypasses RLS), an attacker or
  misconfigured client with an anon/authenticated key could read or write
  gold_standard_generations, producer_feedback, artists (including password_hash),
  track_licenses, and royalty_splits without restriction.

SOLUTION
  Added `supabase/migrations/008_rls_audit.sql` which:
    1. Enables RLS on all 5 missing tables
    2. Adds service-all policies (`using (true) with check (true)`) consistent
       with the pattern from 001_initial_schema.sql
    3. Documents the full table-by-table audit in SQL comments
  The API client (lib/supabase.ts) correctly uses SUPABASE_SERVICE_ROLE_KEY
  which bypasses RLS at query time — the policies close the direct-access gap.

SUCCESS CRITERIA
  [x] 008_rls_audit.sql adds ENABLE ROW LEVEL SECURITY for all 5 affected tables
  [x] All 12 known tables now have RLS enabled and at least one policy
  [x] lib/supabase.ts confirmed to use SERVICE_ROLE_KEY (not anon key)
  [x] 15 audit tests, 465 total passing


---

### JOB H-10 — DNS / SSL Hardening
---

PROBLEM DEFINITION
  Railway terminates TLS and injects X-Forwarded-Proto, but the API had no
  HTTPS enforcement — a plain HTTP request would be served without redirect.
  Express also didn't trust the reverse proxy, so req.ip / req.protocol were
  wrong behind Railway. No security response headers (HSTS, X-Frame-Options,
  etc.) were set, leaving the API vulnerable to downgrade attacks and
  clickjacking once a custom domain is pointed at the service.

SOLUTION
  Added `src/middleware/security.ts` with two middleware functions:
    - httpsRedirect: in production, if X-Forwarded-Proto !== "https" → 301
      redirect to https:// equivalent. No-op in dev/test.
    - securityHeaders: sets Strict-Transport-Security (max-age=31536000;
      includeSubDomains), X-Content-Type-Options: nosniff, X-Frame-Options:
      DENY, Referrer-Policy: strict-origin-when-cross-origin on every response.
  In `src/index.ts`:
    - app.set("trust proxy", 1) — Express trusts Railway's X-Forwarded-* headers
    - httpsRedirect and securityHeaders applied before all other middleware
  DNS wiring (once domain is purchased):
    - CNAME api.okovanggo.ai → aura-x-production.up.railway.app
    - Set CORS_ORIGIN=https://app.okovanggo.ai in Railway service variables

SUCCESS CRITERIA
  [x] Plain HTTP in production → 301 to https:// (preserves path + query)
  [x] HTTPS in production → passes through normally
  [x] Non-production → no redirect
  [x] HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy on all responses
  [x] trust proxy: req.ip reflects X-Forwarded-For
  [x] 13 security tests, 478 total passing


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEW JOBS — append below this line
Copy JOB_TEMPLATE.md, fill in all sections, commit.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
