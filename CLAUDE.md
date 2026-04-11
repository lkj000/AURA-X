# AURA X — Amapiano AI Platform
Built by Okovanggo AI. Agentic build methodology — one job, one gate, one commit.

## Architecture
- apps/api: TypeScript/Express API (port 3002)
- apps/audio: Python/FastAPI audio service (port 8000)
- packages/ctl: Shared CTL_v1 schema (nervous system of all agents)

## Generation Modes
- Mode 1: CTL → Suno style + lyrics prompt (active from Job 05)
- Mode 2: CTL → Replicate/MusicGen direct audio (Phase 03, Job 19)
- Mode 3: CTL → Suno API (reserved, activates by config switch — zero code change)

## Dev notes
- API always runs on port 3002
- Audio service always runs on port 8000
- Never commit .env files
- Always run pnpm install from root
- TypeScript API: cd apps/api && npx ts-node src/index.ts
- Python audio: cd apps/audio && uvicorn main:app --reload --port 8000
- Health checks: curl http://localhost:3002/health && curl http://localhost:8000/health

## Build phases
- Phase 01 — Foundation (Jobs 01-08)
- Phase 02 — AC-AMI Core (Jobs 09-18)
- Phase 03 — Generation Pipeline (Jobs 19-28)
- Phase 04 — Audio Production (Jobs 29-38)
- Phase 05 — DJ Engine (Jobs 39-49)
- Phase 06 — Amapianorize (Jobs 50-58)
- Phase 07 — Agent Loop (Jobs 59-69)

## Build Status

### Phase 01 — Foundation ✓ COMPLETE
- Job 01 ✓ Monorepo scaffold (api port 3002, audio port 8000)
- Job 02 ✓ CTL_v1 schema (Zod, 13 blocks, 12 tests)
- Job 03 ✓ Supabase schema (6 tables + storage bucket, eu-west-2)
- Job 04 ✓ Mode 1 Suno exporter (AC-AMI translation, 16 tests)
- Job 05 ✓ Audio ingestion (upload → Supabase storage, signed URLs, 10 tests)
- Job 06 ✓ BullMQ queue (audio-processing + generation workers, 8 tests)
- Job 07 ✓ CI/CD (GitHub Actions 3-job pipeline, Railway Dockerfile)

### Phase 02 — AC-AMI Core ✓ COMPLETE
- Job 08 ✓ CTL preset library (8 subgenres, 27 preset tests)
- Job 09 ✓ Harmony planner (lineage-aware, 18 tests)
- Job 10 ✓ Groove planner (13 patterns, microtiming, 20 tests)
- Job 11 ✓ Instrumentation planner (patch classes, 18 tests)
- Job 12 ✓ Validator suite (lineage + style + inst + harmony, 22 tests)
- Job 13 ✓ Mutation engine (9 repairs, repairCTL loop, 18 tests)
- Job 14 ✓ Phase 02 integration test (all 8 presets, 16 tests)

### Phase 03 — Generation Pipeline ✓ COMPLETE
- Job 15 ✓ Replicate client (MusicGen, polling, retry, 12 tests)
- Job 16 ✓ Mode 2 CTL→MusicGen conditioning (14 tests)
- Job 17 ✓ Generation agent (Mode 1/2/3 orchestration, 12 tests)
- Job 18 ✓ Mode 2 completion worker (poll→download→store, 10 tests)
- Job 19 ✓ Suno upload ingestor (Mode 1 return path closed, 8 tests)

### Generation lifecycle — COMPLETE
Mode 1: CTL → Suno prompts → producer generates → uploads back
        → generation marked complete → analysis queued
Mode 2: CTL → MusicGen conditioning → Replicate prediction
        → worker polls → downloads audio → stores → analysis queued
Mode 3: Reserved. Architecture ready. Activates by config.

### Tests passing:
  api:               148
  ctl:                39
  suno-exporter:      16
  ac-ami:            156
  replicate-client:   12
  ───────────────────────
  Total:             371 (+ 42 Python)

### Phase 04 — Audio Production ✓ COMPLETE
- Job 20 ✓ Demucs stem separation (htdemucs, 4 stems)
- Job 21 ✓ Log drum extractor (FFT bandpass 60-300 Hz, onset gate)
- Job 22 ✓ Mixing engine (pedalboard, AC-AMI channel strips)
- Job 23 ✓ Master chain (stereo width + EQ + LUFS limiter)
- Job 24 ✓ Render pipeline (full chain: raw → stems → log drum → mix → master)

### Production pipeline endpoints:
  POST /api/audio/render/full   — full production chain
  POST /api/audio/mix/render    — mix only
  POST /api/audio/master/render — master only
  POST /stems/separate          — stems only
  POST /log-drum/extract        — log drum only

### Phase 05 — DJ Engine ✓ COMPLETE
- Job 25 ✓ Audio analysis — BPM + key (Krumhansl-Schmuckler)
- Job 26 ✓ Camelot wheel + track library + harmonic compatibility
- Job 27 ✓ DJ set planner — Amapiano energy arc, 5 phases
- Job 28 ✓ Set renderer — crossfade, log drum sync, hard cut

### DJ Engine endpoints:
  GET  /api/audio/dj/status   — capabilities, energy arc
  POST /api/audio/dj/render   — full set render (600s)

### Phase 06 — Amapianorize ✓ COMPLETE
- Job 29 ✓ Source analyzer (SourceProfile, character classification)
- Job 30 ✓ Rhythm transplant (BPM stretch + groove injection)
- Job 31 ✓ Harmonic anchor + full pipeline (POST /amapianorize/transform)

### Amapianorize pipeline:
  Any audio → analyze → separate → rhythm transplant →
  harmonic anchor → mix → master → Amapiano output

### Amapianorize endpoints:
  POST /api/audio/amapianorize/transform        — full pipeline (600s)
  POST /api/audio/amapianorize/analyze          — source profile only
  POST /api/audio/amapianorize/rhythm-transplant — rhythm only
  GET  /api/audio/amapianorize/grooves          — groove templates
  GET  /api/audio/amapianorize/status           — pipeline status

### Phase 07 — Agent Loop (next — FINAL PHASE)
- Job 32: Control fidelity evaluator
- Job 33: Authenticity scorer
- Job 34: Section-aware evaluator
- Job 35: Revision loop (evaluate → mutate → regenerate)
- Job 36: Experiment runner (ablations)
- Job 37: Results store (Supabase logging)
- Job 38: Weight tuner + feedback trainer
- Job 39: Dataset builder
- Job 40: Full agent gate test (goal → evaluated audio, autonomous)
