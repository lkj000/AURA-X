export { planHarmony, applyHarmonyPlan, planHarmonyWithVoicings } from "./harmony/harmonyPlanner";
export type { HarmonyPlan, HarmonyPlannerOptions, HarmonyPlanWithVoicings } from "./harmony/harmonyPlanner";
export * from "./harmony/harmonyKnowledge";

export { planGroove, applyGroovePlan, planGrooveWithVariations } from "./groove/groovePlanner";
export type { GroovePlannerOptions, GroovePlanWithVariations } from "./groove/groovePlanner";
export * from "./groove/grooveLibrary";

export { suggestGroove } from "./groove/grooveAdvisor";
export type { GrooveSuggestion, GrooveAdvisorOptions } from "./groove/grooveAdvisor";

export { planInstrumentation, applyInstrumentationPlan } from "./instrumentation/instrumentationPlanner";
export type { InstrumentationPlannerOptions } from "./instrumentation/instrumentationPlanner";
export * from "./instrumentation/instrumentationKnowledge";

export {
  validateLineage,
  validateStyle,
  validateInstrumentation,
  validateHarmony,
  validateAll,
} from "./validators";
export type { ValidationResult, ValidationIssue } from "./validators";

export {
  applyMutation,
  applyMutations,
  recommendMutations,
  repairCTL,
} from "./mutation/mutationEngine";
export type {
  MutationId,
  MutationResult,
} from "./mutation/mutationEngine";

export {
  conditionForMode2,
} from "./generation/mode2Conditioner";
export type {
  Mode2ConditioningResult,
} from "./generation/mode2Conditioner";

export {
  planSet,
  planTransition,
  PHASE_ENERGY_TARGETS,
  ORDERED_PHASES,
} from "./dj/setPlanner";
export type {
  SetTrack,
  SetPlan,
  TransitionPlan,
  EnergyPhase,
  SetPlannerOptions,
} from "./dj/setPlanner";

export {
  getCamelotCode,
  getCompatibleKeys,
  harmonicCompatibilityScore,
  bpmCompatibilityScore,
  mixCompatibilityScore,
  KEY_TO_CAMELOT,
  CAMELOT_TO_KEY,
} from "./dj/camelotWheel";
export type { CamelotCode } from "./dj/camelotWheel";

export { mergeToMultiTrackMidi } from "./midi/midiMerger";
export type { TrackBuffer } from "./midi/midiMerger";

export { planMelody } from "./melody/melodyPlanner";
export type { MelodyNote, MelodyPlan, MelodyPlannerOptions } from "./melody/melodyPlanner";

export { exportMelodyToMidi } from "./melody/melodyMidi";

export {
  evaluateSignal,
  scoreBpmAccuracy,
  scoreKeyAccuracy,
  scoreEnergyAccuracy,
  scoreGrooveDensity,
  scoreCulturalSignal,
  SUBGENRE_ONSET_TARGETS,
  SUBGENRE_LOW_MID_TARGETS,
} from "./evaluation/audioFeatureBridge";
export type {
  ObservedFeatures,
  SignalEvaluationResult,
} from "./evaluation/audioFeatureBridge";
