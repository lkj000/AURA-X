import { CTLv1 } from "@aura-x/ctl";
import { validateLineage }          from "./lineageValidator";
import { validateStyle }            from "./styleValidator";
import { validateInstrumentation }  from "./instrumentationValidator";
import { validateHarmony }          from "./harmonyValidator";
import { mergeResults, ValidationResult } from "./types";

export { validateLineage, validateStyle, validateInstrumentation, validateHarmony };
export * from "./types";

export function validateAll(ctl: CTLv1): ValidationResult {
  return mergeResults(
    validateLineage(ctl),
    validateStyle(ctl),
    validateInstrumentation(ctl),
    validateHarmony(ctl),
  );
}
