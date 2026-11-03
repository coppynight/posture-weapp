import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { MultimodalProvider } from "posture-core";

import { ApiError } from "./errors.js";
import { ANALYZE_PATH, handleRequest, normalizePath } from "./handler.js";
import { MAX_BODY_BYTES } from "./images.js";

/** Time allowed for one HTTP request, including the provider call. */
const REQUEST_TIMEOUT_MS = 120_000;

/** Time allowed to receive request headers before the body. */
const HEADERS_TIMEOUT_MS = 20_000;

export interface ServerOptions {
  provider: MultimodalProvider;
  host?: string;
  port?: number;
  maxBodyBytes?: number;
  maxImageBytes?: number;
}

/**
 * HTTP adapter in front of `handleRequest`.
 * The raw body is a local buffer for that request and is not stored on the server.
 */
export function createHttpServer(options: ServerOptions): Server {
  if (!options.provider || typeof options.provider.analyzePosture !== "function") {
    throw new TypeError("createHttpServer requires a MultimodalProvider");
  }
  const server = createServer((req, res) => {
    void dispatch(req, res, options).catch((error: unknown) => {
      console.error("request failed:", error instanceof Error ? error.name : "unknown");
      if (res.headersSent || res.destroyed) {
        res.destroy();
        return;
      }
      writeJson(res, 500, { error: "internal_error", message: "服务暂时不可用，请稍后重试。" });
    });
  });
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;
  return server;
}

export async function startServer(options: ServerOptions): Promise<Server> {
  const server = createHttpServer(options);
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      reject(error);
    };
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      resolve();
    });
  });
  return server;
}

export function listenUrl(server: Server): string {
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Server is not listening on a TCP port");
  }
  const host = address.address.includes(":") ? `[${address.address}]` : address.address;
  return `http://${host}:${address.port}`;
}

async function dispatch(req: IncomingMessage, res: ServerResponse, options: ServerOptions): Promise<void> {
  const path = normalizePath(req.url);
  const method = req.method ?? "GET";
  const maxBodyBytes = options.maxBodyBytes ?? MAX_BODY_BYTES;
  try {
    const body = method === "POST" && path === ANALYZE_PATH ? await readLimitedBody(req, maxBodyBytes) : drain(req);
    const request = toWebRequest(req, body);
    const response = await handleRequest(request, {
      provider: options.provider,
      maxImageBytes: options.maxImageBytes,
    });
    await writeWebResponse(res, response);
  } catch (error) {
    if (error instanceof ApiError) {
      if (!res.headersSent && !res.destroyed) {
        writeJson(res, error.status, { error: error.code, message: error.message });
      }
      return;
    }
    throw error;
  }
}

function drain(req: IncomingMessage): Buffer {
  req.resume();
  return Buffer.alloc(0);
}

async function readLimitedBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const declared = req.headers["content-length"];
  if (typeof declared === "string" && Number(declared) > limit) {
    req.resume();
    throw new ApiError(413, "payload_too_large", "上传内容过大，请压缩图片后重试。");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > limit) {
      req.destroy();
      throw new ApiError(413, "payload_too_large", "上传内容过大，请压缩图片后重试。");
    }
    chunks.push(buf);
  }
  if (chunks.length === 0) return Buffer.alloc(0);
  return isolatedBuffer(Buffer.concat(chunks));
}

function toWebRequest(req: IncomingMessage, body: Buffer): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined || HOP_BY_HOP.has(key)) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  const path = req.url && req.url.startsWith("/") ? req.url : `/${req.url ?? ""}`;
  const bytes = body.byteLength > 0 ? isolatedBytes(body) : undefined;
  return new Request(`http://127.0.0.1${path}`, {
    method: req.method,
    headers,
    body: bytes,
  });
}

const HOP_BY_HOP = new Set(["transfer-encoding", "connection", "keep-alive", "content-length", "host"]);

function isolatedBuffer(buffer: Buffer): Buffer {
  return Buffer.from(isolatedBytes(buffer));
}

function isolatedBytes(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength).slice();
}

async function writeWebResponse(res: ServerResponse, response: Response): Promise<void> {
  const bytes = Buffer.from(await response.arrayBuffer());
  const headers: Record<string, string | number> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  headers.connection = "close";
  headers["content-length"] = bytes.byteLength;
  res.writeHead(response.status, headers);
  res.end(bytes);
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    connection: "close",
    "content-length": payload.byteLength,
  });
  res.end(payload);
}
