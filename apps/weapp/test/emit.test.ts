import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

import { decideSubmit } from "../src/submit.js";
import type { LocalShot } from "../src/types.js";

const require = createRequire(import.meta.url);
const emitted = require("../miniprogram/lib/submit.js") as typeof import("../src/submit.js");
const present = require("../miniprogram/lib/present.js") as typeof import("../src/present.js");
const shareCard = require("../miniprogram/lib/share-card.js") as typeof import("../src/share-card.js");

function shot(view: "front" | "side"): LocalShot {
  return { view, tempFilePath: `wxfile://${view}.jpg`, mediaType: "image/jpeg" };
}

describe("emitted mini program lib", () => {
  it("blocks a single photo the same way as the source", () => {
    const fromSource = decideSubmit(shot("front"), null);
    const fromEmit = emitted.decideSubmit(shot("front"), null);
    assert.deepEqual(fromEmit, fromSource);
    assert.equal(fromEmit.ok, false);
    if (!fromEmit.ok) assert.match(fromEmit.message, /侧面/);
  });

  it("marks the disclaimer as prominent", () => {
    const view = present.reportView({
      schemaVersion: 1,
      disclaimer: "本结果不是医疗诊断。",
      issues: [{ title: "头前引", detail: "头相对躯干前移。", severity: "mild" }],
      causeGuesses: [{ guess: "可能与低头有关。" }],
      exerciseSuggestions: [
        { name: "靠墙天使", instruction: "背靠墙抬臂。" },
        { name: "鸟狗", instruction: "对侧手脚伸直。" },
        { name: "仰卧收下巴", instruction: "轻轻收下颌。" },
      ],
    });
    assert.equal(view.disclaimerProminent, true);
    assert.equal(view.disclaimerHeading, "非医疗诊断");
    assert.equal(view.overviewTitle, "总览");
    assert.equal(view.problemTitle, "问题");
    assert.equal(view.actionTitle, "动作");
    assert.equal(view.overviewIssue?.title, "头前引");
    assert.equal(view.problems.at(-1)?.title, "未对应到某个问题");
  });

  it("emits the album save path", () => {
    assert.equal(shareCard.SHARE_SAVE_API, "saveImageToPhotosAlbum");
    assert.equal(typeof shareCard.layoutShareCard, "function");
    assert.equal(typeof shareCard.saveShareCard, "function");
  });
});
