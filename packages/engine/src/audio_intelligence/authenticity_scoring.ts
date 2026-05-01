// 8-lane Amapiano authenticity scoring with softmax normalization.

import { gaussScore, softmax } from "../_utils";
import {
  LANES, LANE_TARGETS, LANE_WEIGHTS,
  type Lane, type LaneScore, type LaneScores, type AudioFeatures,
} from "../types";

function scoreLane(lane: Lane, features: AudioFeatures): number {
  const t = LANE_TARGETS[lane];
  const w = LANE_WEIGHTS[lane];

  return (
    w.bpm         * gaussScore(features.bpm,              t.bpm,        t.bpmSigma) +
    w.energy      * gaussScore(features.energyRms,        t.energy,     t.energySigma) +
    w.centroid    * gaussScore(features.spectralCentroid, t.centroid,   t.centroidSigma) +
    w.syncopation * gaussScore(features.groove.syncopationIndex, t.syncopation, t.syncopSigma)
  );
}

export function scoreAuthenticityLanes(features: AudioFeatures): LaneScores {
  const rawScores = LANES.map((lane) => scoreLane(lane, features));
  const probs     = softmax(rawScores);

  const laneScores: LaneScore[] = LANES.map((lane, i) => ({
    lane,
    score:       rawScores[i],
    probability: probs[i],
  })).sort((a, b) => b.score - a.score);

  const best   = laneScores[0];
  const second = laneScores[1];

  const scores = {} as Record<Lane, number>;
  LANES.forEach((lane, i) => { scores[lane] = rawScores[i]; });

  return {
    scores,
    overallAuthenticity: best.score,
    bestFitLane:         best.lane,
    laneConfidence:      best.probability,
    laneScores,
    secondaryLane:       second.lane,
    hybridFlag:          (best.probability - second.probability) < 0.10,
  };
}
