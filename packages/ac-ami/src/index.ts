export { planHarmony, applyHarmonyPlan } from "./harmony/harmonyPlanner";
export type { HarmonyPlan, HarmonyPlannerOptions } from "./harmony/harmonyPlanner";
export * from "./harmony/harmonyKnowledge";

export { planGroove, applyGroovePlan } from "./groove/groovePlanner";
export type { GroovePlannerOptions } from "./groove/groovePlanner";
export * from "./groove/grooveLibrary";

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
  getCamelotCode,
  getCompatibleKeys,
  harmonicCompatibilityScore,
  bpmCompatibilityScore,
  mixCompatibilityScore,
  KEY_TO_CAMELOT,
  CAMELOT_TO_KEY,
} from "./dj/camelotWheel";
export type { CamelotCode } from "./dj/camelotWheel";
