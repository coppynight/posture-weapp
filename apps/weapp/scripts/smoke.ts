import assert from "node:assert/strict";

import { REPORT_DISCLAIMER, MockMultimodalProvider } from "posture-core";
import { listenUrl, startServer } from "posture-api";

import { analyzePhotos, createFetchTransport } from "../src/analyze.js";
import { submitAnalysis } from "../src/flow.js";
import { reportView } from "../src/present.js";
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
  assert.ok(view.exercises.length >= 3 && view.exercises.length <= 5);

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
  console.log(`report issue=${view.issues[0]?.title ?? ""} exercises=${view.exercises.length}`);
  console.log(`disclaimer=${view.disclaimerHeading}`);
  console.log(`retake=${retakeOutcome.retakeGuidance.code} ${retakeOutcome.retakeGuidance.summary}`);
  console.log(`single photo blocked: ${store.get().notice ?? ""}`);
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
