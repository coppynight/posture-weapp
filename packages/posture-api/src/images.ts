import { Buffer } from "node:buffer";

import type { MediaType, PostureImage } from "posture-core";

import { ApiError } from "./errors.js";

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

export interface ParsedImagePair {
  front: PostureImage | null;
  side: PostureImage | null;
}

/**
 * Read the two posture photos from a multipart upload or a JSON body of base64 bytes.
 * A missing field becomes null so `analyze` can return retake guidance.
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
): Promise<PostureImage | null> {
  if (value === null || typeof value === "string") return null;
  if (value.size > maxImageBytes) {
    throw new ApiError(413, "payload_too_large", "单张照片过大，请压缩后重新上传。");
  }
  const data = new Uint8Array(await value.arrayBuffer());
  return toPostureImage(data, value.type, sharpness);
}

function readJsonImage(value: unknown, maxImageBytes: number): PostureImage | null {
  if (!isRecord(value)) return null;
  const encoded = value.dataBase64;
  if (typeof encoded !== "string" || encoded.trim() === "") return null;
  const data = decodeBase64(encoded);
  if (data.byteLength > maxImageBytes) {
    throw new ApiError(413, "payload_too_large", "单张照片过大，请压缩后重新上传。");
  }
  const declared = typeof value.mediaType === "string" ? value.mediaType : "";
  return toPostureImage(data, declared, readSharpness(value.sharpness));
}

/**
 * Build the image the core quality gate understands.
 * Unknown bytes keep a non-image media type so the gate returns retake guidance
 * instead of calling the provider.
 */
function toPostureImage(data: Uint8Array, declaredType: string, sharpness: number | undefined): PostureImage {
  const resolved = resolveMediaType(declaredType, data);
  const image: PostureImage = {
    data,
    mediaType: (resolved ?? "application/octet-stream") as MediaType,
  };
  if (sharpness !== undefined) image.sharpness = sharpness;
  return image;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
