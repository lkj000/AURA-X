# AURA X — Web App

Next.js 15 frontend for the AURA X Amapiano AI platform.

**Live:** https://app.okovanggo.ai  
**API:** https://aura-x-production.up.railway.app

## Pages

| Route | Description |
|---|---|
| `/` | Landing / launch page |
| `/generate` | Track generation — subgenre, key (cultural default), BPM, emotional profile |
| `/studio` | Studio tools |
| `/analyse` | Track analysis |
| `/tracks` | Track library |
| `/tracks/[trackId]` | Track detail — scores, audio, Suno validation, CTL snapshot |
| `/amapianorize` | Upload any WAV → Amapiano analysis + dual-grid groove display + 8-bar preview |
| `/marketplace` | Track marketplace |
| `/earnings` | Producer earnings |
| `/dataset` | Dataset monitor |

## Dev

```bash
pnpm dev          # starts on port 3000
```

Requires `NEXT_PUBLIC_API_URL` in `.env.local` pointing at the API (default: `http://localhost:3002`).

## Key files

- `lib/utils.ts` — `cn`, score helpers, `SUBGENRES`, `SUBGENRE_DEFAULT_KEYS`, `SUBGENRE_DEFAULT_BPM`
- `lib/api.ts` — typed API client
- `app/amapianorize/page.tsx` — Amapianorizer: OfflineAudioContext synthesis, dual groove grid, diff panel
- `app/generate/page.tsx` — generation form with cultural key/BPM defaults per subgenre
