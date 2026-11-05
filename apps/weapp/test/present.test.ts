import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { REPORT_DISCLAIMER } from "posture-core";

import { mediaTypeFromPath } from "../src/media-type.js";
import {
  captureView,
  REPORT_SECTION_ORDER,
  reportView,
  resolveCaptureStep,
  routeAfterRetake,
} from "../src/present.js";
import { emptySessionState } from "../src/session.js";
import { sampleReport, sampleRetake } from "./fixtures.js";

describe("report presentation", () => {
  it("reads overview, then problems, then actions, with the disclaimer first", () => {
    const view = reportView(sampleReport(REPORT_DISCLAIMER));
    assert.deepEqual(REPORT_SECTION_ORDER, ["overview", "problem", "action"]);
    assert.equal(view.overviewTitle, "总览");
    assert.equal(view.problemTitle, "问题");
    assert.equal(view.actionTitle, "动作");
    assert.equal(view.disclaimerProminent, true);
    assert.equal(view.disclaimer, REPORT_DISCLAIMER);
    assert.equal(view.disclaimerHeading, "非医疗诊断");
    assert.equal(view.overviewIssue?.title, "头前引");
    assert.equal(view.overviewIssue?.severityLabel, "中等");
    assert.equal("detail" in (view.overviewIssue ?? {}), false);
    assert.equal(view.countsLabel, "2 个问题 · 4 个动作");
    assert.deepEqual(
      view.problems.map((card) => card.title),
      ["头前引", "圆肩趋势", "未对应到某个问题"],
    );
    assert.equal(view.problems[0]?.severityLabel, "中等");
    assert.equal(view.problems[1]?.severityLabel, "轻微");
    assert.deepEqual(
      view.problems[0]?.guesses.map((guess) => guess.text),
      ["可能与长时间低头看屏幕有关。"],
    );
    assert.equal(view.problems[1]?.guesses.length, 0);
    assert.equal(view.problems[2]?.unmatched, true);
    assert.equal(view.problems[2]?.detail, "");
    assert.deepEqual(
      view.problems[2]?.guesses.map((guess) => guess.text),
      ["圆肩可能与胸前偏紧有关，这是猜测。"],
    );
    assert.equal(view.causesNote, "以下为训练向猜测，不是结论。");
    assert.equal(view.exercises.length, 4);
    assert.match(view.exercises[0]?.addresses ?? "", /^针对：圆肩趋势$/);
    assert.match(view.sessionNote, /没有历史列表/);
    assert.equal(view.shareLabel, "保存分享卡");
    assert.match(view.shareHint, /保存到相册/);
    assert.match(view.shareHint, /不含自拍照片/);
  });

  it("keeps problem cards in array order and points the overview at the strongest issue", () => {
    const report = sampleReport(REPORT_DISCLAIMER);
    report.issues = [
      { title: "圆肩趋势", detail: "先出现，程度较轻。", severity: "mild" },
      { title: "头前引", detail: "排在后面，但是更明显。", severity: "marked" },
    ];
    report.causeGuesses = [
      { guess: "没有对应标题。" },
      { relatedIssueTitle: "不存在的问题", guess: "标题对不上。" },
      { relatedIssueTitle: "头前引", guess: "写进头前引那张卡。" },
      { relatedIssueTitle: "圆肩趋势", guess: "写进先出现的那张卡。" },
    ];
    const view = reportView(report);
    assert.equal(view.overviewIssue?.title, "头前引");
    assert.equal(view.overviewIssue?.severityLabel, "较明显");
    assert.deepEqual(
      view.problems.map((card) => card.title),
      ["圆肩趋势", "头前引", "未对应到某个问题"],
    );
    assert.deepEqual(
      view.problems[0]?.guesses.map((guess) => guess.text),
      ["写进先出现的那张卡。"],
    );
    assert.deepEqual(
      view.problems[1]?.guesses.map((guess) => guess.text),
      ["写进头前引那张卡。"],
    );
    assert.deepEqual(
      view.problems[2]?.guesses.map((guess) => guess.text),
      ["没有对应标题。", "标题对不上。"],
    );
  });

  it("omits the unmatched card when every guess names an issue", () => {
    const report = sampleReport(REPORT_DISCLAIMER);
    report.causeGuesses = [{ relatedIssueTitle: "圆肩趋势", guess: "只对应圆肩。" }];
    const view = reportView(report);
    assert.equal(view.problems.some((card) => card.unmatched), false);
    assert.deepEqual(
      view.problems[1]?.guesses.map((guess) => guess.text),
      ["只对应圆肩。"],
    );
  });
});

describe("capture presentation", () => {
  it("starts on an empty front step with the next action unavailable", () => {
    const view = captureView(emptySessionState());
    assert.equal(view.step, "front");
    assert.equal(view.slot.view, "front");
    assert.equal(view.slot.filled, false);
    assert.equal(view.primaryAction, "next");
    assert.equal(view.primaryReady, false);
    assert.equal(view.primaryLabel, "下一步");
    assert.equal(view.title, "拍一张正面全身照");
    assert.equal(view.guide, "正对镜头，头顶到脚尖入画");
    assert.equal(view.slot.shootLabel, "拍摄");
    assert.match(view.aside, /无需登录/);
    assert.equal(view.backLabel, "");
    assert.equal(view.retake, null);
    assert.equal(view.notice, null);
    assert.equal(resolveCaptureStep(emptySessionState(), "side"), "front");
  });

  it("keeps the side step to a single slot and remembers that the front photo is chosen", () => {
    const state = emptySessionState();
    state.front = { view: "front", tempFilePath: "wxfile://front.jpg", mediaType: "image/jpeg" };
    const front = captureView(state, "front");
    assert.equal(front.primaryReady, true);
    assert.equal(front.slot.filled, true);
    assert.equal(front.slot.shootLabel, "重新拍摄");
    assert.equal(front.slot.albumLabel, "重新选择");
    const side = captureView(state, "side");
    assert.equal(resolveCaptureStep(state, "side"), "side");
    assert.equal(side.step, "side");
    assert.equal(side.stepLabel, "侧面");
    assert.equal(side.slot.view, "side");
    assert.equal(side.slot.filled, false);
    assert.equal(side.slot.albumLabel, "从相册选择");
    assert.equal(side.primaryAction, "analyze");
    assert.equal(side.primaryReady, false);
    assert.equal(side.primaryLabel, "开始分析");
    assert.equal(side.title, "再拍一张侧面全身照");
    assert.equal(side.guide, "身体侧对镜头，头顶到脚尖入画");
    assert.match(side.aside, /缺一不能分析/);
    assert.equal(side.backLabel, "返回修改正面");
    assert.match(side.frontChosenLabel, /正面已选/);
    assert.equal(JSON.stringify(side).includes("wxfile://front.jpg"), false);
  });

  it("locks the side step while analysis is running", () => {
    const state = emptySessionState();
    state.front = { view: "front", tempFilePath: "wxfile://front.jpg", mediaType: "image/jpeg" };
    state.side = { view: "side", tempFilePath: "wxfile://side.jpg", mediaType: "image/jpeg" };
    state.submitting = true;
    const view = captureView(state, "side");
    assert.equal(view.submitting, true);
    assert.equal(view.primaryReady, false);
    assert.equal(view.primaryLabel, "正在分析…");
  });

  it("puts a side-only retake on the side step and leaves the front step clear", () => {
    const state = emptySessionState();
    state.front = { view: "front", tempFilePath: "wxfile://front.jpg", mediaType: "image/jpeg" };
    state.side = { view: "side", tempFilePath: "wxfile://side.jpg", mediaType: "image/jpeg" };
    const guidance = sampleRetake();
    state.retakeGuidance = guidance;
    assert.equal(routeAfterRetake(guidance), "side");
    const side = captureView(state, "side");
    assert.equal(side.retake?.summary, guidance.summary);
    assert.deepEqual(side.retake?.checklist, guidance.checklist);
    assert.deepEqual(side.retake?.messages, guidance.shots[0]?.messages);
    assert.equal(side.slot.needsRetake, true);
    assert.equal(side.otherRetakeNote, "");
    const front = captureView(state, "front");
    assert.equal(front.retake, null);
    assert.equal(front.slot.needsRetake, false);
    assert.equal(front.otherRetakeNote, "");
  });

  it("routes a front retake to the front step and keeps the other photo's messages there only as a note", () => {
    const state = emptySessionState();
    state.front = { view: "front", tempFilePath: "wxfile://front.jpg", mediaType: "image/jpeg" };
    state.side = { view: "side", tempFilePath: "wxfile://side.jpg", mediaType: "image/jpeg" };
    const guidance = sampleRetake();
    guidance.shots = [
      { view: "front", problem: "poor_quality", reasons: ["blur"], messages: ["正面模糊。"] },
      { view: "side", problem: "poor_quality", reasons: ["low_resolution"], messages: ["侧面太糊。"] },
    ];
    state.retakeGuidance = guidance;
    assert.equal(routeAfterRetake(guidance), "front");
    const front = captureView(state, "front");
    assert.deepEqual(front.retake?.messages, ["正面模糊。"]);
    assert.equal(front.slot.needsRetake, true);
    assert.match(front.otherRetakeNote, /侧面也要重拍/);
    const side = captureView(state, "side");
    assert.deepEqual(side.retake?.messages, ["侧面太糊。"]);
    assert.equal(side.otherRetakeNote, "");
    assert.equal(JSON.stringify(side.retake).includes("正面模糊"), false);
  });
});

describe("photo types", () => {
  it("maps temp paths onto jpeg, png, or webp", () => {
    assert.equal(mediaTypeFromPath("wxfile://tmp_1.jpg"), "image/jpeg");
    assert.equal(mediaTypeFromPath("http://tmp/a.JPEG?from=album"), "image/jpeg");
    assert.equal(mediaTypeFromPath("wxfile://tmp/a.PNG"), "image/png");
    assert.equal(mediaTypeFromPath("wxfile://tmp/a.webp"), "image/webp");
    assert.equal(mediaTypeFromPath("wxfile://tmp/a.heic"), null);
    assert.equal(mediaTypeFromPath("wxfile://tmp/a.gif"), null);
    assert.equal(mediaTypeFromPath("http://tmp/wx4f8c1234"), "image/jpeg");
  });
});
