export type ValidationIssue = {
  code: string;           // machine-readable — used by mutation engine
  severity: "error" | "warning";
  field: string;          // which CTL field triggered this
  message: string;        // human-readable
  current_value?: unknown;
  expected?: unknown;
};

export type ValidationResult = {
  passed: boolean;
  issues: ValidationIssue[];
};

export function passed(): ValidationResult {
  return { passed: true, issues: [] };
}

export function failed(issues: ValidationIssue[]): ValidationResult {
  return { passed: false, issues };
}

export function mergeResults(...results: ValidationResult[]): ValidationResult {
  const all    = results.flatMap(r => r.issues);
  const errors = all.filter(i => i.severity === "error");
  return { passed: errors.length === 0, issues: all };
}
