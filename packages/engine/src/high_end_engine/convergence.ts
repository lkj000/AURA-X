// Convergence tracking with early stopping.
// Mirrors aura-x-engine/high_end_engine/convergence.py

import type { ConvergenceState } from "../types";

const DEFAULT_IMPROVEMENT_THRESHOLD = 0.02;
const DEFAULT_QUALITY_THRESHOLD     = 0.85;
const DEFAULT_SCORE_DECREASE        = -0.01;
const DEFAULT_MAX_ITERATIONS        = 5;

export class ConvergenceTracker {
  private readonly improvementThreshold: number;
  private readonly qualityThreshold:     number;
  private readonly scoreDecrease:        number;
  private readonly maxIterations:        number;

  private scores:     number[] = [];
  private stopped     = false;
  private stopReason: ConvergenceState["stopReason"] = null;

  constructor(opts: {
    improvementThreshold?: number;
    qualityThreshold?:     number;
    scoreDecrease?:        number;
    maxIterations?:        number;
  } = {}) {
    this.improvementThreshold = opts.improvementThreshold ?? DEFAULT_IMPROVEMENT_THRESHOLD;
    this.qualityThreshold     = opts.qualityThreshold     ?? DEFAULT_QUALITY_THRESHOLD;
    this.scoreDecrease        = opts.scoreDecrease        ?? DEFAULT_SCORE_DECREASE;
    this.maxIterations        = opts.maxIterations        ?? DEFAULT_MAX_ITERATIONS;
  }

  addScore(score: number): void {
    this.scores.push(score);
  }

  shouldContinue(): boolean {
    if (this.stopped) return false;

    const n = this.scores.length;
    if (n === 0) return true;

    const latest = this.scores[n - 1];

    // Quality gate: already good enough
    if (latest >= this.qualityThreshold) {
      this.stopped   = true;
      this.stopReason = "quality_threshold";
      return false;
    }

    // Regression: score dropped too much
    if (n >= 2 && (latest - this.scores[n - 2]) < this.scoreDecrease) {
      this.stopped   = true;
      this.stopReason = "regression";
      return false;
    }

    // No meaningful improvement
    if (n >= 2 && (latest - this.scores[n - 2]) < this.improvementThreshold) {
      this.stopped   = true;
      this.stopReason = "no_improvement";
      return false;
    }

    // Iteration limit
    if (n >= this.maxIterations) {
      this.stopped   = true;
      this.stopReason = "iteration_limit";
      return false;
    }

    return true;
  }

  state(): ConvergenceState {
    return {
      scores:        [...this.scores],
      stopped:       this.stopped,
      stopReason:    this.stopReason,
      bestScore:     this.scores.length > 0 ? Math.max(...this.scores) : 0,
      iterationsRun: this.scores.length,
    };
  }

  reset(): void {
    this.scores     = [];
    this.stopped    = false;
    this.stopReason = null;
  }
}
