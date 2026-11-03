import { COPY } from "./copy.js";
import type {
  AnalyzeOutcome,
  CauseGuess,
  ExerciseSuggestion,
  IssueSeverity,
  MediaType,
  PhotoPayload,
  PostureIssue,
  Report,
  RetakeGuidance,
  RetakeShot,
  Transport,
} from "./types.js";

const SEVERITIES: readonly IssueSeverity[] = ["mild", "moderate", "marked"];
const MEDIA_TYPES: readonly MediaType[] = ["image/jpeg", "image/png", "image/webp"];

export interface FetchLike {
  (
    input: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ): Promise<{ status: number; text(): Promise<string> }>;
}

/** Join the configurable API origin with the T2 analyze path. */
export function analyzeUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^/\s]+/i.test(trimmed)) {
    throw new Error("bad base url");
  }
  return `${trimmed}/v1/analyze`;
}

export function createFetchTransport(fetchImpl: FetchLike): Transport {
  return {
    async postJson(url, body) {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "cache-control": "no-store",
        },
        body: JSON.stringify(body),
      });
      return { status: response.status, text: await response.text() };
    },
  };
}

/**
 * Send both photos to T2 and classify the JSON.
 * This does not score posture. A missing photo is rejected before the call.
 */
export async function analyzePhotos(
  transport: Transport,
  baseUrl: string,
  front: PhotoPayload,
  side: PhotoPayload,
): Promise<AnalyzeOutcome> {
  if (!isPayload(front) || !isPayload(side)) {
    return { kind: "error", message: COPY.readFail };
  }
  let url: string;
  try {
    url = analyzeUrl(baseUrl);
  } catch {
    return { kind: "error", message: COPY.badBaseUrl };
  }
  const body = {
    front: { mediaType: front.mediaType, dataBase64: front.dataBase64 },
    side: { mediaType: side.mediaType, dataBase64: side.dataBase64 },
  };
  try {
    const response = await transport.postJson(url, body);
    return interpretAnalyzeResponse(response.status, response.text);
  } catch {
    return { kind: "error", message: COPY.network };
  }
}

export function interpretAnalyzeResponse(status: number, text: string): AnalyzeOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { kind: "error", message: COPY.badResponse };
  }
  if (!isRecord(parsed)) return { kind: "error", message: COPY.badResponse };

  const report = readReport(parsed.report);
  const retake = readRetake(parsed.retakeGuidance);
  if (report && retake) return { kind: "error", message: COPY.badResponse };
  if (status === 200 && isRecord(parsed.report) && report === null && retake === null) {
    if (typeof parsed.report.disclaimer !== "string" || parsed.report.disclaimer.trim() === "") {
      return { kind: "error", message: COPY.missingDisclaimer };
    }
  }
  if (status === 200 && report) return { kind: "report", report };
  if ((status === 200 || status === 400 || status === 422) && retake) {
    return { kind: "retake", retakeGuidance: retake };
  }
  const message = readServerMessage(parsed.message);
  if (message) return { kind: "error", message };
  return { kind: "error", message: COPY.genericFailure };
}

function isPayload(photo: PhotoPayload): boolean {
  return MEDIA_TYPES.includes(photo.mediaType) && photo.dataBase64.trim() !== "";
}

function readReport(value: unknown): Report | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (typeof value.disclaimer !== "string" || value.disclaimer.trim() === "") return null;
  const issues = readIssues(value.issues);
  const causeGuesses = readCauses(value.causeGuesses);
  const exerciseSuggestions = readExercises(value.exerciseSuggestions);
  if (!issues || !causeGuesses || !exerciseSuggestions) return null;
  return {
    schemaVersion: 1,
    issues,
    causeGuesses,
    exerciseSuggestions,
    disclaimer: value.disclaimer.trim(),
  };
}

function readRetake(value: unknown): RetakeGuidance | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (value.code !== "missing_image" && value.code !== "poor_quality") return null;
  if (typeof value.summary !== "string" || value.summary.trim() === "") return null;
  if ("issues" in value || "causeGuesses" in value || "exerciseSuggestions" in value || "disclaimer" in value) {
    return null;
  }
  const shots = readRetakeShots(value.shots);
  const checklist = readChecklist(value.checklist);
  if (!shots || !checklist) return null;
  return {
    schemaVersion: 1,
    code: value.code,
    summary: value.summary.trim(),
    shots,
    checklist,
  };
}

function readIssues(value: unknown): PostureIssue[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const issues: PostureIssue[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    if (typeof item.title !== "string" || item.title.trim() === "") return null;
    if (typeof item.detail !== "string" || item.detail.trim() === "") return null;
    if (!SEVERITIES.includes(item.severity as IssueSeverity)) return null;
    issues.push({
      title: item.title.trim(),
      detail: item.detail.trim(),
      severity: item.severity as IssueSeverity,
    });
  }
  return issues;
}

function readCauses(value: unknown): CauseGuess[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const causes: CauseGuess[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.guess !== "string" || item.guess.trim() === "") return null;
    const cause: CauseGuess = { guess: item.guess.trim() };
    if (item.relatedIssueTitle !== undefined) {
      if (typeof item.relatedIssueTitle !== "string" || item.relatedIssueTitle.trim() === "") return null;
      cause.relatedIssueTitle = item.relatedIssueTitle.trim();
    }
    causes.push(cause);
  }
  return causes;
}

function readExercises(value: unknown): ExerciseSuggestion[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const exercises: ExerciseSuggestion[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    if (typeof item.name !== "string" || item.name.trim() === "") return null;
    if (typeof item.instruction !== "string" || item.instruction.trim() === "") return null;
    const exercise: ExerciseSuggestion = {
      name: item.name.trim(),
      instruction: item.instruction.trim(),
    };
    if (item.addresses !== undefined) {
      if (typeof item.addresses !== "string" || item.addresses.trim() === "") return null;
      exercise.addresses = item.addresses.trim();
    }
    exercises.push(exercise);
  }
  return exercises;
}

function readRetakeShots(value: unknown): RetakeShot[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const shots: RetakeShot[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    if (item.view !== "front" && item.view !== "side") return null;
    if (item.problem !== "missing" && item.problem !== "poor_quality") return null;
    const reasons = readChecklist(item.reasons);
    const messages = readChecklist(item.messages);
    if (!reasons || !messages) return null;
    shots.push({ view: item.view, problem: item.problem, reasons, messages });
  }
  return shots;
}

function readChecklist(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const lines: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.trim() === "") return null;
    lines.push(item.trim());
  }
  return lines;
}

function readServerMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
