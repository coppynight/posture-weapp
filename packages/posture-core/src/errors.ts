/** Model JSON did not satisfy the report schema. */
export class ReportValidationError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(`Model report failed validation: ${errors.join("; ")}`);
    this.name = "ReportValidationError";
    this.errors = errors;
  }
}

/** A custom system-prompt file could not be used. */
export class SystemPromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SystemPromptError";
  }
}
