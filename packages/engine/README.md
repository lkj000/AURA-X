# @aura-x/engine

Superior TypeScript Amapiano intelligence engine. Zero runtime dependencies.

## Commands

```bash
cd packages/engine
npx jest --no-coverage          # run 912 tests
npx tsc --build                 # typecheck + compile
```

## Public API

All exports via `packages/engine/src/index.ts`.

### DSP Primitives
| Export | Description |
|---|---|
| `parseWavMono` | Parse WAV buffer to mono Float32Array |
| `fftInPlace`, `fftPadded`, `applyHann` | FFT utilities |
| `estimateBpm` | BPM from audio samples (needs ≥ 15 360 samples) |
| `spectralCentroidFft` | Spectral centroid in Hz |
| `computeRmsEnergy` | RMS energy in [0, 1] |
| `computeChroma` | 12-bin chroma vector |
| `onsetEnvelope` | Onset detection envelope |

### Audio Intelligence
| Export | Description |
|---|---|
| `extractAudioFeatures` | Full AudioFeatures from WAV buffer |
| `scoreAuthenticityLanes` | 8-lane authenticity scores |
| `scoreLaneQuality` | Per-lane quality metrics |
| `extractGroove` | GroovePattern from audio |
| `computeLaneSimilarityMatrix` | 8×8 pairwise lane similarity |

### High-End Engine
| Export | Description |
|---|---|
| `transferGroove` | Groove transfer between style templates |
| `evaluateRender` | 7-metric render evaluation |
| `ConvergenceTracker` | 4-condition convergence detection |
| `buildRefinementPlan` | Refinement action planner |

### Cultural + CTL
| Export | Description |
|---|---|
| `computeCulturalAlignment` | Cultural alignment score |
| `CULTURAL_PROFILES` | 8 geographic profiles |
| `synthesizeCtl` | CTLv1 from audio analysis |

### ML Engine
| Export | Description |
|---|---|
| `emptyPolicy` | Fresh ActionPolicy |
| `updatePolicy` | EMA policy update (alpha=0.25) |
| `computeActionScore` | Action utility score |
| `laneLeaderboard` | Ranked lane list |

### DAW Export
| Export | Description |
|---|---|
| `exportGrooveToMidi`, `groovePlanToMidi` | Groove → MIDI buffer |
| `exportChordProgressionToMidi` | Chord progression → MIDI |
| `deduplicateMidi` | Remove duplicate note events |
| `buildDrumMap`, `resolveDrumNote` | GM/TR-808/TR-909/Ableton drum maps |
| `buildTickMap` | Bar/beat/subdivision → tick conversion |
| `quantizeNotes` | Snap notes to grid resolution |
| `generateCcAutomation` | MIDI CC automation curves |

### Groove Modules (20)
`generateArpeggio` · `generateStutter` · `injectGhostNotes` · `generateEcho` ·
`generateVelocityMap` · `generateGrooveVariations` · `humanizePattern` ·
`generateSidechain` · `interpolateGrooves` · `shapeVelocities` ·
`quantizeSwing` · `normalizeDensity` · `retrogradePattern` ·
`generateEuclidean` · `generatePolyrhythm` · `combinePatterns` ·
`generateChordStab` · `generateCallResponse` · `scoreGrooveComplexity` ·
`resolveProb`

### Intelligence Modules (13)
`buildChordProgression` · `generateInversions` · `transposeProgression` ·
`quantizeToScale` · `scoreTension` · `generatePitchBend` ·
`scheduleVocalChops` · `recommendSamples` · `analyzeTaps` ·
`computeEnergyProfile` · `extractLogDrumFingerprint` ·
`analyzeHarmony` · `extractGroovePattern`

### Arrangement Modules (7)
`planArrangementArc` · `automateGains` · `generateFilterAutomation` ·
`generateWidthAutomation` · `generateMuteSchedule` · `generateTransitionFill` ·
`generateTempoRamp`

### Mix Modules (4)
`generateMixSpec` · `calculateReverb` · `generateCompressorSpec` · `generateEqSpec`

### Pipeline
| Export | Description |
|---|---|
| `analyzeAndPlan` | Full analysis → AnalysisPlan |
| `evaluateBuffer`, `buildEnhancement` | Top-level convenience API |
| `runFullSession` | End-to-end session orchestration |
| `runQualityGates` | 6-gate pass/fail pipeline |
| `generateProductionReport` | Session summary report |
| `detectDrift` | Score trend analysis across iterations |
| `validateStructure` | Arrangement structure rules check |
| `StreamAnalyzer`, `createStreamAnalyzer` | Frame-by-frame streaming analysis |
| `MetricsCollector`, `createMetricsCollector` | Pipeline observability |

## Key invariants

- All tick arithmetic: `buildTickMap` — single source of truth
- All determinism: `hashString(seed)` from `_utils.ts`
- All MIDI notes: clamped to `[0, 127]`
- All velocities: clamped to `[1, 127]`
- `estimateBpm` minimum: ≥ 30 energy frames = ≥ 15 360 samples at 44 100 Hz
- `StreamAnalyzer` window default: 43 frames × 1 024 samples ≈ 1 second

## Engine phases

| Phase | Scope | Status |
|---|---|---|
| A | Audio Foundation (8 subgenres, perception, stems, culture) | ✓ Complete |
| B | CTL-Aware (CTL synthesis, pipeline + route upgrade) | ✓ Complete |
| C | Generation Wiring (arrangement, MIDI suite, 30+ modules) | ✓ Complete |
| D | Evaluation (comparative eval, quality gate, tension, drift) | ✓ Complete |
| E | Learning Layer (adaptive policy, convergence, refinement) | ✓ Complete |
| F | Streaming (StreamAnalyzer, frame-by-frame analysis) | ✓ Complete |
| G | Observability (MetricsCollector, snapshot, telemetry) | ✓ Complete |

All 63 engine jobs documented in `JOBS.md` with Problem Definition, Solution, and Success Criteria.
