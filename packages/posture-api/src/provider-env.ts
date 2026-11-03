import {
  mockReportDraft,
  type AnalyzePostureRequest,
  type ModelReportInput,
  type MultimodalProvider,
} from "posture-core";

import { OpenAiCompatibleProvider } from "./openai-provider.js";

export interface ProviderDependencies {
  fetchImpl?: typeof fetch;
}

/**
 * Fixed Chinese draft with no retained photos.
 * `MockMultimodalProvider` from the core keeps every call for unit tests; this one does not.
 */
class StatelessMockProvider implements MultimodalProvider {
  async analyzePosture(_input: AnalyzePostureRequest): Promise<ModelReportInput> {
    return mockReportDraft();
  }
}

/**
 * Build the provider for this process.
 * `env` is the only place vendor credentials are read. The request body cannot select a provider or supply a key.
 */
export function createProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  deps: ProviderDependencies = {},
): MultimodalProvider {
  const name = (env.POSTURE_PROVIDER ?? "").trim().toLowerCase();
  if (name === "mock") return new StatelessMockProvider();
  if (name === "openai" || name === "openai-compatible") {
    const apiKey = env.POSTURE_API_KEY;
    const model = env.POSTURE_MODEL;
    if (typeof apiKey !== "string" || apiKey.trim() === "") {
      throw new Error("POSTURE_API_KEY is required when POSTURE_PROVIDER=openai-compatible");
    }
    if (typeof model !== "string" || model.trim() === "") {
      throw new Error("POSTURE_MODEL is required when POSTURE_PROVIDER=openai-compatible");
    }
    const baseUrl = env.POSTURE_API_BASE_URL?.trim() || "https://api.openai.com/v1";
    return new OpenAiCompatibleProvider({
      apiKey,
      model,
      baseUrl,
      fetchImpl: deps.fetchImpl,
      timeoutMs: readTimeout(env.POSTURE_PROVIDER_TIMEOUT_MS),
    });
  }
  throw new Error("POSTURE_PROVIDER must be mock or openai-compatible");
}

function readTimeout(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 30_000;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("POSTURE_PROVIDER_TIMEOUT_MS must be a positive number");
  }
  return value;
}
