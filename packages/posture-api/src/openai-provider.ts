import { Buffer } from "node:buffer";

import type { AnalyzePostureRequest, MultimodalProvider, PostureImage } from "posture-core";

import { isRecord } from "./is-record.js";

export interface OpenAiCompatibleConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Chat-completions vision adapter.
 * The API key stays on this instance (from the environment) and is not read from the request.
 * Request payloads are local to `analyzePosture` and are not retained.
 */
export class OpenAiCompatibleProvider implements MultimodalProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: OpenAiCompatibleConfig) {
    if (config.apiKey.trim() === "") {
      throw new Error("POSTURE_API_KEY is required when POSTURE_PROVIDER=openai-compatible");
    }
    if (config.model.trim() === "") {
      throw new Error("POSTURE_MODEL is required when POSTURE_PROVIDER=openai-compatible");
    }
    const timeoutMs = config.timeoutMs ?? 30_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error("POSTURE_PROVIDER_TIMEOUT_MS must be a positive number");
    }
    this.apiKey = config.apiKey.trim();
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.model = config.model.trim();
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = timeoutMs;
  }

  async analyzePosture(input: AnalyzePostureRequest): Promise<string> {
    const payload = {
      model: this.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: input.userPrompt,
            },
            { type: "image_url", image_url: { url: dataUrl(input.front) } },
            { type: "image_url", image_url: { url: dataUrl(input.side) } },
          ],
        },
      ],
    };

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new Error("Provider request timed out");
      }
      throw new Error("Provider request failed");
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Provider request failed with status ${response.status}`);
    }

    const payloadJson: unknown = await response.json();
    return unwrapModelText(readContent(payloadJson));
  }
}

function dataUrl(image: PostureImage): string {
  return `data:${image.mediaType};base64,${Buffer.from(image.data).toString("base64")}`;
}

function readContent(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.choices) || payload.choices.length === 0) {
    throw new Error("Provider returned no choices");
  }
  const first = payload.choices[0];
  if (!isRecord(first) || !isRecord(first.message) || typeof first.message.content !== "string") {
    throw new Error("Provider returned no text content");
  }
  return first.message.content;
}

function unwrapModelText(content: string): string {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return (fenced?.[1] ?? trimmed).trim();
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("POSTURE_API_BASE_URL must be an http(s) URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("POSTURE_API_BASE_URL must be an http(s) URL");
  }
  return url.toString().replace(/\/$/, "");
}
