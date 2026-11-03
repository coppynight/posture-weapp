import { Buffer } from "node:buffer";

import type { MediaType, PostureImage } from "posture-core";

import { ApiError } from "./errors.js";
import { isRecord } from "./is-record.js";

/** Largest accepted photo. Larger uploads are rejected and are not sent to the provider. */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/** Largest accepted request body. The buffer lives only inside the request handler. */
export const MAX_BODY_BYTES = 24 * 1024 * 1024;

const DECLARED_MEDIA_TYPES: Record<string, MediaType> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/png": "image/png",
  "image/x-png": "image/png",
  "image/webp": "image/webp",
};

/**
 * One uploaded slot.
 * `photo` is a real supported encoding. `unsupported` keeps the declared type
 * as a plain string so the core quality gate can reject it. `missing` means
 * the field was absent.
 */
export type UploadedShot =
  | { kind: "missing" }
  | { kind: "photo"; image: PostureImage }
  | { kind: "unsupported"; data: Uint8Array; declaredType: string; sharpness?: number };

export interface ParsedImagePair {
  front: UploadedShot;
  side: UploadedShot;
}

/**
 * Read the two posture photos from a multipart upload or a JSON body of base64 bytes.
 * A missing field is `kind: "missing"`. An unrecognized encoding stays `unsupported`
 * with its declared type, so the core gate can reject it.
 * Bytes are copied into a fresh Uint8Array and are not written anywhere.
 */
export async function readImagePair(request: Request, maxImageBytes: number): Promise<ParsedImagePair> {
  const media = mediaTypeOf(request.headers.get("content-type"));
  if (media === "multipart/form-data") return readMultipart(request, maxImageBytes);
  if (media === "application/json") return readJson(request, maxImageBytes);
  throw new ApiError(
    415,
    "unsupported_media_type",
    "请使用 multipart/form-data 或 application/json 上传正面和侧面照片。",
  );
}

async function readMultipart(request: Request, maxImageBytes: number): Promise<ParsedImagePair> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError(400, "invalid_multipart", "照片上传不完整，请重新选择正面和侧面照片后再试。");
  }
  const front = await readFormImage(form.get("front"), readSharpness(form.get("frontSharpness")), maxImageBytes);
  const side = await readFormImage(form.get("side"), readSharpness(form.get("sideSharpness")), maxImageBytes);
  return { front, side };
}

async function readJson(request: Request, maxImageBytes: number): Promise<ParsedImagePair> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await request.text()) as unknown;
  } catch {
    throw new ApiError(400, "invalid_json", "请求体不是合法的 JSON。请同时上传正面和侧面照片。");
  }
  if (!isRecord(parsed)) {
    throw new ApiError(400, "invalid_json", "请求体必须是包含 front 与 side 的 JSON 对象。");
  }
  return {
    front: readJsonImage(parsed.front, maxImageBytes),
    side: readJsonImage(parsed.side, maxImageBytes),
  };
}

async function readFormImage(
  value: string | File | null,
  sharpness: number | undefined,
  maxImageBytes: number,
): Promise<UploadedShot> {
  if (value === null || typeof value === "string") return { kind: "missing" };
  if (value.size > maxImageBytes) {
    throw new ApiError(413, "payload_too_large", "单张照片过大，请压缩后重新上传。");
  }
  const data = new Uint8Array(await value.arrayBuffer());
  return toUploadedShot(data, value.type, sharpness);
}

function readJsonImage(value: unknown, maxImageBytes: number): UploadedShot {
  if (!isRecord(value)) return { kind: "missing" };
  const encoded = value.dataBase64;
  if (typeof encoded !== "string" || encoded.trim() === "") return { kind: "missing" };
  const data = decodeBase64(encoded);
  if (data.byteLength > maxImageBytes) {
    throw new ApiError(413, "payload_too_large", "单张照片过大，请压缩后重新上传。");
  }
  const declared = typeof value.mediaType === "string" ? value.mediaType : "";
  return toUploadedShot(data, declared, readSharpness(value.sharpness));
}

/**
 * A supported encoding becomes a `PostureImage`.
 * Anything else stays unsupported, with the caller's declared type unchanged.
 */
function toUploadedShot(data: Uint8Array, declaredType: string, sharpness: number | undefined): UploadedShot {
  const resolved = resolveMediaType(declaredType, data);
  if (resolved) {
    const image: PostureImage = { data, mediaType: resolved };
    if (sharpness !== undefined) image.sharpness = sharpness;
    return { kind: "photo", image };
  }
  const shot: Extract<UploadedShot, { kind: "unsupported" }> = {
    kind: "unsupported",
    data,
    declaredType: mediaTypeOf(declaredType),
  };
  if (sharpness !== undefined) shot.sharpness = sharpness;
  return shot;
}

function resolveMediaType(declared: string, data: Uint8Array): MediaType | null {
  const normalized = mediaTypeOf(declared);
  const fromHeader = normalized ? DECLARED_MEDIA_TYPES[normalized] : undefined;
  const sniffed = sniffMediaType(data);
  if (sniffed && fromHeader && sniffed !== fromHeader) return sniffed;
  return sniffed ?? fromHeader ?? null;
}

function sniffMediaType(data: Uint8Array): MediaType | null {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return "image/png";
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  if (data.length >= 12 && ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 4) === "WEBP") {
    return "image/webp";
  }
  return null;
}

function decodeBase64(value: string): Uint8Array {
  const stripped = value.trim().replace(/^data:[^,]*,/i, "").replace(/\s/g, "");
  if (stripped.length === 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(stripped)) {
    return new Uint8Array();
  }
  const buffer = Buffer.from(stripped, "base64");
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength).slice();
}

function readSharpness(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  return Number(trimmed);
}

function mediaTypeOf(header: string | null | undefined): string {
  return header?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function ascii(data: Uint8Array, offset: number, length: number): string | null {
  let text = "";
  for (let index = 0; index < length; index += 1) {
    const value = data[offset + index];
    if (value === undefined) return null;
    text += String.fromCharCode(value);
  }
  return text;
}
