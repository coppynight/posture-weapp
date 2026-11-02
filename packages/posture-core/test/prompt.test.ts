import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { DEFAULT_SYSTEM_PROMPT, resolveSystemPrompt, SystemPromptError } from "../src/index.js";

describe("system prompt", () => {
  it("defaults to the fixed Simplified Chinese training prompt", () => {
    assert.equal(resolveSystemPrompt(), DEFAULT_SYSTEM_PROMPT);
    assert.match(DEFAULT_SYSTEM_PROMPT, /简体中文/);
    assert.match(DEFAULT_SYSTEM_PROMPT, /不是医疗诊断/);
    assert.match(DEFAULT_SYSTEM_PROMPT, /3 到 5/);
    assert.match(DEFAULT_SYSTEM_PROMPT, /通用健身/);
    assert.match(DEFAULT_SYSTEM_PROMPT, /禁止/);
    assert.match(DEFAULT_SYSTEM_PROMPT, /猜测/);
  });

  it("reads a replacement prompt from a path", () => {
    const directory = mkdtempSync(join(tmpdir(), "posture-prompt-"));
    const path = join(directory, "custom.txt");
    writeFileSync(path, "\n自定义提示词\n", "utf8");
    assert.equal(resolveSystemPrompt(path), "自定义提示词");
  });

  it("rejects an empty or missing prompt file", () => {
    const directory = mkdtempSync(join(tmpdir(), "posture-prompt-"));
    const emptyPath = join(directory, "empty.txt");
    writeFileSync(emptyPath, "   \n", "utf8");
    assert.throws(() => resolveSystemPrompt(emptyPath), SystemPromptError);
    assert.throws(() => resolveSystemPrompt(join(directory, "missing.txt")), SystemPromptError);
  });
});
