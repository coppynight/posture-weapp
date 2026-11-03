import { ReportValidationError, RetakeGuidanceValidationError } from "./errors.js";
import { gateImagePair } from "./quality.js";
import type { MultimodalProvider } from "./provider.js";
import { DEFAULT_USER_PROMPT, resolveSystemPrompt } from "./prompt.js";
import { validateReport, validateRetakeGuidance } from "./schema.js";
import type { AnalyzeResult, PostureImage } from "./types.js";

export interface AnalyzeOptions {
  /** Required. Swap vendors by passing another MultimodalProvider. */
  provider: MultimodalProvider;
  /**
   * UTF-8 file that replaces the built-in system prompt.
   * When omitted, the library sends its fixed prompt.
   */
  systemPromptPath?: string;
}

/**
 * Turn a front photo and a side photo into a training report.
 * Missing photos and failed quality checks return retake guidance and do not
 * call `provider.analyzePosture`.
 */
export async function analyze(
  front: PostureImage | null | undefined,
  side: PostureImage | null | undefined,
  options: AnalyzeOptions,
): Promise<AnalyzeResult> {
  if (!options?.provider || typeof options.provider.analyzePosture !== "function") {
    throw new TypeError("analyze requires a MultimodalProvider");
  }

  const gated = gateImagePair(front, side);
  if (gated.status === "retake") {
    const validatedGuidance = validateRetakeGuidance(gated.retakeGuidance);
    if (!validatedGuidance.ok) {
      throw new RetakeGuidanceValidationError(validatedGuidance.errors);
    }
    return { status: "retake", retakeGuidance: validatedGuidance.value };
  }

  const systemPrompt = resolveSystemPrompt(options.systemPromptPath);
  const raw = await options.provider.analyzePosture({
    front: gated.front,
    side: gated.side,
    systemPrompt,
    userPrompt: DEFAULT_USER_PROMPT,
  });
  const validated = validateReport(raw, { stampDisclaimer: true });
  if (!validated.ok) {
    throw new ReportValidationError(validated.errors);
  }
  return { status: "report", report: validated.value };
}
