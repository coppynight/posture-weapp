import { COPY } from "./copy.js";
import type { AnalyzeOutcome, MediaType, PhotoPayload, Report, RetakeGuidance, Transport } from "./types.js";

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
  if (status === 200 && report) return { kind: "report", report };
  if ((status === 200 || status === 400 || status === 422) && retake) {
    return { kind: "retake", retakeGuidance: retake };
  }
  if (status === 200 && isRecord(parsed.report) && !hasDisclaimer(parsed.report)) {
    return { kind: "error", message: COPY.missingDisclaimer };
  }
  const message = readServerMessage(parsed.message);
  if (message) return { kind: "error", message };
  return { kind: "error", message: COPY.genericFailure };
}

function isPayload(photo: PhotoPayload): boolean {
  return MEDIA_TYPES.includes(photo.mediaType) && photo.dataBase64.trim() !== "";
}

/**
 * Enough structure to render the page. Limits, enums, and wording rules stay on the server.
 */
function readReport(value: unknown): Report | null {
  if (!isRecord(value) || !hasDisclaimer(value)) return null;
  if (!Array.isArray(value.issues) || !Array.isArray(value.causeGuesses) || !Array.isArray(value.exerciseSuggestions)) {
    return null;
  }
  return {
    schemaVersion: 1,
    disclaimer: value.disclaimer,
    issues: value.issues as Report["issues"],
    causeGuesses: value.causeGuesses as Report["causeGuesses"],
    exerciseSuggestions: value.exerciseSuggestions as Report["exerciseSuggestions"],
  };
}

function readRetake(value: unknown): RetakeGuidance | null {
  if (!isRecord(value)) return null;
  if (typeof value.summary !== "string" || value.summary.trim() === "") return null;
  if (!Array.isArray(value.shots) || !Array.isArray(value.checklist)) return null;
  return {
    schemaVersion: 1,
    code: value.code as RetakeGuidance["code"],
    summary: value.summary,
    shots: value.shots as RetakeGuidance["shots"],
    checklist: value.checklist as RetakeGuidance["checklist"],
  };
}

function hasDisclaimer(value: Record<string, unknown>): value is Record<string, unknown> & { disclaimer: string } {
  return typeof value.disclaimer === "string" && value.disclaimer.trim() !== "";
}

function readServerMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
