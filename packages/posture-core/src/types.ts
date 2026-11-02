/** Photo encodings the quality gate can measure. */
export const SUPPORTED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type MediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

/**
 * One posture photo.
 * The quality gate reads width and height from the file header.
 * `sharpness`, when supplied by the caller, is 0 (unusable) through 1 (sharp).
 */
export interface PostureImage {
  data: Uint8Array;
  mediaType: MediaType;
  sharpness?: number;
}

export type ShotView = "front" | "side";

export type QualityReasonCode =
  | "missing"
  | "empty"
  | "too_small"
  | "unsupported_type"
  | "corrupt"
  | "unreadable"
  | "low_resolution"
  | "blurry"
  | "invalid_signal";

export interface RetakeShot {
  view: ShotView;
  problem: "missing" | "poor_quality";
  reasons: readonly QualityReasonCode[];
  /** Simplified Chinese lines safe to show to the user. */
  messages: readonly string[];
}

/**
 * Returned instead of a report when a photo is missing or fails the quality gate.
 * Contains retake instructions only — no posture findings.
 */
export interface RetakeGuidance {
  schemaVersion: 1;
  code: "missing_image" | "poor_quality";
  /** Simplified Chinese summary. */
  summary: string;
  shots: readonly RetakeShot[];
  /** Simplified Chinese retake checklist. */
  checklist: readonly string[];
}

export type IssueSeverity = "mild" | "moderate" | "marked";

export interface PostureIssue {
  /** Short Simplified Chinese observation, e.g. 头前引. */
  title: string;
  /** What is visible in the photos. */
  detail: string;
  severity: IssueSeverity;
}

export interface CauseGuess {
  /** Present only when it matches an issue title exactly. */
  relatedIssueTitle?: string;
  /** Training-oriented guess, not a diagnosis. */
  guess: string;
}

export interface ExerciseSuggestion {
  /** Generic fitness movement name. No branded course titles. */
  name: string;
  instruction: string;
  addresses?: string;
}

/** Structured training-oriented posture report. */
export interface Report {
  schemaVersion: 1;
  issues: readonly PostureIssue[];
  causeGuesses: readonly CauseGuess[];
  /** Always 3 to 5 items. */
  exerciseSuggestions: readonly ExerciseSuggestion[];
  /** Non-medical disclaimer. Simplified Chinese. */
  disclaimer: string;
}

export type AnalyzeResult =
  | { status: "report"; report: Report }
  | { status: "retake"; retakeGuidance: RetakeGuidance };

/** Parsed model payload before the library stamps the disclaimer. */
export interface ModelReportInput {
  issues: readonly {
    title: string;
    detail: string;
    severity: IssueSeverity;
  }[];
  causeGuesses: readonly {
    relatedIssueTitle?: string;
    guess: string;
  }[];
  exerciseSuggestions: readonly {
    name: string;
    instruction: string;
    addresses?: string;
  }[];
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: readonly string[] };
