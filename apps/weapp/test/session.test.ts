import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { COPY } from "../src/copy.js";
import { createSessionStore } from "../src/session.js";
import type { LocalShot } from "../src/types.js";
import { sampleReport, sampleRetake } from "./fixtures.js";

function shot(view: "front" | "side", path = `wxfile://${view}.jpg`): LocalShot {
  return { view, tempFilePath: path, mediaType: "image/jpeg" };
}

describe("session store", () => {
  it("keeps only the current shots and report in memory", () => {
    const store = createSessionStore();
    assert.equal(store.replaceShot(shot("front")), null);
    store.replaceShot(shot("side"));
    store.setReport(sampleReport("本结果不是医疗诊断。"));
    const state = store.get();
    assert.equal(state.front?.tempFilePath, "wxfile://front.jpg");
    assert.equal(state.report?.issues.length, 2);
    assert.equal(state.retakeGuidance, null);

    if (state.front) state.front.tempFilePath = "mutated";
    assert.equal(store.get().front?.tempFilePath, "wxfile://front.jpg");
  });

  it("returns the previous temp path when a shot is replaced or removed", () => {
    const store = createSessionStore();
    store.replaceShot(shot("front", "wxfile://first.jpg"));
    assert.equal(store.replaceShot(shot("front", "wxfile://second.jpg")), "wxfile://first.jpg");
    assert.equal(store.removeShot("front"), "wxfile://second.jpg");
    assert.equal(store.get().front, null);
  });

  it("drops photos and the report when the mini program hides", () => {
    const store = createSessionStore();
    store.replaceShot(shot("front"));
    store.setReport(sampleReport("本结果不是医疗诊断。"));
    const hidden = store.onAppHide();
    assert.equal(hidden.cleared, true);
    assert.equal(hidden.frontPath, "wxfile://front.jpg");
    const state = store.get();
    assert.equal(state.front, null);
    assert.equal(state.side, null);
    assert.equal(state.report, null);
    assert.equal(state.notice, COPY.sessionEnded);
    assert.equal(JSON.stringify(state).includes("头前引"), false);
  });

  it("does not wipe photos while the camera or album is open", () => {
    const store = createSessionStore();
    store.replaceShot(shot("front"));
    store.markPicker(true);
    const hidden = store.onAppHide();
    assert.equal(hidden.cleared, false);
    assert.equal(hidden.frontPath, null);
    assert.equal(store.get().front?.tempFilePath, "wxfile://front.jpg");
    assert.equal(store.get().notice, null);
  });

  it("clear removes a retake and bumps the generation", () => {
    const store = createSessionStore();
    store.replaceShot(shot("side"));
    store.setRetake(sampleRetake());
    const before = store.generation();
    const removed = store.clear();
    assert.equal(removed.sidePath, "wxfile://side.jpg");
    assert.equal(store.get().retakeGuidance, null);
    assert.equal(store.generation(), before + 1);
  });
});
