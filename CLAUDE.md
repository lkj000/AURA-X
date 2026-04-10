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

### Tests passing:
  api:            26
  ctl:            39
  suno-exporter:  16
  ac-ami:         112
  ──────────────────
  Total:          193

### Phase 03 — Generation Pipeline (next)
- Job 15: Replicate client (MusicGen, retry logic)
- Job 16: Mode 2 conditioning pipeline (CTL → MusicGen params)
- Job 17: Mode 3 Suno API stub (ready, dormant)
- Job 18: Generation agent (orchestrates Mode 1/2/3)
- Job 19: Subgenre preset packs for generation
- Job 20: Generation result storage
- Job 21: Suno upload ingestor (Mode 1 return path wired to queue)
- Job 22: Generation dashboard endpoint
