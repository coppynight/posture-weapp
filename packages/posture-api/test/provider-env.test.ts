import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyze, DEFAULT_SYSTEM_PROMPT, mockReportDraft, REPORT_DISCLAIMER } from "posture-core";

import { createProviderFromEnv } from "../src/provider-env.js";
import { imageForm, loadImage, readJson, withServer } from "./helpers.js";

const front = loadImage("ok-front.png");
const side = loadImage("ok-side.png");

describe("createProviderFromEnv", () => {
  it("requires an explicit provider name", () => {
    assert.throws(() => createProviderFromEnv({}), /POSTURE_PROVIDER must be mock or openai-compatible/);
    assert.throws(
      () => createProviderFromEnv({ POSTURE_PROVIDER: "somewhere-else" }),
      /POSTURE_PROVIDER must be mock or openai-compatible/,
    );
  });

  it("returns a stateless mock that ignores vendor keys and does not call fetch", async () => {
    let fetched = 0;
    const provider = createProviderFromEnv(
      { POSTURE_PROVIDER: "mock", POSTURE_API_KEY: "sk-should-not-be-used" },
      {
        fetchImpl: async () => {
          fetched += 1;
          throw new Error("fetch called");
        },
      },
    );
    assert.equal("calls" in provider, false);
    const first = await provider.analyzePosture({ front, side, systemPrompt: "ignored-by-mock" });
    const second = await provider.analyzePosture({ front, side, systemPrompt: "ignored-by-mock" });
    assert.equal(fetched, 0);
    assert.equal("calls" in provider, false);
    assert.notEqual(first, second);
    assert.deepEqual(first, mockReportDraft());
  });

  it("reads the vendor key only from the env object passed in", () => {
    const previous = process.env.POSTURE_API_KEY;
    process.env.POSTURE_API_KEY = "from-process-env";
    try {
      assert.throws(
        () =>
          createProviderFromEnv({
            POSTURE_PROVIDER: "openai-compatible",
            POSTURE_MODEL: "gpt-test",
          }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /POSTURE_API_KEY is required/);
          assert.equal(error.message.includes("from-process-env"), false);
          return true;
        },
      );
    } finally {
      if (previous === undefined) delete process.env.POSTURE_API_KEY;
      else process.env.POSTURE_API_KEY = previous;
    }
  });

  it("rejects a non-http vendor URL and a missing model", () => {
    assert.throws(
      () =>
        createProviderFromEnv({
          POSTURE_PROVIDER: "openai",
          POSTURE_API_KEY: "sk-test",
          POSTURE_MODEL: "gpt-test",
          POSTURE_API_BASE_URL: "file:///tmp/posture-secret",
        }),
      /http\(s\) URL/,
    );
    assert.throws(
      () =>
        createProviderFromEnv({
          POSTURE_PROVIDER: "openai-compatible",
          POSTURE_API_KEY: "sk-test",
        }),
      /POSTURE_MODEL is required/,
    );
  });

  it("sends the env key and the core system prompt, then returns the core report", async () => {
    const secret = "sk-test-secret";
    const seen: { url: string; authorization: string; body: string }[] = [];
    const provider = createProviderFromEnv(
      {
        POSTURE_PROVIDER: "openai",
        POSTURE_API_KEY: secret,
        POSTURE_MODEL: "gpt-test",
        POSTURE_API_BASE_URL: "https://vendor.example/v1/",
      },
      {
        fetchImpl: async (input, init) => {
          const headers = new Headers(init?.headers);
          seen.push({
            url: typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
            authorization: headers.get("authorization") ?? "",
            body: typeof init?.body === "string" ? init.body : "",
          });
          const fenced = "```json\n" + JSON.stringify(mockReportDraft()) + "\n```";
          return new Response(JSON.stringify({ choices: [{ message: { content: fenced } }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      },
    );

    const direct = await analyze(front, side, { provider });
    assert.equal(direct.status, "report");
    if (direct.status !== "report") return;
    assert.equal(direct.report.disclaimer, REPORT_DISCLAIMER);

    await withServer({ provider }, async (base) => {
      const poor = await fetch(`${base}/v1/analyze`, {
        method: "POST",
        body: imageForm({ front, side: loadImage("poor-side.png") }),
      });
      assert.equal(poor.status, 422);
      assert.equal(seen.length, 1);

      const response = await fetch(`${base}/v1/analyze`, {
        method: "POST",
        body: imageForm({ front, side }),
      });
      const body = await readJson(response);
      assert.equal(response.status, 200);
      assert.equal((body.report as { disclaimer?: string }).disclaimer, REPORT_DISCLAIMER);
      assert.equal(JSON.stringify(body).includes(secret), false);
    });

    assert.equal(seen.length, 2);
    assert.equal(seen[1]?.url, "https://vendor.example/v1/chat/completions");
    assert.equal(seen[1]?.authorization, `Bearer ${secret}`);
    const sent = JSON.parse(seen[1]?.body ?? "{}") as {
      messages?: { role?: string; content?: unknown }[];
    };
    const system = sent.messages?.find((message) => message.role === "system");
    assert.equal(system?.content, DEFAULT_SYSTEM_PROMPT);
    assert.equal(seen[1]?.body.includes("data:image/png;base64,"), true);
    assert.equal(seen[1]?.body.includes(secret), false);
  });

  it("hides vendor failures and timeouts behind a generic 502", async () => {
    const secret = "sk-vendor-secret";
    const vendorBody = `upstream leaked ${secret} and a photo`;
    const failing = createProviderFromEnv(
      {
        POSTURE_PROVIDER: "openai-compatible",
        POSTURE_API_KEY: secret,
        POSTURE_MODEL: "gpt-test",
        POSTURE_API_BASE_URL: "https://vendor.example/v1",
      },
      {
        fetchImpl: async () => new Response(vendorBody, { status: 500 }),
      },
    );
    await withServer({ provider: failing }, async (base) => {
      const response = await fetch(`${base}/v1/analyze`, {
        method: "POST",
        body: imageForm({ front, side }),
      });
      const text = await response.text();
      assert.equal(response.status, 502);
      assert.equal(text.includes(secret), false);
      assert.equal(text.includes("upstream leaked"), false);
      assert.equal(text.includes("report"), false);
    });

    const hanging = createProviderFromEnv(
      {
        POSTURE_PROVIDER: "openai-compatible",
        POSTURE_API_KEY: secret,
        POSTURE_MODEL: "gpt-test",
        POSTURE_API_BASE_URL: "https://vendor.example/v1",
        POSTURE_PROVIDER_TIMEOUT_MS: "30",
      },
      {
        fetchImpl: (_input, init) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal;
            if (!signal) {
              reject(new Error("missing signal"));
              return;
            }
            if (signal.aborted) {
              reject(signal.reason);
              return;
            }
            signal.addEventListener(
              "abort",
              () => {
                reject(signal.reason);
              },
              { once: true },
            );
          }),
      },
    );
    await withServer({ provider: hanging }, async (base) => {
      const response = await fetch(`${base}/v1/analyze`, {
        method: "POST",
        body: imageForm({ front, side }),
      });
      const text = await response.text();
      assert.equal(response.status, 502);
      assert.equal(text.includes(secret), false);
      assert.match(text, /分析暂时无法完成/);
    });
  });
});
