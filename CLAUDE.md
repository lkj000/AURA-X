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
  api:               56
  ctl:               39
  suno-exporter:     16
  ac-ami:           126
  replicate-client:  12
  ──────────────────────
  Total:            249

### Phase 04 — Audio Production (next)
- Job 20: Demucs stem separation (drums, bass, vocals, other)
- Job 21: Stem storage + routing
- Job 22: Log drum extractor
- Job 23: Mixing engine (pedalboard channel strips)
- Job 24: EQ + compression chain
- Job 25: Reverb + space engine
- Job 26: Master chain
- Job 27: Production preset system
- Job 28: Render pipeline
- Job 29: Phase 04 gate test
