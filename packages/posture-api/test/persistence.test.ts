import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { mockReportDraft } from "posture-core";

import { createProviderFromEnv } from "../src/provider-env.js";
import { countingProvider, imageForm, loadImage, withServer } from "./helpers.js";

describe("zero persistence", () => {
  it("does not write images or reports during the request, and does not echo secrets", async () => {
    const hits: string[] = [];
    const restore = patchWrites(hits);
    const logs: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      logs.push(args.map((item) => String(item)).join(" "));
    };
    const packageRoot = fileURLToPath(new URL("..", import.meta.url));
    const before = listFiles(packageRoot);
    const front = loadImage("ok-front.png");
    const side = loadImage("ok-side.png");
    const secret = "sk-request-secret";
    const marker = Buffer.from(front.data.subarray(0, 24)).toString("base64");
    const seenFetch: string[] = [];

    try {
      const mock = countingProvider();
      await withServer({ provider: mock.provider }, async (base) => {
        const ok = await fetch(`${base}/v1/analyze`, {
          method: "POST",
          body: imageForm({
            front,
            side,
            extra: { POSTURE_API_KEY: secret, apiKey: secret },
          }),
        });
        const okText = await ok.text();
        assert.equal(ok.status, 200);
        assert.equal(okText.includes(secret), false);
        assert.equal(okText.includes(marker), false);
        assert.equal(okText.includes("secret-patient"), false);

        const poor = await fetch(`${base}/v1/analyze`, {
          method: "POST",
          body: imageForm({ front, side: loadImage("poor-side.png") }),
        });
        assert.equal(poor.status, 422);
        assert.equal((await poor.text()).includes(marker), false);

        const missing = await fetch(`${base}/v1/analyze`, {
          method: "POST",
          body: imageForm({ front }),
        });
        assert.equal(missing.status, 400);
        assert.equal((await missing.text()).includes("report"), false);
      });

      const provider = createProviderFromEnv(
        {
          POSTURE_PROVIDER: "openai-compatible",
          POSTURE_API_KEY: secret,
          POSTURE_MODEL: "gpt-test",
          POSTURE_API_BASE_URL: "https://vendor.example/v1",
        },
        {
          fetchImpl: async (_input, init) => {
            seenFetch.push(typeof init?.body === "string" ? init.body : "");
            return new Response(
              JSON.stringify({ choices: [{ message: { content: JSON.stringify(mockReportDraft()) } }] }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          },
        },
      );
      await withServer({ provider }, async (base) => {
        const response = await fetch(`${base}/v1/analyze`, {
          method: "POST",
          body: imageForm({ front, side }),
        });
        const text = await response.text();
        assert.equal(response.status, 200);
        assert.equal(text.includes(secret), false);
        assert.equal(text.includes(marker), false);
      });

      assert.equal(seenFetch.length, 1);
      assert.deepEqual(hits, []);
      assert.equal(logs.join("\n").includes(secret), false);
      assert.equal(logs.join("\n").includes(marker), false);
      assert.deepEqual(listFiles(packageRoot), before);
      assert.equal(mock.calls(), 1);
    } finally {
      console.error = original;
      restore();
    }
  });

  it("does not reference a filesystem write or a database client", () => {
    const srcDir = fileURLToPath(new URL("../src/", import.meta.url));
    const forbidden =
      /node:fs|from ["']fs["']|\b(writeFile|writeFileSync|appendFile|createWriteStream|openSync)\b|\b(sqlite|mongoose|prisma|putObject|s3)\b/i;
    const files = listFiles(srcDir).filter((file) => file.endsWith(".ts"));
    assert.ok(files.length >= 6);
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      assert.doesNotMatch(source, forbidden, file);
    }
    const images = fs.readFileSync(join(srcDir, "images.ts"), "utf8");
    assert.equal(images.includes("as MediaType"), false);
    assert.equal(images.includes("application/octet-stream"), false);
    const adapter = fs.readFileSync(join(srcDir, "openai-provider.ts"), "utf8");
    assert.equal(adapter.includes("下面先是正面"), false);
  });
});

function listFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...listFiles(full));
    else result.push(full);
  }
  return result.sort();
}

function patchWrites(hits: string[]): () => void {
  const originals = {
    writeFile: fs.writeFile,
    writeFileSync: fs.writeFileSync,
    appendFile: fs.appendFile,
    appendFileSync: fs.appendFileSync,
    createWriteStream: fs.createWriteStream,
    promisesWrite: fsp.writeFile,
    promisesAppend: fsp.appendFile,
  };
  const wrap =
    (name: string, original: (...args: never[]) => unknown) =>
    (...args: never[]) => {
      hits.push(name);
      return original(...args);
    };
  fs.writeFile = wrap("writeFile", originals.writeFile as (...args: never[]) => unknown) as typeof fs.writeFile;
  fs.writeFileSync = wrap(
    "writeFileSync",
    originals.writeFileSync as (...args: never[]) => unknown,
  ) as typeof fs.writeFileSync;
  fs.appendFile = wrap("appendFile", originals.appendFile as (...args: never[]) => unknown) as typeof fs.appendFile;
  fs.appendFileSync = wrap(
    "appendFileSync",
    originals.appendFileSync as (...args: never[]) => unknown,
  ) as typeof fs.appendFileSync;
  fs.createWriteStream = wrap(
    "createWriteStream",
    originals.createWriteStream as (...args: never[]) => unknown,
  ) as typeof fs.createWriteStream;
  fsp.writeFile = wrap(
    "promises.writeFile",
    originals.promisesWrite as (...args: never[]) => unknown,
  ) as typeof fsp.writeFile;
  fsp.appendFile = wrap(
    "promises.appendFile",
    originals.promisesAppend as (...args: never[]) => unknown,
  ) as typeof fsp.appendFile;
  return () => {
    fs.writeFile = originals.writeFile;
    fs.writeFileSync = originals.writeFileSync;
    fs.appendFile = originals.appendFile;
    fs.appendFileSync = originals.appendFileSync;
    fs.createWriteStream = originals.createWriteStream;
    fsp.writeFile = originals.promisesWrite;
    fsp.appendFile = originals.promisesAppend;
  };
}
