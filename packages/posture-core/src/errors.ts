/** A document failed schema validation. */
export class ValidationError extends Error {
  readonly errors: readonly string[];

  constructor(message: string, errors: readonly string[]) {
    super(message);
    this.name = new.target.name;
    this.errors = errors;
  }
}

/** Model JSON did not satisfy the report schema. */
export class ReportValidationError extends ValidationError {
  constructor(errors: readonly string[]) {
    super(`Model report failed validation: ${errors.join("; ")}`, errors);
  }
}

/** Library-built retake guidance did not satisfy its own schema. */
export class RetakeGuidanceValidationError extends ValidationError {
  constructor(errors: readonly string[]) {
    super(`Internal retake guidance failed validation: ${errors.join("; ")}`, errors);
  }
}

/** A custom system-prompt file could not be used. */
export class SystemPromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SystemPromptError";
  }
}
