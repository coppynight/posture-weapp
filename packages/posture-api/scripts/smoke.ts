import assert from "node:assert/strict";

import type { MultimodalProvider } from "posture-core";

import { createProviderFromEnv } from "../src/provider-env.js";
import { imageForm, loadImage, readJson, withServer } from "../test/helpers.js";

const front = loadImage("ok-front.png");
const side = loadImage("ok-side.png");
const poorSide = loadImage("poor-side.png");

let calls = 0;
const inner = createProviderFromEnv({ POSTURE_PROVIDER: "mock" });
const provider: MultimodalProvider = {
  async analyzePosture(input) {
    calls += 1;
    return inner.analyzePosture(input);
  },
};

await withServer({ provider }, async (base) => {
  const poorResponse = await fetch(`${base}/v1/analyze`, {
    method: "POST",
    body: imageForm({ front, side: poorSide }),
  });
  const poorBody = await readJson(poorResponse);
  assert.equal(poorResponse.status, 422);
  assert.equal(calls, 0);
  assert.equal("report" in poorBody, false);
  const poorGuidance = poorBody.retakeGuidance as { code?: string; summary?: string };
  assert.equal(poorGuidance.code, "poor_quality");

  const missingResponse = await fetch(`${base}/v1/analyze`, {
    method: "POST",
    body: imageForm({ front }),
  });
  const missingBody = await readJson(missingResponse);
  assert.equal(missingResponse.status, 400);
  assert.equal(calls, 0);
  assert.equal("report" in missingBody, false);
  const missingGuidance = missingBody.retakeGuidance as { code?: string; summary?: string };
  assert.equal(missingGuidance.code, "missing_image");

  const okResponse = await fetch(`${base}/v1/analyze`, {
    method: "POST",
    body: imageForm({ front, side }),
  });
  const okBody = await readJson(okResponse);
  assert.equal(okResponse.status, 200);
  assert.equal(calls, 1);
  const report = okBody.report as {
    disclaimer?: string;
    issues?: unknown[];
    causeGuesses?: unknown[];
    exerciseSuggestions?: unknown[];
  };
  assert.match(report.disclaimer ?? "", /不是医疗诊断/);
  assert.ok((report.issues?.length ?? 0) >= 1);
  assert.ok((report.causeGuesses?.length ?? 0) >= 1);
  assert.ok((report.exerciseSuggestions?.length ?? 0) >= 3);
  assert.ok((report.exerciseSuggestions?.length ?? 0) <= 5);
  assert.equal("retakeGuidance" in okBody, false);

  console.log("smoke ok");
  console.log(`valid ${okResponse.status} disclaimer=${report.disclaimer}`);
  console.log(`missing ${missingResponse.status} code=${missingGuidance.code} summary=${missingGuidance.summary}`);
  console.log(`poor ${poorResponse.status} code=${poorGuidance.code} summary=${poorGuidance.summary} providerCalls=${calls}`);
});
