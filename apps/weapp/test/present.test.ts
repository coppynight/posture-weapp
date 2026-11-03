import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { REPORT_DISCLAIMER } from "posture-core";

import { mediaTypeFromPath } from "../src/media-type.js";
import { captureView, REPORT_SECTION_ORDER, reportView } from "../src/present.js";
import { emptySessionState } from "../src/session.js";
import { sampleReport } from "./fixtures.js";

describe("report presentation", () => {
  it("puts the non-medical disclaimer ahead of findings and keeps the server text", () => {
    const view = reportView(sampleReport(REPORT_DISCLAIMER));
    assert.deepEqual(REPORT_SECTION_ORDER, ["disclaimer", "issues", "causes", "exercises"]);
    assert.equal(view.disclaimerProminent, true);
    assert.equal(view.disclaimer, REPORT_DISCLAIMER);
    assert.equal(view.disclaimerHeading, "非医疗诊断");
    assert.equal(view.issues[0]?.severityLabel, "中等");
    assert.equal(view.issues[1]?.severityLabel, "轻微");
    assert.match(view.causes[0]?.related ?? "", /^对应：头前引$/);
    assert.equal(view.exercises.length, 4);
    assert.match(view.exercises[0]?.addresses ?? "", /^针对：圆肩趋势$/);
    assert.match(view.sessionNote, /没有历史列表/);
  });
});

describe("capture presentation", () => {
  it("starts empty and tells the guest both photos are required", () => {
    const view = captureView(emptySessionState());
    assert.equal(view.ready, false);
    assert.equal(view.front.filled, false);
    assert.equal(view.side.filled, false);
    assert.equal(view.front.shootLabel, "拍摄");
    assert.equal(view.side.albumLabel, "从相册选择");
    assert.match(view.needBoth, /缺一不能分析/);
    assert.equal(view.retake, null);
    assert.equal(view.notice, null);
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
