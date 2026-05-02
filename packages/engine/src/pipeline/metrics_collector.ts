// Engine Metrics Collector — E-63  (Phase G closure)
// Records timing, quality scores, pass/fail, and error data for every
// engine pipeline run.  Provides a rolling snapshot for observability.
//
// Usage:
//   const mc = createMetricsCollector();
//   mc.record({ durationMs: 42, qualityScore: 0.87, passed: true });
//   const snap = mc.snapshot();          // { totalRuns, passed, failed, … }
//   mc.reset();                          // clear all metrics

import type { PipelineMetric, MetricsSnapshot } from "../types";
import { hashString } from "../_utils";

export interface RecordInput {
  durationMs:   number;
  qualityScore: number;
  passed:       boolean;
  lane?:        string;
  error?:       string;
}

export class MetricsCollector {
  private runs: PipelineMetric[] = [];

  record(input: RecordInput): PipelineMetric {
    const metric: PipelineMetric = {
      runId:        `run-${Date.now().toString(36)}-${Math.floor(hashString(String(this.runs.length)) * 1e6)}`,
      timestamp:    Date.now(),
      durationMs:   Math.max(0, input.durationMs),
      qualityScore: Math.max(0, Math.min(1, input.qualityScore)),
      passed:       input.passed,
      lane:         input.lane,
      error:        input.error,
    };
    this.runs.push(metric);
    return metric;
  }

  snapshot(limit = 10): MetricsSnapshot {
    const total  = this.runs.length;
    const passed = this.runs.filter((r) => r.passed).length;
    const failed = total - passed;

    const avgDurationMs = total > 0
      ? this.runs.reduce((s, r) => s + r.durationMs, 0) / total
      : 0;

    const avgQuality = total > 0
      ? this.runs.reduce((s, r) => s + r.qualityScore, 0) / total
      : 0;

    const recentRuns = [...this.runs]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, Math.max(1, limit));

    return { totalRuns: total, passed, failed, avgDurationMs, avgQuality, recentRuns };
  }

  reset(): void {
    this.runs = [];
  }

  get size(): number { return this.runs.length; }
}

export function createMetricsCollector(): MetricsCollector {
  return new MetricsCollector();
}
