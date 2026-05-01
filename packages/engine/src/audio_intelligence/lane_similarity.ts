// Lane Similarity Matrix — E-21
// Computes pairwise cosine similarity between all 8 Amapiano lanes using
// 5 normalized LANE_TARGETS features: bpm, energy, centroid, swing, syncopation.
//
// Min-max normalization across all 8 lanes gives each feature equal weight.
// Cosine similarity of normalized vectors → similarity ∈ [0, 1].
// Self-similarity is always 1.0.

import { LANES, LANE_TARGETS } from "../types";
import type { Lane, LanePair, LaneSimilarityMatrix } from "../types";

// ── Feature extraction ────────────────────────────────────────────────────────

const FEATURE_NAMES = ["bpm", "energy", "centroid", "swing", "syncopation"] as const;
type FeatureName = typeof FEATURE_NAMES[number];

function rawVector(lane: Lane): number[] {
  const t = LANE_TARGETS[lane];
  return [t.bpm, t.energy, t.centroid, t.swing, t.syncopation];
}

// ── Normalization ─────────────────────────────────────────────────────────────

function buildNormalizedVectors(): Record<Lane, number[]> {
  const raw = Object.fromEntries(LANES.map((l) => [l, rawVector(l)])) as Record<Lane, number[]>;
  const dims = FEATURE_NAMES.length;
  const mins = Array.from({ length: dims }, (_, d) => Math.min(...LANES.map((l) => raw[l][d])));
  const maxs = Array.from({ length: dims }, (_, d) => Math.max(...LANES.map((l) => raw[l][d])));

  return Object.fromEntries(
    LANES.map((l) => [
      l,
      raw[l].map((v, d) => {
        const range = maxs[d] - mins[d];
        return range === 0 ? 0 : (v - mins[d]) / range;
      }),
    ]),
  ) as Record<Lane, number[]>;
}

// ── Cosine similarity ─────────────────────────────────────────────────────────

function cosine(a: number[], b: number[]): number {
  const dot   = a.reduce((s, v, i) => s + v * b[i], 0);
  const normA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const normB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return normA === 0 || normB === 0 ? 0 : Math.min(1, dot / (normA * normB));
}

// ── Public API ────────────────────────────────────────────────────────────────

export function computeLaneSimilarityMatrix(): LaneSimilarityMatrix {
  const normalized = buildNormalizedVectors();

  // Build full 8×8 matrix (including self-similarity on diagonal)
  const matrix = Object.fromEntries(
    LANES.map((lA) => [
      lA,
      Object.fromEntries(
        LANES.map((lB) => [lB, lA === lB ? 1.0 : cosine(normalized[lA], normalized[lB])]),
      ),
    ]),
  ) as Record<Lane, Record<Lane, number>>;

  // Collect all 28 unique pairs (upper triangle)
  const pairs: LanePair[] = [];
  for (let i = 0; i < LANES.length; i++) {
    for (let j = i + 1; j < LANES.length; j++) {
      const laneA = LANES[i];
      const laneB = LANES[j];
      const similarity = matrix[laneA][laneB];
      pairs.push({ laneA, laneB, similarity, distance: 1 - similarity });
    }
  }
  pairs.sort((a, b) => b.similarity - a.similarity);

  // Nearest neighbor per lane (highest similarity among other lanes)
  const neighbors = Object.fromEntries(
    LANES.map((lane) => {
      const best = LANES
        .filter((l) => l !== lane)
        .reduce((best, l) => matrix[lane][l] > matrix[lane][best] ? l : best, LANES.find((l) => l !== lane)!);
      return [lane, best];
    }),
  ) as Record<Lane, Lane>;

  return {
    matrix,
    pairs,
    closest:  pairs.slice(0, 3),
    farthest: pairs.slice(-3).reverse(),
    neighbors,
  };
}
