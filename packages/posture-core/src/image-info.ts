import { SUPPORTED_MEDIA_TYPES, type MediaType } from "./types.js";

export interface ImageSize {
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function byteAt(data: Uint8Array, index: number): number | null {
  const value = data[index];
  return value === undefined ? null : value;
}

function readU32BE(data: Uint8Array, offset: number): number | null {
  const b0 = byteAt(data, offset);
  const b1 = byteAt(data, offset + 1);
  const b2 = byteAt(data, offset + 2);
  const b3 = byteAt(data, offset + 3);
  if (b0 === null || b1 === null || b2 === null || b3 === null) return null;
  return ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
}

function ascii(data: Uint8Array, offset: number, length: number): string | null {
  let text = "";
  for (let index = 0; index < length; index += 1) {
    const value = byteAt(data, offset + index);
    if (value === null) return null;
    text += String.fromCharCode(value);
  }
  return text;
}

export function isMediaType(value: unknown): value is MediaType {
  return typeof value === "string" && (SUPPORTED_MEDIA_TYPES as readonly string[]).includes(value);
}

export function hasMagic(data: Uint8Array, mediaType: MediaType): boolean {
  if (mediaType === "image/png") {
    return PNG_SIGNATURE.every((expected, index) => data[index] === expected);
  }
  if (mediaType === "image/jpeg") {
    return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  }
  return ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 4) === "WEBP";
}

/**
 * Read width and height from a PNG, JPEG, or WebP header.
 * Returns null when the header is unusable. This does not decode pixels.
 */
export function readImageSize(data: Uint8Array, mediaType: MediaType): ImageSize | null {
  if (!hasMagic(data, mediaType)) return null;
  if (mediaType === "image/png") return readPngSize(data);
  if (mediaType === "image/jpeg") return readJpegSize(data);
  return readWebpSize(data);
}

function readPngSize(data: Uint8Array): ImageSize | null {
  if (ascii(data, 12, 4) !== "IHDR") return null;
  const width = readU32BE(data, 16);
  const height = readU32BE(data, 20);
  if (width === null || height === null || width <= 0 || height <= 0) return null;
  return { width, height };
}

function readJpegSize(data: Uint8Array): ImageSize | null {
  let offset = 2;
  while (offset < data.length) {
    if (byteAt(data, offset) !== 0xff) return null;
    while (byteAt(data, offset) === 0xff) offset += 1;
    const marker = byteAt(data, offset);
    if (marker === null) return null;
    offset += 1;
    if (marker === 0xd9) return null;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    const lengthHi = byteAt(data, offset);
    const lengthLo = byteAt(data, offset + 1);
    if (lengthHi === null || lengthLo === null) return null;
    const length = (lengthHi << 8) | lengthLo;
    if (length < 2 || offset + length > data.length) return null;
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const heightHi = byteAt(data, offset + 3);
      const heightLo = byteAt(data, offset + 4);
      const widthHi = byteAt(data, offset + 5);
      const widthLo = byteAt(data, offset + 6);
      if (heightHi === null || heightLo === null || widthHi === null || widthLo === null) {
        return null;
      }
      const height = (heightHi << 8) | heightLo;
      const width = (widthHi << 8) | widthLo;
      if (width <= 0 || height <= 0) return null;
      return { width, height };
    }
    offset += length;
  }
  return null;
}

function readWebpSize(data: Uint8Array): ImageSize | null {
  const chunk = ascii(data, 12, 4);
  if (chunk === "VP8X") return readVp8xSize(data);
  if (chunk === "VP8 ") return readVp8Size(data);
  if (chunk === "VP8L") return readVp8lSize(data);
  return null;
}

function readVp8xSize(data: Uint8Array): ImageSize | null {
  const w0 = byteAt(data, 24);
  const w1 = byteAt(data, 25);
  const w2 = byteAt(data, 26);
  const h0 = byteAt(data, 27);
  const h1 = byteAt(data, 28);
  const h2 = byteAt(data, 29);
  if (w0 === null || w1 === null || w2 === null || h0 === null || h1 === null || h2 === null) {
    return null;
  }
  const width = 1 + w0 + (w1 << 8) + (w2 << 16);
  const height = 1 + h0 + (h1 << 8) + (h2 << 16);
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

function readVp8Size(data: Uint8Array): ImageSize | null {
  if (byteAt(data, 23) !== 0x9d || byteAt(data, 24) !== 0x01 || byteAt(data, 25) !== 0x2a) {
    return null;
  }
  const w0 = byteAt(data, 26);
  const w1 = byteAt(data, 27);
  const h0 = byteAt(data, 28);
  const h1 = byteAt(data, 29);
  if (w0 === null || w1 === null || h0 === null || h1 === null) return null;
  const width = (w0 | (w1 << 8)) & 0x3fff;
  const height = (h0 | (h1 << 8)) & 0x3fff;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

function readVp8lSize(data: Uint8Array): ImageSize | null {
  if (byteAt(data, 20) !== 0x2f) return null;
  const b0 = byteAt(data, 21);
  const b1 = byteAt(data, 22);
  const b2 = byteAt(data, 23);
  const b3 = byteAt(data, 24);
  if (b0 === null || b1 === null || b2 === null || b3 === null) return null;
  const width = 1 + (((b1 & 0x3f) << 8) | b0);
  const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}
