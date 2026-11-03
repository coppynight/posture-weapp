import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { COPY } from "../src/copy.js";
import type { PickDeps, SubmitDeps } from "../src/flow.js";
import { pickImage, removeImage, submitAnalysis } from "../src/flow.js";
import { createSessionStore, type SessionStore } from "../src/session.js";
import type { LocalShot, PhotoPayload, Transport } from "../src/types.js";
import { sampleReport, sampleRetake } from "./fixtures.js";

function shot(view: "front" | "side"): LocalShot {
  return { view, tempFilePath: `wxfile://${view}.jpg`, mediaType: "image/jpeg" };
}

function payload(view: "front" | "side"): PhotoPayload {
  return { mediaType: "image/jpeg", dataBase64: view === "front" ? "front-bytes" : "side-bytes" };
}

function recordingTransport(status: number, body: unknown): Transport & { calls: Array<{ url: string; body: unknown }> } {
  const calls: Array<{ url: string; body: unknown }> = [];
  return {
    calls,
    postJson(url, requestBody) {
      calls.push({ url, body: requestBody });
      return Promise.resolve({ status, text: JSON.stringify(body) });
    },
  };
}

function fillBoth(store: SessionStore): void {
  store.replaceShot(shot("front"));
  store.replaceShot(shot("side"));
}

function deps(partial: Partial<SubmitDeps> & { transport: Transport }): SubmitDeps & {
  opened: number;
  unlinked: Array<string | null>;
} {
  const unlinked: Array<string | null> = [];
  const bag = { opened: 0 };
  const api: SubmitDeps = {
    baseUrl: "http://127.0.0.1:8787/",
    read(shotToRead) {
      return Promise.resolve(payload(shotToRead.view));
    },
    unlink(filePath) {
      unlinked.push(filePath);
    },
    openReport() {
      bag.opened += 1;
    },
    ...partial,
  };
  return {
    ...api,
    unlinked,
    get opened() {
      return bag.opened;
    },
  };
}

describe("submit guard", () => {
  it("does not read or upload when only one photo is chosen", async () => {
    const store = createSessionStore();
    store.replaceShot(shot("front"));
    let reads = 0;
    const transport = recordingTransport(200, { report: sampleReport("不是医疗诊断") });
    const result = await submitAnalysis(
      store,
      deps({
        transport,
        read() {
          reads += 1;
          return Promise.reject(new Error("should not read"));
        },
      }),
    );
    assert.equal(result, "blocked");
    assert.equal(reads, 0);
    assert.equal(transport.calls.length, 0);
    assert.match(store.get().notice ?? "", /侧面/);
    assert.match(store.get().notice ?? "", /不能|缺少/);
    assert.equal(store.get().report, null);
  });

  it("names the missing front photo and refuses an empty pair", async () => {
    const transport = recordingTransport(200, {});
    const sideOnly = createSessionStore();
    sideOnly.replaceShot(shot("side"));
    assert.equal(await submitAnalysis(sideOnly, deps({ transport })), "blocked");
    assert.match(sideOnly.get().notice ?? "", /正面/);

    const empty = createSessionStore();
    assert.equal(await submitAnalysis(empty, deps({ transport })), "blocked");
    assert.match(empty.get().notice ?? "", /正面和侧面/);
    assert.equal(transport.calls.length, 0);
  });

  it("posts both photos once and opens the report without keeping the temp files", async () => {
    const store = createSessionStore();
    fillBoth(store);
    const transport = recordingTransport(200, { report: sampleReport("本结果不是医疗诊断。") });
    const used = deps({ transport });
    const result = await submitAnalysis(store, used);
    assert.equal(result, "report");
    assert.equal(transport.calls.length, 1);
    assert.equal(transport.calls[0]?.url, "http://127.0.0.1:8787/v1/analyze");
    assert.deepEqual(transport.calls[0]?.body, {
      front: { mediaType: "image/jpeg", dataBase64: "front-bytes" },
      side: { mediaType: "image/jpeg", dataBase64: "side-bytes" },
    });
    assert.equal(used.opened, 1);
    assert.deepEqual(used.unlinked, ["wxfile://front.jpg", "wxfile://side.jpg"]);
    assert.equal(store.get().front, null);
    assert.equal(store.get().side, null);
    assert.equal(store.get().report?.disclaimer, "本结果不是医疗诊断。");
    assert.equal(store.get().submitting, false);
  });

  it("keeps the photos and shows retake guidance instead of a report", async () => {
    const store = createSessionStore();
    fillBoth(store);
    const transport = recordingTransport(422, { retakeGuidance: sampleRetake() });
    const used = deps({ transport });
    const result = await submitAnalysis(store, used);
    assert.equal(result, "retake");
    assert.equal(used.opened, 0);
    assert.equal(store.get().report, null);
    assert.equal(store.get().retakeGuidance?.code, "poor_quality");
    assert.match(store.get().retakeGuidance?.summary ?? "", /重拍/);
    assert.equal(store.get().front?.tempFilePath, "wxfile://front.jpg");
    assert.equal(store.get().side?.tempFilePath, "wxfile://side.jpg");
  });

  it("ignores a second tap while the first request is still running", async () => {
    const store = createSessionStore();
    fillBoth(store);
    let release: (value: { status: number; text: string }) => void = () => {};
    let calls = 0;
    let markEntered: () => void = () => {};
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const transport: Transport = {
      postJson() {
        calls += 1;
        markEntered();
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    };
    const first = submitAnalysis(store, deps({ transport }));
    await entered;
    const second = await submitAnalysis(store, deps({ transport }));
    assert.equal(second, "blocked");
    assert.equal(calls, 1);
    release({ status: 200, text: JSON.stringify({ report: sampleReport("本结果不是医疗诊断。") }) });
    assert.equal(await first, "report");
  });

  it("does not restore a report if the guest leaves during the request", async () => {
    const store = createSessionStore();
    fillBoth(store);
    let release: (value: { status: number; text: string }) => void = () => {};
    let markEntered: () => void = () => {};
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const transport: Transport = {
      postJson() {
        markEntered();
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    };
    const pending = submitAnalysis(store, deps({ transport }));
    await entered;
    const hidden = store.onAppHide();
    assert.equal(hidden.cleared, true);
    release({ status: 200, text: JSON.stringify({ report: sampleReport("本结果不是医疗诊断。") }) });
    assert.equal(await pending, "blocked");
    assert.equal(store.get().report, null);
    assert.equal(store.get().notice, COPY.sessionEnded);
  });
});

describe("retake by picking again", () => {
  it("replaces one photo and clears stale guidance", async () => {
    const store = createSessionStore();
    fillBoth(store);
    store.setRetake(sampleRetake());
    const unlinked: Array<string | null> = [];
    const pickDeps: PickDeps = {
      async choose() {
        const hidden = store.onAppHide();
        assert.equal(hidden.cleared, false);
        return { status: "picked", tempFilePath: "wxfile://side-new.jpg" };
      },
      unlink(filePath) {
        unlinked.push(filePath);
      },
    };
    await pickImage(store, "side", "camera", pickDeps);
    assert.equal(store.get().front?.tempFilePath, "wxfile://front.jpg");
    assert.equal(store.get().side?.tempFilePath, "wxfile://side-new.jpg");
    assert.equal(store.get().side?.mediaType, "image/jpeg");
    assert.equal(store.get().retakeGuidance, null);
    assert.deepEqual(unlinked, ["wxfile://side.jpg"]);
  });

  it("explains an unsupported file and a cancelled pick", async () => {
    const store = createSessionStore();
    store.replaceShot(shot("front"));
    await pickImage(store, "side", "album", {
      choose: async () => ({ status: "picked", tempFilePath: "wxfile://side.heic" }),
      unlink() {},
    });
    assert.equal(store.get().side, null);
    assert.equal(store.get().notice, COPY.badType);

    await pickImage(store, "side", "album", {
      choose: async () => ({ status: "cancelled" }),
      unlink() {},
    });
    assert.equal(store.get().notice, COPY.badType);
    assert.equal(store.get().front?.tempFilePath, "wxfile://front.jpg");
  });

  it("removes one photo so analysis is blocked again", async () => {
    const store = createSessionStore();
    fillBoth(store);
    const unlinked: Array<string | null> = [];
    removeImage(store, "front", (filePath) => unlinked.push(filePath));
    assert.deepEqual(unlinked, ["wxfile://front.jpg"]);
    const transport = recordingTransport(200, { report: sampleReport("不是医疗诊断") });
    assert.equal(await submitAnalysis(store, deps({ transport })), "blocked");
    assert.equal(transport.calls.length, 0);
  });
});
