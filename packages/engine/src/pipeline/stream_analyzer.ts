// Stream Analyzer — E-62  (Phase F closure)
// Processes audio in fixed-size frames, maintaining a rolling window for
// BPM and spectral centroid estimation.
//
// Per frame:
//   • RMS energy computed immediately from the input samples.
//   • Samples appended to a rolling window (capped at windowSamples).
//   • When the window is full: BPM + spectral centroid estimated from it.
//
// BPM requires ≥ 30 energy frames of 512 samples (≈ 15 360 samples at 44 100 Hz).
// Before the window fills, bpmEstimate and centroidHz are null.
//
// Call flush() after the last frame to force a final estimate from whatever
// audio has accumulated.  Call reset() to reuse the instance for a new stream.

import { computeRmsEnergy, estimateBpm, spectralCentroidFft } from "../_dsp";
import type { StreamFrame } from "../types";

export interface StreamOptions {
  sampleRate?:       number;  // default 44 100
  frameSize?:        number;  // samples per frame, default 1 024
  bpmWindowFrames?:  number;  // frames to buffer before estimating (default 43 ≈ 1 s)
}

export class StreamAnalyzer {
  private readonly sr:            number;
  private readonly frameSize:     number;
  private readonly windowSamples: number;

  private _frameCount = 0;
  private accumulator: number[] = [];
  private lastBpm:      number | null = null;
  private lastCentroid: number | null = null;

  constructor(options: StreamOptions = {}) {
    this.sr          = Math.max(8000, options.sampleRate     ?? 44100);
    this.frameSize   = Math.max(64,   Math.round(options.frameSize       ?? 1024));
    const winFrames  = Math.max(4,    Math.round(options.bpmWindowFrames ?? 43));
    this.windowSamples = winFrames * this.frameSize;
  }

  pushFrame(samples: ArrayLike<number>): StreamFrame {
    const arr      = Array.from(samples);
    const rmsEnergy = computeRmsEnergy(arr);

    this.accumulator = this.accumulator.concat(arr);
    if (this.accumulator.length > this.windowSamples) {
      this.accumulator = this.accumulator.slice(-this.windowSamples);
    }

    if (this.accumulator.length >= this.windowSamples) {
      this.lastBpm      = estimateBpm(this.accumulator, this.sr);
      this.lastCentroid = spectralCentroidFft(this.accumulator, this.sr);
    }

    const frame: StreamFrame = {
      frameIndex:  this._frameCount,
      rmsEnergy,
      bpmEstimate: this.lastBpm,
      centroidHz:  this.lastCentroid,
      timestamp:   (this._frameCount * this.frameSize) / this.sr,
    };

    this._frameCount++;
    return frame;
  }

  flush(): StreamFrame {
    if (this.accumulator.length > 0) {
      this.lastBpm      = estimateBpm(this.accumulator, this.sr);
      this.lastCentroid = spectralCentroidFft(this.accumulator, this.sr);
    }
    return {
      frameIndex:  this._frameCount,
      rmsEnergy:   0,
      bpmEstimate: this.lastBpm,
      centroidHz:  this.lastCentroid,
      timestamp:   (this._frameCount * this.frameSize) / this.sr,
    };
  }

  reset(): void {
    this._frameCount = 0;
    this.accumulator  = [];
    this.lastBpm      = null;
    this.lastCentroid = null;
  }

  get frameCount(): number { return this._frameCount; }
}

export function createStreamAnalyzer(options?: StreamOptions): StreamAnalyzer {
  return new StreamAnalyzer(options);
}
