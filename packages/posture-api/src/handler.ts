import { analyze, ValidationError, type AnalyzeResult, type MultimodalProvider } from "posture-core";

import { ApiError } from "./errors.js";
import { MAX_IMAGE_BYTES, readImagePair } from "./images.js";

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
 * Handle one analysis request.
 * The photos and the report exist only as locals in this call: the JSON response
 * is the only copy that leaves the function.
 */
export async function handleAnalyzeRequest(request: Request, options: AnalyzeHandlerOptions): Promise<Response> {
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
  if (!options.provider || typeof options.provider.analyzePosture !== "function") {
    throw new TypeError("handleAnalyzeRequest requires a MultimodalProvider");
  }

  let pair: Awaited<ReturnType<typeof readImagePair>>;
  try {
    pair = await readImagePair(request, options.maxImageBytes ?? MAX_IMAGE_BYTES);
  } catch (error) {
    if (error instanceof ApiError) return errorJson(error);
    throw error;
  }

  try {
    const result = await analyze(pair.front, pair.side, { provider: options.provider });
    return resultJson(result);
  } catch (error) {
    logAnalyzeFailure(error);
    return json(502, { error: "analysis_failed", message: "分析暂时无法完成，请稍后重试。" });
  }
}

function resultJson(result: AnalyzeResult): Response {
  if (result.status === "report") {
    return json(200, { report: result.report });
  }
  const status = result.retakeGuidance.code === "missing_image" ? 400 : 422;
  return json(status, { retakeGuidance: result.retakeGuidance });
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
