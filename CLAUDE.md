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

### Tests passing: 26 (api) + 16 (suno-exporter) + 12 (ctl) = 54 total

### Phase 02 — AC-AMI Core (next)
- Job 08: CTL_v1 preset library (Private School, Bacardi, Sgija, Stixx, Mbiraiano)
- Job 09: Harmony planner (lineage-aware chord selection)
- Job 10: Groove planner (16-step patterns, microtiming, subgenre families)
- Job 11: Instrumentation planner (patch class selection)
- Job 12: Cultural lineage validator
- Job 13: Style + instrumentation + harmony validators
- Job 14: Mutation engine (9 targeted repairs)
- Job 15: Planner integration tests (all planners + validators end-to-end)
