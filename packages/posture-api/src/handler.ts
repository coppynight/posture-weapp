import {
  analyze,
  gateImagePair,
  RetakeGuidanceValidationError,
  validateRetakeGuidance,
  ValidationError,
  type AnalyzeResult,
  type MultimodalProvider,
  type RetakeGuidance,
} from "posture-core";

import { ApiError } from "./errors.js";
import { MAX_IMAGE_BYTES, readImagePair, type ParsedImagePair, type UploadedShot } from "./images.js";

export const ANALYZE_PATH = "/v1/analyze";
export const HEALTH_PATH = "/healthz";

export interface AnalyzeHandlerOptions {
  /** Swappable multimodal backend. Tests pass a mock; production reads it from the environment. */
  provider: MultimodalProvider;
  maxImageBytes?: number;
}

/** Pathname without a query string or a trailing slash. */
export function normalizePath(url: string | undefined): string {
  const withoutQuery = (url ?? "/").split("?")[0] ?? "/";
  const collapsed = withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, "") : withoutQuery;
  return collapsed || "/";
}

/**
 * Route one HTTP request.
 * Analysis itself is `handleAnalyze`. Photos and reports stay local to that call.
 */
export async function handleRequest(request: Request, options: AnalyzeHandlerOptions): Promise<Response> {
  const path = normalizePath(new URL(request.url).pathname);
  if (path === HEALTH_PATH) {
    if (request.method !== "GET") {
      return json(405, { error: "method_not_allowed", message: "健康检查请使用 GET。" }, "GET");
    }
    return json(200, { ok: true });
  }
  if (path !== ANALYZE_PATH) {
    return json(404, { error: "not_found", message: "未知路径。" });
  }
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed", message: "请使用 POST 上传正面和侧面照片。" }, "POST");
  }
  return handleAnalyze(request, options);
}

async function handleAnalyze(request: Request, options: AnalyzeHandlerOptions): Promise<Response> {
  if (!options.provider || typeof options.provider.analyzePosture !== "function") {
    throw new TypeError("handleAnalyze requires a MultimodalProvider");
  }

  let pair: ParsedImagePair;
  try {
    pair = await readImagePair(request, options.maxImageBytes ?? MAX_IMAGE_BYTES);
  } catch (error) {
    if (error instanceof ApiError) return errorJson(error);
    throw error;
  }

  try {
    const result = await analyzeUploadedPair(pair, options.provider);
    return resultJson(result);
  } catch (error) {
    logAnalyzeFailure(error);
    return json(502, { error: "analysis_failed", message: "分析暂时无法完成，请稍后重试。" });
  }
}

/**
 * Valid supported photos go through `analyze`.
 * A missing or unsupported upload uses the core quality gate directly so this
 * package does not invent a media type.
 */
async function analyzeUploadedPair(pair: ParsedImagePair, provider: MultimodalProvider): Promise<AnalyzeResult> {
  if (pair.front.kind === "photo" && pair.side.kind === "photo") {
    return analyze(pair.front.image, pair.side.image, { provider });
  }
  const gated = gateImagePair(gateInput(pair.front), gateInput(pair.side));
  if (gated.status === "ready") {
    return analyze(gated.front, gated.side, { provider });
  }
  const validated = validateRetakeGuidance(gated.retakeGuidance);
  if (!validated.ok) {
    throw new RetakeGuidanceValidationError(validated.errors);
  }
  return { status: "retake", retakeGuidance: validated.value };
}

function gateInput(shot: UploadedShot): unknown {
  switch (shot.kind) {
    case "missing":
      return null;
    case "photo":
      return shot.image;
    case "unsupported": {
      const input: { data: Uint8Array; mediaType: string; sharpness?: number } = {
        data: shot.data,
        mediaType: shot.declaredType,
      };
      if (shot.sharpness !== undefined) input.sharpness = shot.sharpness;
      return input;
    }
    default: {
      const unexpected: never = shot;
      throw new Error(`Unexpected upload kind: ${JSON.stringify(unexpected)}`);
    }
  }
}

function resultJson(result: AnalyzeResult): Response {
  switch (result.status) {
    case "report":
      return json(200, { report: result.report });
    case "retake":
      return json(statusForRetakeCode(result.retakeGuidance.code), { retakeGuidance: result.retakeGuidance });
    default: {
      const unexpected: never = result;
      throw new Error(`Unexpected analyze result: ${JSON.stringify(unexpected)}`);
    }
  }
}

function statusForRetakeCode(code: RetakeGuidance["code"]): number {
  switch (code) {
    case "missing_image":
      return 400;
    case "poor_quality":
      return 422;
    default: {
      const unexpected: never = code;
      throw new Error(`Unexpected retake code: ${String(unexpected)}`);
    }
  }
}

function errorJson(error: ApiError): Response {
  return json(error.status, { error: error.code, message: error.message });
}

function logAnalyzeFailure(error: unknown): void {
  if (error instanceof ValidationError) {
    console.error(`analyze failed: ${error.name}: ${error.message}`);
    return;
  }
  console.error(`analyze failed: ${error instanceof Error ? error.name : "unknown"}`);
}

function json(status: number, body: unknown, allow?: string): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  if (allow) headers.set("allow", allow);
  return new Response(JSON.stringify(body), { status, headers });
}
