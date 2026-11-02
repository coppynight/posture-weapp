import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  analyze,
  DEFAULT_SYSTEM_PROMPT,
  isReportResult,
  isRetakeResult,
  MockMultimodalProvider,
  REPORT_DISCLAIMER,
  ReportValidationError,
  validateReport,
  validateRetakeGuidance,
  type MultimodalProvider,
  type PostureImage,
} from "../src/index.js";
import { loadFixtureImage, loadPairFixture } from "./fixtures.js";

function trapProvider(): { provider: MultimodalProvider; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    provider: {
      async analyzePosture() {
        calls += 1;
        throw new Error("hard analysis was called");
      },
    },
  };
}

describe("analyze", () => {
  it("returns a report with a disclaimer when both images pass", async () => {
    const pair = loadPairFixture("acceptable-pair.json");
    const provider = new MockMultimodalProvider();

    const result = await analyze(pair.front, pair.side, { provider });

    assert.equal(isReportResult(result), true);
    assert.equal(result.status, "report");
    if (result.status !== "report") return;

    assert.equal(provider.calls.length, 1);
    assert.equal(provider.calls[0]?.systemPrompt, DEFAULT_SYSTEM_PROMPT);
    assert.equal(provider.calls[0]?.front.data, pair.front.data);
    assert.equal(provider.calls[0]?.front.mediaType, pair.front.mediaType);
    assert.equal(provider.calls[0]?.side.data, pair.side.data);
    assert.equal(provider.calls[0]?.side.mediaType, pair.side.mediaType);
    assert.equal(result.report.schemaVersion, 1);
    assert.ok(result.report.issues.length >= 1);
    assert.ok(result.report.causeGuesses.length >= 1);
    assert.ok(result.report.exerciseSuggestions.length >= 3);
    assert.ok(result.report.exerciseSuggestions.length <= 5);
    assert.equal(result.report.disclaimer, REPORT_DISCLAIMER);
    assert.match(result.report.disclaimer, /不是医疗诊断/);
    assert.equal(validateReport(result.report).ok, true);
    assert.equal("retakeGuidance" in result, false);
  });

  it("uses a replacement provider without calling the built-in mock", async () => {
    const pair = loadPairFixture("acceptable-pair.json");
    let calls = 0;
    const provider: MultimodalProvider = {
      async analyzePosture(input) {
        calls += 1;
        assert.equal(input.systemPrompt, DEFAULT_SYSTEM_PROMPT);
        return {
          issues: [
            {
              title: "骨盆侧倾",
              detail: "正面观下两侧髂嵴高度不一致。",
              severity: "mild",
            },
          ],
          causeGuesses: [
            {
              relatedIssueTitle: "骨盆侧倾",
              guess: "可能与单侧负重习惯有关，这是猜测。",
            },
          ],
          exerciseSuggestions: [
            { name: "侧平板", instruction: "侧撑保持身体成一条线，每侧 20 秒。", addresses: "骨盆侧倾" },
            { name: "臀桥", instruction: "仰卧屈膝，髋部抬到身体成一条直线，每组 10 次。", addresses: "骨盆侧倾" },
            { name: "鸟狗", instruction: "四肢撑地，对侧手脚缓慢伸直，每侧 8 次。", addresses: "骨盆侧倾" },
          ],
        };
      },
    };

    const result = await analyze(pair.front, pair.side, { provider });

    assert.equal(calls, 1);
    assert.equal(result.status, "report");
    if (result.status !== "report") return;
    assert.equal(result.report.issues[0]?.title, "骨盆侧倾");
    assert.equal(result.report.disclaimer, REPORT_DISCLAIMER);
  });

  it("stamps the canonical disclaimer when the model omits or rewrites it", async () => {
    const pair = loadPairFixture("acceptable-pair.json");
    const provider = new MockMultimodalProvider();
    provider.analyzePosture = async (input) => {
      provider.calls.push(input);
      return { ...providerDraftWithoutDisclaimer(), disclaimer: "相信我，我是医生。" };
    };

    const result = await analyze(pair.front, pair.side, { provider });
    assert.equal(result.status, "report");
    if (result.status !== "report") return;
    assert.equal(result.report.disclaimer, REPORT_DISCLAIMER);
  });

  it("does not call the provider when the front image is missing", async () => {
    const trap = trapProvider();
    const result = await analyze(null, loadFixtureImage("ok-side.png"), {
      provider: trap.provider,
      systemPromptPath: "/no/such/prompt.txt",
    });

    assert.equal(trap.calls(), 0);
    assert.equal(isRetakeResult(result), true);
    assert.equal(result.status, "retake");
    if (result.status !== "retake") return;
    assert.equal(result.retakeGuidance.code, "missing_image");
    assert.deepEqual(
      result.retakeGuidance.shots.map((shot) => shot.view),
      ["front"],
    );
    assert.match(result.retakeGuidance.summary, /不会做体态分析/);
    assert.match(result.retakeGuidance.shots[0]?.messages[0] ?? "", /正面/);
    assert.equal(validateRetakeGuidance(result.retakeGuidance).ok, true);
    assert.equal(JSON.stringify(result).includes("头前引"), false);
  });

  it("does not call the provider when the side image is missing", async () => {
    const trap = trapProvider();
    const result = await analyze(loadFixtureImage("ok-front.png"), undefined, { provider: trap.provider });

    assert.equal(trap.calls(), 0);
    assert.equal(result.status, "retake");
    if (result.status !== "retake") return;
    assert.equal(result.retakeGuidance.code, "missing_image");
    assert.equal(result.retakeGuidance.shots[0]?.view, "side");
    assert.match(result.retakeGuidance.shots[0]?.messages[0] ?? "", /侧面/);
    assert.equal("report" in result, false);
  });

  it("does not call the provider when both images are missing", async () => {
    const trap = trapProvider();
    const result = await analyze(undefined, null, { provider: trap.provider });

    assert.equal(trap.calls(), 0);
    assert.equal(result.status, "retake");
    if (result.status !== "retake") return;
    assert.deepEqual(
      result.retakeGuidance.shots.map((shot) => shot.view),
      ["front", "side"],
    );
    assert.equal(result.retakeGuidance.code, "missing_image");
  });

  it("does not inspect the provided photo when the other one is missing", async () => {
    const trap = trapProvider();
    const side = {
      get data(): Uint8Array {
        throw new Error("side photo was inspected");
      },
      mediaType: "image/png" as const,
    };

    const result = await analyze(null, side as PostureImage, { provider: trap.provider });

    assert.equal(trap.calls(), 0);
    assert.equal(result.status, "retake");
    if (result.status !== "retake") return;
    assert.equal(result.retakeGuidance.code, "missing_image");
  });

  it("does not call the provider for the poor-quality fixture", async () => {
    const pair = loadPairFixture("poor-quality-pair.json");
    const trap = trapProvider();

    const result = await analyze(pair.front, pair.side, { provider: trap.provider });

    assert.equal(trap.calls(), 0);
    assert.equal(result.status, "retake");
    if (result.status !== "retake") return;
    assert.equal(result.retakeGuidance.code, "poor_quality");
    assert.equal(result.retakeGuidance.shots.length, 1);
    assert.equal(result.retakeGuidance.shots[0]?.view, "side");
    assert.ok(result.retakeGuidance.shots[0]?.reasons.includes("low_resolution"));
    assert.match(result.retakeGuidance.summary, /重拍指引/);
    assert.match(result.retakeGuidance.summary, /不会做体态分析/);
    assert.equal(validateRetakeGuidance(result.retakeGuidance).ok, true);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("exerciseSuggestions"), false);
    assert.equal(serialized.includes("头前引"), false);
    assert.equal(serialized.includes("disclaimer"), false);
  });

  it("does not call the provider when the file is not a readable image", async () => {
    const trap = trapProvider();
    const junk: PostureImage = {
      data: new Uint8Array(64).fill(1),
      mediaType: "image/jpeg",
    };

    const result = await analyze(loadFixtureImage("ok-front.png"), junk, { provider: trap.provider });

    assert.equal(trap.calls(), 0);
    assert.equal(result.status, "retake");
    if (result.status !== "retake") return;
    assert.equal(result.retakeGuidance.code, "poor_quality");
    assert.equal(result.retakeGuidance.shots[0]?.view, "side");
    assert.ok(result.retakeGuidance.shots[0]?.reasons.includes("corrupt"));
  });

  it("does not call the provider when a clear photo is marked blurry", async () => {
    const trap = trapProvider();
    const result = await analyze(loadFixtureImage("ok-front.png", "image/png", 0.1), loadFixtureImage("ok-side.png"), {
      provider: trap.provider,
    });

    assert.equal(trap.calls(), 0);
    assert.equal(result.status, "retake");
    if (result.status !== "retake") return;
    assert.equal(result.retakeGuidance.code, "poor_quality");
    assert.equal(result.retakeGuidance.shots[0]?.view, "front");
    assert.ok(result.retakeGuidance.shots[0]?.reasons.includes("blurry"));
  });

  it("rejects invalid model output after the provider returns", async () => {
    const pair = loadPairFixture("acceptable-pair.json");
    let calls = 0;
    const provider: MultimodalProvider = {
      async analyzePosture() {
        calls += 1;
        return { issues: [] };
      },
    };

    await assert.rejects(() => analyze(pair.front, pair.side, { provider }), ReportValidationError);
    assert.equal(calls, 1);
  });

  it("sends a custom system prompt file only after both images pass", async () => {
    const pair = loadPairFixture("acceptable-pair.json");
    const directory = mkdtempSync(join(tmpdir(), "posture-prompt-"));
    const systemPromptPath = join(directory, "prompt.txt");
    writeFileSync(systemPromptPath, "  自定义系统提示词，仍要求简体中文训练建议。\n", "utf8");
    const provider = new MockMultimodalProvider();

    const blocked = await analyze(null, pair.side, { provider, systemPromptPath: "/missing/prompt.txt" });
    assert.equal(blocked.status, "retake");
    assert.equal(provider.calls.length, 0);

    const result = await analyze(pair.front, pair.side, { provider, systemPromptPath });
    assert.equal(provider.calls.length, 1);
    assert.equal(provider.calls[0]?.systemPrompt, "自定义系统提示词，仍要求简体中文训练建议。");
    assert.notEqual(provider.calls[0]?.systemPrompt, DEFAULT_SYSTEM_PROMPT);
    assert.equal(result.status, "report");
    if (result.status !== "report") return;
    assert.equal(result.report.disclaimer, REPORT_DISCLAIMER);
  });
});

function providerDraftWithoutDisclaimer(): {
  issues: { title: string; detail: string; severity: "moderate" | "mild" }[];
  causeGuesses: { relatedIssueTitle: string; guess: string }[];
  exerciseSuggestions: { name: string; instruction: string; addresses: string }[];
} {
  return {
    issues: [
      { title: "头前引", detail: "侧面观下，耳垂落在肩峰前方。", severity: "moderate" },
      { title: "圆肩趋势", detail: "正面观下，双肩略向前内扣。", severity: "mild" },
    ],
    causeGuesses: [
      { relatedIssueTitle: "头前引", guess: "可能与长时间低头看屏幕有关。这只是猜测。" },
      { relatedIssueTitle: "圆肩趋势", guess: "可能与上背发力不足有关。这只是猜测。" },
    ],
    exerciseSuggestions: [
      { name: "靠墙天使", instruction: "背靠墙，手臂沿墙上下滑动，每组 8 次。", addresses: "圆肩趋势" },
      { name: "弹力带面拉", instruction: "向面部拉弹力带并挤肩胛，每组 12 次。", addresses: "圆肩趋势" },
      { name: "仰卧收下巴", instruction: "仰卧收下巴，每组 10 次。", addresses: "头前引" },
    ],
  };
}
