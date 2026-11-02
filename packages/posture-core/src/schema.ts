import { BANNED_COURSE_MARKS } from "./banned-course-marks.js";
import type {
  CauseGuess,
  ExerciseSuggestion,
  IssueSeverity,
  PostureIssue,
  QualityReasonCode,
  Report,
  RetakeGuidance,
  RetakeShot,
  ShotView,
  ValidationResult,
} from "./types.js";

/** Canonical non-medical disclaimer stamped onto every successful report. */
export const REPORT_DISCLAIMER =
  "本结果只供日常体态与健身训练参考，不是医疗诊断，也不能代替医师、物理治疗师或其他合格医务人员的当面评估。如有疼痛、麻木、损伤、头晕或其他不适，请停止相关训练并寻求专业医疗帮助。";

/** Count and length bounds for report and retake-guidance fields. */
export const REPORT_LIMITS = {
  issues: { min: 1, max: 8 },
  causeGuesses: { min: 1, max: 8 },
  exerciseSuggestions: { min: 3, max: 5 },
  shots: { max: 2 },
  checklist: { min: 2 },
  title: { maxLength: 40 },
  detail: { maxLength: 500 },
  guess: { maxLength: 500 },
  relatedIssueTitle: { maxLength: 40 },
  suggestionName: { maxLength: 40 },
  instruction: { maxLength: 500 },
  addresses: { maxLength: 40 },
  summary: { maxLength: 300 },
  message: { maxLength: 300 },
  checklistItem: { maxLength: 200 },
} as const;

const ISSUE_SEVERITIES: readonly IssueSeverity[] = ["mild", "moderate", "marked"];
const QUALITY_REASONS: readonly QualityReasonCode[] = [
  "missing",
  "empty",
  "too_small",
  "unsupported_type",
  "corrupt",
  "unreadable",
  "low_resolution",
  "blurry",
  "invalid_signal",
];
const ANALYSIS_KEYS = ["issues", "causeGuesses", "exerciseSuggestions", "disclaimer", "report"] as const;

export interface ValidateReportOptions {
  /**
   * Overwrite `disclaimer` with {@link REPORT_DISCLAIMER} before checking.
   * `analyze` always does this so a model cannot drop or rewrite the notice.
   */
  stampDisclaimer?: boolean;
}

export function validateReport(input: unknown, options: ValidateReportOptions = {}): ValidationResult<Report> {
  const parsed = parseJsonContainer(input);
  if (!parsed.ok) return parsed;
  if (!isRecord(parsed.value)) {
    return fail(["report must be a JSON object"]);
  }

  const errors: string[] = [];
  const issues = readIssues(parsed.value.issues, errors);
  const causeGuesses = readCauseGuesses(parsed.value.causeGuesses, issues, errors);
  const exerciseSuggestions = readSuggestions(parsed.value.exerciseSuggestions, errors);
  const disclaimer = options.stampDisclaimer === true ? REPORT_DISCLAIMER : parsed.value.disclaimer;
  if (disclaimer !== REPORT_DISCLAIMER) {
    errors.push("disclaimer must be the canonical non-medical disclaimer");
  }

  if (
    errors.length > 0 ||
    issues === null ||
    causeGuesses === null ||
    exerciseSuggestions === null ||
    disclaimer !== REPORT_DISCLAIMER
  ) {
    return fail(errors);
  }

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      issues,
      causeGuesses,
      exerciseSuggestions,
      disclaimer,
    },
  };
}

export function validateRetakeGuidance(input: unknown): ValidationResult<RetakeGuidance> {
  const parsed = parseJsonContainer(input);
  if (!parsed.ok) return parsed;
  if (!isRecord(parsed.value)) {
    return fail(["retake guidance must be a JSON object"]);
  }

  const errors: string[] = [];
  for (const key of ANALYSIS_KEYS) {
    if (key in parsed.value) {
      errors.push(`retake guidance must not include analysis field ${key}`);
    }
  }
  if (parsed.value.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1");
  }

  const code = parsed.value.code;
  if (code !== "missing_image" && code !== "poor_quality") {
    errors.push("code must be missing_image or poor_quality");
  }
  if (typeof parsed.value.summary !== "string" || parsed.value.summary.trim() === "") {
    errors.push("summary must be a non-empty string");
  } else if (parsed.value.summary.length > REPORT_LIMITS.summary.maxLength) {
    errors.push("summary is too long");
  }

  const shots = readShots(parsed.value.shots, code, errors);
  const checklist = readChecklist(parsed.value.checklist, errors);
  if (errors.length > 0 || shots === null || checklist === null || (code !== "missing_image" && code !== "poor_quality")) {
    return fail(errors);
  }
  if (typeof parsed.value.summary !== "string") return fail(errors);

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      code,
      summary: parsed.value.summary,
      shots,
      checklist,
    },
  };
}

function readIssues(input: unknown, errors: string[]): PostureIssue[] | null {
  if (!Array.isArray(input)) {
    errors.push("issues must be an array");
    return null;
  }
  if (input.length < REPORT_LIMITS.issues.min || input.length > REPORT_LIMITS.issues.max) {
    errors.push(`issues must contain ${REPORT_LIMITS.issues.min} to ${REPORT_LIMITS.issues.max} items`);
  }
  const issues: PostureIssue[] = [];
  const titles = new Set<string>();
  input.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`issues[${index}] must be an object`);
      return;
    }
    const title = readText(item.title, `issues[${index}].title`, REPORT_LIMITS.title.maxLength, errors);
    const detail = readText(item.detail, `issues[${index}].detail`, REPORT_LIMITS.detail.maxLength, errors);
    if (!ISSUE_SEVERITIES.includes(item.severity as IssueSeverity)) {
      errors.push(`issues[${index}].severity must be mild, moderate, or marked`);
    }
    if (title && titles.has(title)) {
      errors.push(`issues[${index}].title duplicates ${title}`);
    }
    if (title) titles.add(title);
    if (title && detail && ISSUE_SEVERITIES.includes(item.severity as IssueSeverity)) {
      issues.push({ title, detail, severity: item.severity as IssueSeverity });
    }
  });
  return errors.length > 0 ? null : issues;
}

function readCauseGuesses(
  input: unknown,
  issues: readonly PostureIssue[] | null,
  errors: string[],
): CauseGuess[] | null {
  if (!Array.isArray(input)) {
    errors.push("causeGuesses must be an array");
    return null;
  }
  if (input.length < REPORT_LIMITS.causeGuesses.min || input.length > REPORT_LIMITS.causeGuesses.max) {
    errors.push(
      `causeGuesses must contain ${REPORT_LIMITS.causeGuesses.min} to ${REPORT_LIMITS.causeGuesses.max} items`,
    );
  }
  const titles = new Set((issues ?? []).map((issue) => issue.title));
  const guesses: CauseGuess[] = [];
  input.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`causeGuesses[${index}] must be an object`);
      return;
    }
    const guess = readText(item.guess, `causeGuesses[${index}].guess`, REPORT_LIMITS.guess.maxLength, errors);
    if (guess && !/可能|猜测/.test(guess)) {
      errors.push(`causeGuesses[${index}].guess must be phrased as a guess (include 可能 or 猜测)`);
    }
    let relatedIssueTitle: string | undefined;
    if (item.relatedIssueTitle !== undefined) {
      const related = readText(
        item.relatedIssueTitle,
        `causeGuesses[${index}].relatedIssueTitle`,
        REPORT_LIMITS.relatedIssueTitle.maxLength,
        errors,
      );
      if (related && !titles.has(related)) {
        errors.push(`causeGuesses[${index}].relatedIssueTitle does not match an issue title`);
      }
      relatedIssueTitle = related ?? undefined;
    }
    if (guess && /可能|猜测/.test(guess)) {
      guesses.push(relatedIssueTitle ? { relatedIssueTitle, guess } : { guess });
    }
  });
  return errors.length > 0 ? null : guesses;
}

function readSuggestions(input: unknown, errors: string[]): ExerciseSuggestion[] | null {
  if (!Array.isArray(input)) {
    errors.push("exerciseSuggestions must be an array");
    return null;
  }
  if (
    input.length < REPORT_LIMITS.exerciseSuggestions.min ||
    input.length > REPORT_LIMITS.exerciseSuggestions.max
  ) {
    errors.push(
      `exerciseSuggestions must contain ${REPORT_LIMITS.exerciseSuggestions.min} to ${REPORT_LIMITS.exerciseSuggestions.max} items`,
    );
  }
  const suggestions: ExerciseSuggestion[] = [];
  input.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`exerciseSuggestions[${index}] must be an object`);
      return;
    }
    const name = readText(
      item.name,
      `exerciseSuggestions[${index}].name`,
      REPORT_LIMITS.suggestionName.maxLength,
      errors,
    );
    const instruction = readText(
      item.instruction,
      `exerciseSuggestions[${index}].instruction`,
      REPORT_LIMITS.instruction.maxLength,
      errors,
    );
    let addresses: string | undefined;
    if (item.addresses !== undefined) {
      addresses =
        readText(
          item.addresses,
          `exerciseSuggestions[${index}].addresses`,
          REPORT_LIMITS.addresses.maxLength,
          errors,
        ) ?? undefined;
    }
    const combined = [name, instruction, addresses].filter((part): part is string => Boolean(part)).join(" ");
    const banned = BANNED_COURSE_MARKS.find((mark) => combined.includes(mark));
    if (banned) {
      errors.push(`exerciseSuggestions[${index}] uses a branded course name (${banned})`);
    }
    if (name && instruction && !banned) {
      suggestions.push(addresses ? { name, instruction, addresses } : { name, instruction });
    }
  });
  return errors.length > 0 ? null : suggestions;
}

function readShots(input: unknown, code: unknown, errors: string[]): RetakeShot[] | null {
  if (!Array.isArray(input) || input.length === 0) {
    errors.push("shots must be a non-empty array");
    return null;
  }
  if (input.length > REPORT_LIMITS.shots.max) {
    errors.push(`shots must contain at most ${REPORT_LIMITS.shots.max} items`);
  }
  const shots: RetakeShot[] = [];
  const seen = new Set<ShotView>();
  input.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`shots[${index}] must be an object`);
      return;
    }
    const view = item.view;
    if (view !== "front" && view !== "side") {
      errors.push(`shots[${index}].view must be front or side`);
      return;
    }
    if (seen.has(view)) errors.push(`shots[${index}].view duplicates ${view}`);
    seen.add(view);

    const expectedProblem = code === "missing_image" ? "missing" : "poor_quality";
    if (code === "missing_image" || code === "poor_quality") {
      if (item.problem !== expectedProblem) {
        errors.push(`shots[${index}].problem must be ${expectedProblem} when code is ${String(code)}`);
      }
    }

    const reasons = readReasons(item.reasons, view, item.problem, index, errors);
    const messages = readMessages(item.messages, index, errors);
    if (reasons && messages && (item.problem === "missing" || item.problem === "poor_quality")) {
      shots.push({ view, problem: item.problem, reasons, messages });
    }
  });
  return errors.length > 0 ? null : shots;
}

function readReasons(
  input: unknown,
  _view: ShotView,
  problem: unknown,
  index: number,
  errors: string[],
): QualityReasonCode[] | null {
  if (!Array.isArray(input) || input.length === 0) {
    errors.push(`shots[${index}].reasons must be a non-empty array`);
    return null;
  }
  const reasons: QualityReasonCode[] = [];
  for (const reason of input) {
    if (!QUALITY_REASONS.includes(reason as QualityReasonCode)) {
      errors.push(`shots[${index}].reasons contains an unknown code`);
      continue;
    }
    reasons.push(reason as QualityReasonCode);
  }
  if (problem === "missing" && reasons.some((reason) => reason !== "missing")) {
    errors.push(`shots[${index}].reasons for a missing photo must only be missing`);
  }
  if (problem === "poor_quality" && reasons.includes("missing")) {
    errors.push(`shots[${index}].reasons for poor quality must not include missing`);
  }
  return errors.length > 0 ? null : reasons;
}

function readMessages(input: unknown, index: number, errors: string[]): string[] | null {
  if (!Array.isArray(input) || input.length === 0) {
    errors.push(`shots[${index}].messages must be a non-empty array`);
    return null;
  }
  const messages: string[] = [];
  input.forEach((message, messageIndex) => {
    const text = readText(
      message,
      `shots[${index}].messages[${messageIndex}]`,
      REPORT_LIMITS.message.maxLength,
      errors,
    );
    if (text) messages.push(text);
  });
  return errors.length > 0 ? null : messages;
}

function readChecklist(input: unknown, errors: string[]): string[] | null {
  if (!Array.isArray(input) || input.length < REPORT_LIMITS.checklist.min) {
    errors.push(`checklist must contain at least ${REPORT_LIMITS.checklist.min} items`);
    return null;
  }
  const checklist: string[] = [];
  input.forEach((item, index) => {
    const text = readText(item, `checklist[${index}]`, REPORT_LIMITS.checklistItem.maxLength, errors);
    if (text) checklist.push(text);
  });
  return errors.length > 0 ? null : checklist;
}

function readText(value: unknown, label: string, maxLength: number, errors: string[]): string | null {
  if (typeof value !== "string") {
    errors.push(`${label} must be a string`);
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    errors.push(`${label} must be non-empty`);
    return null;
  }
  if (trimmed.length > maxLength) {
    errors.push(`${label} is too long`);
    return null;
  }
  return trimmed;
}

function parseJsonContainer(input: unknown): ValidationResult<unknown> {
  if (typeof input !== "string") return { ok: true, value: input };
  try {
    return { ok: true, value: JSON.parse(input) as unknown };
  } catch {
    return fail(["model output is not valid JSON"]);
  }
}

function fail<T>(errors: readonly string[]): ValidationResult<T> {
  return { ok: false, errors: errors.length > 0 ? errors : ["validation failed"] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
