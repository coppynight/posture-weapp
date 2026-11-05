import assert from "node:assert/strict";

import { REPORT_DISCLAIMER, MockMultimodalProvider } from "posture-core";
import { listenUrl, startServer } from "posture-api";

import { analyzePhotos, createFetchTransport } from "../src/analyze.js";
import { submitAnalysis } from "../src/flow.js";
import { reportView } from "../src/present.js";
import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH, SHARE_SAVE_API, layoutShareCard } from "../src/share-card.js";
import { createSessionStore } from "../src/session.js";
import type { Transport } from "../src/types.js";
import { loadPhoto } from "../test/fixtures.js";

const provider = new MockMultimodalProvider();
const server = await startServer({ provider, host: "127.0.0.1", port: 0 });
const baseUrl = listenUrl(server);

try {
  const store = createSessionStore();
  store.replaceShot({ view: "front", tempFilePath: "wxfile://front.jpg", mediaType: "image/jpeg" });
  const transport: Transport = {
    postJson() {
      throw new Error("single photo must not be uploaded");
    },
  };
  const blocked = await submitAnalysis(store, {
    transport,
    baseUrl,
    read() {
      throw new Error("single photo must not be read");
    },
    unlink() {},
    openReport() {
      throw new Error("single photo must not open a report");
    },
  });
  assert.equal(blocked, "blocked");
  assert.match(store.get().notice ?? "", /侧面/);

  const reportOutcome = await analyzePhotos(
    createFetchTransport(fetch),
    baseUrl,
    loadPhoto("ok-front.png"),
    loadPhoto("ok-side.png"),
  );
  assert.equal(reportOutcome.kind, "report");
  if (reportOutcome.kind !== "report") throw new Error("expected a report");
  const view = reportView(reportOutcome.report);
  assert.equal(view.disclaimer, REPORT_DISCLAIMER);
  assert.equal(view.disclaimerProminent, true);
  assert.deepEqual([view.overviewTitle, view.problemTitle, view.actionTitle], ["总览", "问题", "动作"]);
  assert.ok(view.problems.length >= 1);
  assert.ok(view.exercises.length >= 3 && view.exercises.length <= 5);
  const card = layoutShareCard(reportOutcome.report);
  assert.ok(card);
  if (!card) throw new Error("expected a share card");
  assert.equal(card.width, SHARE_CARD_WIDTH);
  assert.equal(card.height, SHARE_CARD_HEIGHT);
  const cardText = card.lines.map((line) => line.text).join("");
  assert.equal(cardText.includes("非医疗诊断"), true);
  assert.equal(cardText.includes("总览"), true);
  assert.equal(cardText.includes("问题"), true);
  assert.equal(cardText.includes("动作"), true);
  assert.equal(cardText.includes(reportOutcome.report.disclaimer), true);
  for (const exercise of reportOutcome.report.exerciseSuggestions) {
    assert.equal(cardText.includes(exercise.name), true);
  }
  assert.equal(SHARE_SAVE_API, "saveImageToPhotosAlbum");

  const retakeOutcome = await analyzePhotos(
    createFetchTransport(fetch),
    baseUrl,
    loadPhoto("ok-front.png"),
    loadPhoto("poor-side.png"),
  );
  assert.equal(retakeOutcome.kind, "retake");
  if (retakeOutcome.kind !== "retake") throw new Error("expected retake guidance");
  assert.equal(retakeOutcome.retakeGuidance.code, "poor_quality");
  assert.equal(provider.calls.length, 1);

  console.log("weapp smoke ok");
  console.log(`report issue=${view.overviewIssue?.title ?? ""} exercises=${view.exercises.length}`);
  console.log(`disclaimer=${view.disclaimerHeading}`);
  console.log(`share=${SHARE_SAVE_API} ${card.width}x${card.height}`);
  console.log(`retake=${retakeOutcome.retakeGuidance.code} ${retakeOutcome.retakeGuidance.summary}`);
  console.log(`single photo blocked: ${store.get().notice ?? ""}`);
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
