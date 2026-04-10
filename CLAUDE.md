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

## Current build
Phase 01 — Foundation. Job 01 complete.
Tests: 0 (first real tests come Job 02)
