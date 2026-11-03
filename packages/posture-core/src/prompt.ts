import { readFileSync } from "node:fs";

import { DEFAULT_SYSTEM_PROMPT } from "./default-system-prompt.js";
import { SystemPromptError } from "./errors.js";

export { DEFAULT_SYSTEM_PROMPT } from "./default-system-prompt.js";
export { DEFAULT_USER_PROMPT } from "./default-user-prompt.js";

const MAX_PROMPT_CHARS = 32_000;

/**
 * Resolve the system prompt sent to the multimodal provider.
 * Omit `systemPromptPath` to use the fixed prompt built into this library.
 */
export function resolveSystemPrompt(systemPromptPath?: string): string {
  if (systemPromptPath === undefined) {
    return DEFAULT_SYSTEM_PROMPT;
  }
  if (typeof systemPromptPath !== "string" || systemPromptPath.trim() === "") {
    throw new SystemPromptError("systemPromptPath must be a non-empty file path");
  }

  let text: string;
  try {
    text = readFileSync(systemPromptPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new SystemPromptError(`Could not read system prompt at ${systemPromptPath}: ${detail}`);
  }

  const trimmed = text.trim();
  if (trimmed === "") {
    throw new SystemPromptError(`System prompt file is empty: ${systemPromptPath}`);
  }
  if (trimmed.length > MAX_PROMPT_CHARS) {
    throw new SystemPromptError(
      `System prompt file exceeds ${MAX_PROMPT_CHARS} characters: ${systemPromptPath}`,
    );
  }
  return trimmed;
}
