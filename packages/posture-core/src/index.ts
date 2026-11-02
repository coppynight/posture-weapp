export { analyze, type AnalyzeOptions } from "./analyze.js";
export { DEFAULT_SYSTEM_PROMPT, resolveSystemPrompt } from "./prompt.js";
export { BANNED_COURSE_MARKS } from "./banned-course-marks.js";
export {
  ReportValidationError,
  RetakeGuidanceValidationError,
  SystemPromptError,
  ValidationError,
} from "./errors.js";
export { readImageSize, type ImageSize } from "./image-info.js";
export { MockMultimodalProvider, mockReportDraft } from "./mock-provider.js";
export { type AnalyzePostureRequest, type MultimodalProvider } from "./provider.js";
export { IMAGE_QUALITY_REQUIREMENTS, checkImageQuality, gateImagePair } from "./quality.js";
export type { ImagePairGate } from "./quality.js";
export { REPORT_DISCLAIMER, REPORT_LIMITS, validateReport, validateRetakeGuidance } from "./schema.js";
export type { ValidateReportOptions } from "./schema.js";

export type {
  AnalyzeResult,
  CauseGuess,
  ExerciseSuggestion,
  IssueSeverity,
  MediaType,
  ModelReportInput,
  PostureImage,
  PostureIssue,
  QualityReasonCode,
  Report,
  RetakeGuidance,
  RetakeShot,
  ShotView,
  ValidationResult,
} from "./types.js";

export { SUPPORTED_MEDIA_TYPES } from "./types.js";

import type { AnalyzeResult } from "./types.js";

export function isReportResult(result: AnalyzeResult): result is Extract<AnalyzeResult, { status: "report" }> {
  return result.status === "report";
}

export function isRetakeResult(result: AnalyzeResult): result is Extract<AnalyzeResult, { status: "retake" }> {
  return result.status === "retake";
}
