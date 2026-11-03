import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { describe, it } from "node:test";

import { COPY } from "../src/copy.js";
import { analyzePhotos, analyzeUrl, createFetchTransport, interpretAnalyzeResponse } from "../src/analyze.js";
import { captureView } from "../src/present.js";
import { createSessionStore } from "../src/session.js";
import { sampleReport, sampleRetake } from "./fixtures.js";

const disclaimer = "本结果只供训练参考，不是医疗诊断。";

describe("analyze URL", () => {
  it("targets POST /v1/analyze on the configured origin", () => {
    assert.equal(analyzeUrl("http://127.0.0.1:8787"), "http://127.0.0.1:8787/v1/analyze");
    assert.equal(analyzeUrl("https://example.com/api/"), "https://example.com/api/v1/analyze");
    assert.throws(() => analyzeUrl("ftp://example.com"));
    assert.throws(() => analyzeUrl(""));
  });
});

describe("interpret T2 responses", () => {
  it("accepts a report and keeps the server disclaimer", () => {
    const report = sampleReport(disclaimer);
    const outcome = interpretAnalyzeResponse(200, JSON.stringify({ report }));
    assert.equal(outcome.kind, "report");
    if (outcome.kind !== "report") return;
    assert.equal(outcome.report.disclaimer, disclaimer);
    assert.equal(outcome.report.exerciseSuggestions.length, 4);
    assert.equal("retakeGuidance" in outcome, false);
  });

  it("renders sections without rechecking core field rules", () => {
    const outcome = interpretAnalyzeResponse(
      200,
      JSON.stringify({
        report: {
          disclaimer,
          issues: [{ title: "头前引", detail: "侧面可见。", severity: "not-a-core-code" }],
          causeGuesses: [{ guess: "一句观察。" }],
          exerciseSuggestions: [{ name: "靠墙天使", instruction: "背靠墙抬臂。" }],
        },
      }),
    );
    assert.equal(outcome.kind, "report");
    if (outcome.kind !== "report") return;
    assert.equal(outcome.report.issues[0]?.severity, "not-a-core-code");

    const retake = interpretAnalyzeResponse(
      422,
      JSON.stringify({
        retakeGuidance: {
          summary: "请重拍侧面。",
          shots: [{ view: "side", messages: ["请重拍侧面。"] }],
          checklist: ["头顶入画"],
        },
      }),
    );
    assert.equal(retake.kind, "retake");
    if (retake.kind !== "retake") return;
    assert.equal(retake.retakeGuidance.summary, "请重拍侧面。");
    assert.equal(retake.retakeGuidance.shots[0]?.view, "side");
  });

  it("refuses a report that omits the disclaimer", () => {
    const report = sampleReport(disclaimer);
    const { disclaimer: _removed, ...rest } = report;
    const outcome = interpretAnalyzeResponse(200, JSON.stringify({ report: rest }));
    assert.deepEqual(outcome, { kind: "error", message: COPY.missingDisclaimer });
  });

  it("returns retake guidance and does not invent findings", () => {
    const guidance = sampleRetake();
    const outcome = interpretAnalyzeResponse(422, JSON.stringify({ retakeGuidance: guidance, ignored: true }));
    assert.equal(outcome.kind, "retake");
    if (outcome.kind !== "retake") return;
    assert.equal(outcome.retakeGuidance.code, "poor_quality");
    assert.equal("issues" in outcome.retakeGuidance, false);
    assert.equal(JSON.stringify(outcome).includes("头前引"), false);

    const store = createSessionStore();
    store.setRetake(outcome.retakeGuidance);
    const view = captureView(store.get());
    assert.equal(view.retake?.summary, guidance.summary);
    assert.deepEqual(view.retake?.checklist, guidance.checklist);
    assert.equal(view.side.needsRetake, true);
    assert.equal(view.front.needsRetake, false);
    assert.equal("issues" in (view.retake ?? {}), false);
  });

  it("shows a server error message without a report", () => {
    const outcome = interpretAnalyzeResponse(
      413,
      JSON.stringify({ error: "payload_too_large", message: "单张照片过大，请压缩后重新上传。" }),
    );
    assert.deepEqual(outcome, { kind: "error", message: "单张照片过大，请压缩后重新上传。" });
    const broken = interpretAnalyzeResponse(502, "not-json");
    assert.equal(broken.kind, "error");
    if (broken.kind === "error") assert.equal(broken.message, COPY.badResponse);
  });
});

describe("client request", () => {
  it("posts JSON photos to /v1/analyze and does not send an analysis of its own", async () => {
    let method = "";
    let path = "";
    let authorization: string | undefined;
    let raw = "";
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      method = req.method ?? "";
      path = req.url ?? "";
      authorization = req.headers.authorization;
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      raw = Buffer.concat(chunks).toString("utf8");
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify({ report: sampleReport(disclaimer) }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("expected a tcp port");
    try {
      const outcome = await analyzePhotos(
        createFetchTransport(fetch),
        `http://127.0.0.1:${address.port}`,
        { mediaType: "image/jpeg", dataBase64: "aaa" },
        { mediaType: "image/png", dataBase64: "bbb" },
      );
      assert.equal(method, "POST");
      assert.equal(path, "/v1/analyze");
      assert.equal(authorization, undefined);
      const body = JSON.parse(raw) as Record<string, unknown>;
      assert.deepEqual(Object.keys(body).sort(), ["front", "side"]);
      assert.deepEqual(body.front, { mediaType: "image/jpeg", dataBase64: "aaa" });
      assert.deepEqual(body.side, { mediaType: "image/png", dataBase64: "bbb" });
      assert.equal(outcome.kind, "report");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it("turns a transport failure into a Chinese network prompt", async () => {
    const outcome = await analyzePhotos(
      {
        postJson() {
          return Promise.reject(new Error("offline"));
        },
      },
      "http://127.0.0.1:9",
      { mediaType: "image/jpeg", dataBase64: "aaa" },
      { mediaType: "image/jpeg", dataBase64: "bbb" },
    );
    assert.deepEqual(outcome, { kind: "error", message: COPY.network });
  });
});
