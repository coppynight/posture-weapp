import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_SYSTEM_PROMPT,
  REPORT_DISCLAIMER,
  validateReport,
  validateRetakeGuidance,
  type Report,
  type RetakeGuidance,
} from "posture-core";

import { countingProvider, imageForm, jsonImage, loadImage, readJson, responseText, toBlob, withServer } from "./helpers.js";

const CJK = /[\u4e00-\u9fff]/;

function assertReport(body: Record<string, unknown>): Report {
  assert.deepEqual(Object.keys(body).filter((key) => key !== "__raw"), ["report"]);
  const report = body.report as Report;
  assert.equal(validateReport(report).ok, true);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.disclaimer, REPORT_DISCLAIMER);
  assert.match(report.disclaimer, /不是医疗诊断/);
  assert.ok(report.issues.length >= 1);
  assert.ok(report.causeGuesses.length >= 1);
  assert.ok(report.exerciseSuggestions.length >= 3);
  assert.ok(report.exerciseSuggestions.length <= 5);
  for (const issue of report.issues) {
    assert.match(issue.title, CJK);
    assert.match(issue.detail, CJK);
  }
  for (const guess of report.causeGuesses) {
    assert.match(guess.guess, /可能|猜测/);
  }
  for (const suggestion of report.exerciseSuggestions) {
    assert.match(suggestion.name, CJK);
    assert.match(suggestion.instruction, CJK);
  }
  return report;
}

function assertRetake(body: Record<string, unknown>, code: "missing_image" | "poor_quality"): RetakeGuidance {
  assert.deepEqual(Object.keys(body).filter((key) => key !== "__raw"), ["retakeGuidance"]);
  const guidance = body.retakeGuidance as RetakeGuidance;
  const validated = validateRetakeGuidance(guidance);
  assert.equal(validated.ok, true, validated.ok ? "" : validated.errors.join("; "));
  assert.equal(guidance.code, code);
  assert.match(guidance.summary, CJK);
  assert.equal(responseText(body).includes(REPORT_DISCLAIMER), false);
  assert.equal("issues" in guidance, false);
  assert.match(
    [guidance.summary, ...guidance.checklist, ...guidance.shots.flatMap((shot) => shot.messages)].join("\n"),
    /缺少|补拍|重拍/,
  );
  return guidance;
}

describe("POST /v1/analyze", () => {
  it("returns 200 and a full Simplified Chinese report for two valid photos", async () => {
    const front = loadImage("ok-front.png");
    const side = loadImage("ok-side.png");
    const seen = countingProvider();

    await withServer({ provider: seen.provider }, async (base) => {
      const response = await fetch(`${base}/v1/analyze`, {
        method: "POST",
        body: imageForm({ front, side, frontName: "secret-patient.png" }),
      });
      const body = await readJson(response);

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.match(response.headers.get("content-type") ?? "", /application\/json/);
      const report = assertReport(body);
      assert.equal(responseText(body).includes("secret-patient"), false);
      assert.equal(seen.calls(), 1);
      assert.equal(seen.last()?.systemPrompt, DEFAULT_SYSTEM_PROMPT);
      assert.deepEqual(Buffer.from(seen.last()?.front.data ?? []), Buffer.from(front.data));
      assert.deepEqual(Buffer.from(seen.last()?.side.data ?? []), Buffer.from(side.data));
      assert.equal(report.issues[0]?.title, "头前引");
    });
  });

  it("uses the injected provider instead of a built-in report", async () => {
    const front = loadImage("ok-front.png");
    const side = loadImage("ok-side.png");
    const seen = countingProvider(async () => ({
      issues: [{ title: "骨盆侧倾", detail: "正面观下两侧髂嵴高度不一致。", severity: "mild" }],
      causeGuesses: [{ relatedIssueTitle: "骨盆侧倾", guess: "可能与单侧负重习惯有关，这是猜测。" }],
      exerciseSuggestions: [
        { name: "侧平板", instruction: "侧撑保持身体成一条线，每侧 20 秒。", addresses: "骨盆侧倾" },
        { name: "臀桥", instruction: "仰卧屈膝，髋部抬到身体成一条直线，每组 10 次。", addresses: "骨盆侧倾" },
        { name: "鸟狗", instruction: "四肢撑地，对侧手脚缓慢伸直，每侧 8 次。", addresses: "骨盆侧倾" },
      ],
    }));

    await withServer({ provider: seen.provider }, async (base) => {
      const response = await fetch(`${base}/v1/analyze`, {
        method: "POST",
        body: imageForm({ front, side }),
      });
      const body = await readJson(response);
      const report = assertReport(body);
      assert.equal(report.issues[0]?.title, "骨盆侧倾");
      assert.equal(seen.calls(), 1);
    });
  });

  it("accepts the same pair as JSON base64, including a data-URL prefix", async () => {
    const front = loadImage("ok-front.png");
    const side = loadImage("ok-side.png");
    const seen = countingProvider();

    await withServer({ provider: seen.provider }, async (base) => {
      const plain = await fetch(`${base}/v1/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ front: jsonImage(front), side: jsonImage(side) }),
      });
      assert.equal(plain.status, 200);
      assertReport(await readJson(plain));

      const prefixed = await fetch(`${base}/v1/analyze/`, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          front: jsonImage(front, { dataUrl: true }),
          side: jsonImage(side, { dataUrl: true }),
        }),
      });
      assert.equal(prefixed.status, 200);
      assertReport(await readJson(prefixed));
      assert.equal(seen.calls(), 2);
    });
  });

  it("sniffs PNG bytes when the multipart type is application/octet-stream", async () => {
    const front = loadImage("ok-front.png");
    const side = loadImage("ok-side.png");
    const seen = countingProvider();

    await withServer({ provider: seen.provider }, async (base) => {
      const response = await fetch(`${base}/v1/analyze`, {
        method: "POST",
        body: imageForm({ front, side, frontType: "application/octet-stream", sideType: "application/octet-stream" }),
      });
      assert.equal(response.status, 200);
      assertReport(await readJson(response));
      assert.equal(seen.last()?.front.mediaType, "image/png");
      assert.equal(seen.last()?.side.mediaType, "image/png");
    });
  });

  it("returns retake guidance for an unsupported type and does not invent a media type", async () => {
    const side = loadImage("ok-side.png");
    const seen = countingProvider(async () => {
      throw new Error("hard analysis was called");
    });
    const junk = new Uint8Array(32);
    junk.fill(7);
    const form = new FormData();
    form.append("front", new Blob([junk], { type: "image/gif" }), "front.gif");
    form.append("side", toBlob(side), "side.png");

    await withServer({ provider: seen.provider }, async (base) => {
      const response = await fetch(`${base}/v1/analyze`, { method: "POST", body: form });
      assert.equal(response.status, 422);
      const guidance = assertRetake(await readJson(response), "poor_quality");
      const frontShot = guidance.shots.find((shot) => shot.view === "front");
      assert.ok(frontShot?.reasons.includes("unsupported_type"));
      assert.equal(seen.calls(), 0);
    });
  });

  it("returns 400 retake guidance when a photo is missing and does not analyze", async () => {
    const front = loadImage("ok-front.png");
    const side = loadImage("ok-side.png");
    const seen = countingProvider(async () => {
      throw new Error("hard analysis was called");
    });

    await withServer({ provider: seen.provider }, async (base) => {
      const missingFront = await fetch(`${base}/v1/analyze`, {
        method: "POST",
        body: imageForm({ side }),
      });
      const missingFrontBody = await readJson(missingFront);
      assert.equal(missingFront.status, 400);
      assert.equal(missingFront.headers.get("cache-control"), "no-store");
      const frontGuidance = assertRetake(missingFrontBody, "missing_image");
      assert.deepEqual(
        frontGuidance.shots.map((shot) => shot.view),
        ["front"],
      );
      assert.match(frontGuidance.shots[0]?.messages[0] ?? "", /缺少/);

      const missingSide = await fetch(`${base}/v1/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ front: jsonImage(front) }),
      });
      assert.equal(missingSide.status, 400);
      const sideGuidance = assertRetake(await readJson(missingSide), "missing_image");
      assert.deepEqual(
        sideGuidance.shots.map((shot) => shot.view),
        ["side"],
      );

      const missingBoth = await fetch(`${base}/v1/analyze`, { method: "POST", body: new FormData() });
      assert.equal(missingBoth.status, 400);
      const both = assertRetake(await readJson(missingBoth), "missing_image");
      assert.deepEqual(
        both.shots.map((shot) => shot.view),
        ["front", "side"],
      );
      assert.ok(both.checklist.length >= 2);
      assert.equal(seen.calls(), 0);
    });
  });

  it("returns 422 retake guidance when quality fails and does not analyze", async () => {
    const front = loadImage("ok-front.png");
    const poorSide = loadImage("poor-side.png");
    const side = loadImage("ok-side.png");
    const seen = countingProvider(async () => {
      throw new Error("hard analysis was called");
    });

    await withServer({ provider: seen.provider }, async (base) => {
      const poor = await fetch(`${base}/v1/analyze`, {
        method: "POST",
        body: imageForm({ front, side: poorSide }),
      });
      assert.equal(poor.status, 422);
      const poorGuidance = assertRetake(await readJson(poor), "poor_quality");
      assert.match(poorGuidance.summary, /不会做体态分析/);
      assert.equal(poorGuidance.shots[0]?.view, "side");
      assert.ok(poorGuidance.shots[0]?.reasons.includes("low_resolution"));

      const blurry = await fetch(`${base}/v1/analyze`, {
        method: "POST",
        body: imageForm({ front, side, sideSharpness: "0.1" }),
      });
      assert.equal(blurry.status, 422);
      const blurryGuidance = assertRetake(await readJson(blurry), "poor_quality");
      assert.ok(blurryGuidance.shots.some((shot) => shot.reasons.includes("blurry")));

      const empty = new FormData();
      empty.append("front", new Blob([], { type: "image/png" }), "front.png");
      empty.append("side", new Blob([new Uint8Array(side.data)], { type: "image/png" }), "side.png");
      const emptyFront = await fetch(`${base}/v1/analyze`, { method: "POST", body: empty });
      assert.equal(emptyFront.status, 422);
      assertRetake(await readJson(emptyFront), "poor_quality");
      assert.equal(seen.calls(), 0);
    });
  });

  it("does not cache a report across requests", async () => {
    const front = loadImage("ok-front.png");
    const side = loadImage("ok-side.png");
    let n = 0;
    const seen = countingProvider(async () => {
      n += 1;
      const title = n === 1 ? "头前引" : "骨盆侧倾";
      return {
        issues: [{ title, detail: "可见的姿势观察。", severity: "mild" }],
        causeGuesses: [{ relatedIssueTitle: title, guess: "可能与日常习惯有关。" }],
        exerciseSuggestions: [
          { name: "靠墙天使", instruction: "背靠墙缓慢上举，每组 8 次。" },
          { name: "臀桥", instruction: "仰卧屈膝抬髋，每组 10 次。" },
          { name: "鸟狗", instruction: "四肢撑地伸对侧手脚，每侧 8 次。" },
        ],
      };
    });

    await withServer({ provider: seen.provider }, async (base) => {
      const first = assertReport(
        await readJson(
          await fetch(`${base}/v1/analyze`, { method: "POST", body: imageForm({ front, side }) }),
        ),
      );
      const second = assertReport(
        await readJson(
          await fetch(`${base}/v1/analyze`, { method: "POST", body: imageForm({ front, side }) }),
        ),
      );
      assert.equal(first.issues[0]?.title, "头前引");
      assert.equal(second.issues[0]?.title, "骨盆侧倾");
      assert.equal(seen.calls(), 2);
    });
  });

  it("returns a generic 502 when the provider fails and does not echo the error", async () => {
    const front = loadImage("ok-front.png");
    const side = loadImage("ok-side.png");
    const secret = "SECRET_IMAGE_BYTES_xyz";
    const logs: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      logs.push(args.map((item) => String(item)).join(" "));
    };
    const seen = countingProvider(async () => {
      throw new Error(secret);
    });

    try {
      await withServer({ provider: seen.provider }, async (base) => {
        const response = await fetch(`${base}/v1/analyze`, {
          method: "POST",
          body: imageForm({ front, side }),
        });
        const body = await readJson(response);
        assert.equal(response.status, 502);
        assert.deepEqual(Object.keys(body).filter((key) => key !== "__raw").sort(), ["error", "message"]);
        assert.equal(body.error, "analysis_failed");
        assert.equal(responseText(body).includes(secret), false);
        assert.equal(responseText(body).includes("report"), false);
        assert.equal(seen.calls(), 1);
      });
    } finally {
      console.error = original;
    }
    assert.equal(logs.join("\n").includes(secret), false);
  });

  it("returns 502 when the model JSON is not a report", async () => {
    const front = loadImage("ok-front.png");
    const side = loadImage("ok-side.png");
    const seen = countingProvider(async () => ({ nope: true }));

    await withServer({ provider: seen.provider }, async (base) => {
      const response = await fetch(`${base}/v1/analyze`, {
        method: "POST",
        body: imageForm({ front, side }),
      });
      const body = await readJson(response);
      assert.equal(response.status, 502);
      assert.equal(body.error, "analysis_failed");
      assert.equal("report" in body, false);
      assert.equal(responseText(body).includes("nope"), false);
    });
  });

  it("rejects a request that is not an image upload", async () => {
    const seen = countingProvider(async () => {
      throw new Error("hard analysis was called");
    });

    await withServer({ provider: seen.provider, maxBodyBytes: 128, maxImageBytes: 64 }, async (base) => {
      const plain = await fetch(`${base}/v1/analyze`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "hello",
      });
      assert.equal(plain.status, 415);
      assert.equal((await readJson(plain)).error, "unsupported_media_type");

      const broken = await fetch(`${base}/v1/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      });
      const brokenBody = await readJson(broken);
      assert.equal(broken.status, 400);
      assert.equal(brokenBody.error, "invalid_json");
      assert.equal("report" in brokenBody, false);
      assert.equal("retakeGuidance" in brokenBody, false);

      const oversized = await fetch(`${base}/v1/analyze`, {
        method: "POST",
        body: imageForm({ front: loadImage("ok-front.png"), side: loadImage("ok-side.png") }),
      });
      assert.equal(oversized.status, 413);
      assert.equal((await readJson(oversized)).error, "payload_too_large");

      const get = await fetch(`${base}/v1/analyze`);
      assert.equal(get.status, 405);
      assert.equal(get.headers.get("allow"), "POST");

      const missing = await fetch(`${base}/no-such`);
      assert.equal(missing.status, 404);

      const health = await fetch(`${base}/healthz`);
      assert.equal(health.status, 200);
      assert.deepEqual(
        Object.keys(await readJson(health)).filter((key) => key !== "__raw"),
        ["ok"],
      );
      assert.equal(seen.calls(), 0);
    });
  });
});
