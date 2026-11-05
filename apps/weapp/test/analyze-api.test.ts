import assert from "node:assert/strict";
import type { Server } from "node:http";
import { describe, it } from "node:test";

import { REPORT_DISCLAIMER, MockMultimodalProvider, validateReport, validateRetakeGuidance } from "posture-core";
import { listenUrl, startServer } from "posture-api";

import { analyzePhotos, createFetchTransport } from "../src/analyze.js";
import { reportView } from "../src/present.js";
import { loadPhoto } from "./fixtures.js";

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

describe("guest client against T2", () => {
  it("completes one analysis without a token and shows the server disclaimer", async () => {
    const provider = new MockMultimodalProvider();
    const server = await startServer({ provider, host: "127.0.0.1", port: 0 });
    try {
      const outcome = await analyzePhotos(
        createFetchTransport(fetch),
        listenUrl(server),
        loadPhoto("ok-front.png"),
        loadPhoto("ok-side.png"),
      );
      assert.equal(outcome.kind, "report");
      if (outcome.kind !== "report") return;
      assert.equal(validateReport(outcome.report).ok, true);
      assert.equal(outcome.report.disclaimer, REPORT_DISCLAIMER);
      assert.match(outcome.report.disclaimer, /不是医疗诊断/);
      const view = reportView(outcome.report);
      assert.equal(view.disclaimerProminent, true);
      assert.equal(view.disclaimerHeading, "非医疗诊断");
      assert.equal(view.disclaimer, REPORT_DISCLAIMER);
      assert.equal(view.overviewTitle, "总览");
      assert.equal(view.problemTitle, "问题");
      assert.equal(view.actionTitle, "动作");
      assert.equal(view.overviewIssue?.title, "头前引");
      assert.ok(view.problems.length >= 1);
      assert.ok((view.problems[0]?.guesses.length ?? 0) >= 1);
      assert.ok(view.exercises.length >= 3);
      assert.ok(view.exercises.length <= 5);
      assert.equal(view.problems[0]?.title, "头前引");
      assert.equal(provider.calls.length, 1);
    } finally {
      await close(server);
    }
  });

  it("shows retake guidance for a poor photo and does not open a report", async () => {
    const provider = new MockMultimodalProvider();
    const server = await startServer({ provider, host: "127.0.0.1", port: 0 });
    try {
      const outcome = await analyzePhotos(
        createFetchTransport(fetch),
        listenUrl(server),
        loadPhoto("ok-front.png"),
        loadPhoto("poor-side.png"),
      );
      assert.equal(outcome.kind, "retake");
      if (outcome.kind !== "retake") return;
      assert.equal(validateRetakeGuidance(outcome.retakeGuidance).ok, true);
      assert.equal(outcome.retakeGuidance.code, "poor_quality");
      assert.match(outcome.retakeGuidance.summary, /重拍|补拍/);
      assert.ok(outcome.retakeGuidance.checklist.length >= 2);
      assert.equal(JSON.stringify(outcome).includes(REPORT_DISCLAIMER), false);
      assert.equal(provider.calls.length, 0);
    } finally {
      await close(server);
    }
  });
});
