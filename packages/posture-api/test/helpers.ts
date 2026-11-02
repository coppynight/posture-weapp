import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  mockReportDraft,
  type AnalyzePostureRequest,
  type MediaType,
  type MultimodalProvider,
  type PostureImage,
} from "posture-core";

import { listenUrl, startServer, type ServerOptions } from "../src/server.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../posture-core/test/fixtures");

export function loadImage(name: string, mediaType: MediaType = "image/png", sharpness?: number): PostureImage {
  const image: PostureImage = {
    data: new Uint8Array(readFileSync(join(fixturesDir, name))),
    mediaType,
  };
  if (sharpness !== undefined) image.sharpness = sharpness;
  return image;
}

export function toBlob(image: PostureImage, type?: string): Blob {
  const copy = new Uint8Array(image.data.byteLength);
  copy.set(image.data);
  return new Blob([copy], { type: type ?? image.mediaType });
}

export function imageForm(parts: {
  front?: PostureImage | null;
  side?: PostureImage | null;
  frontName?: string;
  sideName?: string;
  frontType?: string;
  sideType?: string;
  frontSharpness?: string;
  sideSharpness?: string;
  extra?: Record<string, string>;
}): FormData {
  const form = new FormData();
  if (parts.front) {
    form.append("front", toBlob(parts.front, parts.frontType), parts.frontName ?? "front.png");
  }
  if (parts.side) {
    form.append("side", toBlob(parts.side, parts.sideType), parts.sideName ?? "side.png");
  }
  if (parts.frontSharpness !== undefined) form.append("frontSharpness", parts.frontSharpness);
  if (parts.sideSharpness !== undefined) form.append("sideSharpness", parts.sideSharpness);
  for (const [key, value] of Object.entries(parts.extra ?? {})) form.append(key, value);
  return form;
}

export function jsonImage(image: PostureImage, options?: { dataUrl?: boolean; sharpness?: number }): Record<string, unknown> {
  const base64 = Buffer.from(image.data).toString("base64");
  const body: Record<string, unknown> = {
    mediaType: image.mediaType,
    dataBase64: options?.dataUrl ? `data:${image.mediaType};base64,${base64}` : base64,
  };
  if (options?.sharpness !== undefined) body.sharpness = options.sharpness;
  return body;
}

export async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Response was not JSON (${response.status}): ${text.slice(0, 200)}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Expected a JSON object, received: ${text.slice(0, 200)}`);
  }
  return { ...parsed, __raw: text } as Record<string, unknown> & { __raw?: string };
}

export function responseText(body: Record<string, unknown>): string {
  const raw = body.__raw;
  return typeof raw === "string" ? raw : JSON.stringify(body);
}

export async function withServer<T>(options: ServerOptions, run: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = await startServer({
    ...options,
    host: options.host ?? "127.0.0.1",
    port: options.port ?? 0,
  });
  try {
    return await run(listenUrl(server));
  } finally {
    await closeServer(server);
  }
}

export async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    server.closeAllConnections();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
    server.closeAllConnections();
  });
}

export function countingProvider(impl?: (input: AnalyzePostureRequest) => Promise<unknown>): {
  provider: MultimodalProvider;
  calls: () => number;
  last: () => AnalyzePostureRequest | undefined;
} {
  let calls = 0;
  let last: AnalyzePostureRequest | undefined;
  return {
    calls: () => calls,
    last: () => last,
    provider: {
      async analyzePosture(input) {
        calls += 1;
        last = input;
        if (impl) return impl(input);
        return mockReportDraft();
      },
    },
  };
}
