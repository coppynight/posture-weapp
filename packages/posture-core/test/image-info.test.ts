import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readImageSize } from "../src/index.js";
import { loadFixtureImage } from "./fixtures.js";

function jpegWithSize(width: number, height: number): Uint8Array {
  const app0 = new Uint8Array([
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ]);
  const sof = new Uint8Array([
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
  ]);
  return concat(new Uint8Array([0xff, 0xd8]), app0, sof, new Uint8Array([0xff, 0xd9]));
}

function webpVp8x(width: number, height: number): Uint8Array {
  const chunk = new Uint8Array(18);
  chunk.set([0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0], 0);
  const widthMinus = width - 1;
  const heightMinus = height - 1;
  chunk[12] = widthMinus & 0xff;
  chunk[13] = (widthMinus >> 8) & 0xff;
  chunk[14] = (widthMinus >> 16) & 0xff;
  chunk[15] = heightMinus & 0xff;
  chunk[16] = (heightMinus >> 8) & 0xff;
  chunk[17] = (heightMinus >> 16) & 0xff;
  const header = new Uint8Array(12);
  header.set([0x52, 0x49, 0x46, 0x46], 0);
  const riffSize = 4 + chunk.length;
  header[4] = riffSize & 0xff;
  header[5] = (riffSize >> 8) & 0xff;
  header[6] = (riffSize >> 16) & 0xff;
  header[7] = (riffSize >> 24) & 0xff;
  header.set([0x57, 0x45, 0x42, 0x50], 8);
  return concat(header, chunk);
}

function webpVp8l(width: number, height: number): Uint8Array {
  const widthMinus = width - 1;
  const heightMinus = height - 1;
  const b0 = widthMinus & 0xff;
  const b1 = ((widthMinus >> 8) & 0x3f) | ((heightMinus & 0x03) << 6);
  const b2 = (heightMinus >> 2) & 0xff;
  const b3 = (heightMinus >> 10) & 0x0f;
  const chunk = new Uint8Array([
    0x56, 0x50, 0x38, 0x4c, 5, 0, 0, 0, 0x2f, b0, b1, b2, b3,
  ]);
  const header = new Uint8Array(12);
  header.set([0x52, 0x49, 0x46, 0x46], 0);
  const riffSize = 4 + chunk.length;
  header[4] = riffSize & 0xff;
  header[5] = (riffSize >> 8) & 0xff;
  header[6] = (riffSize >> 16) & 0xff;
  header[7] = (riffSize >> 24) & 0xff;
  header.set([0x57, 0x45, 0x42, 0x50], 8);
  return concat(header, chunk);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

describe("readImageSize", () => {
  it("reads the acceptable and poor PNG fixtures", () => {
    const front = readImageSize(loadFixtureImage("ok-front.png").data, "image/png");
    const side = readImageSize(loadFixtureImage("ok-side.png").data, "image/png");
    const poor = readImageSize(loadFixtureImage("poor-side.png").data, "image/png");
    assert.deepEqual(front, { width: 480, height: 640 });
    assert.deepEqual(side, { width: 480, height: 720 });
    assert.deepEqual(poor, { width: 32, height: 32 });
  });

  it("reads JPEG SOF dimensions after an APP0 segment", () => {
    assert.deepEqual(readImageSize(jpegWithSize(1080, 1920), "image/jpeg"), { width: 1080, height: 1920 });
  });

  it("reads WebP VP8X and VP8L canvas sizes", () => {
    assert.deepEqual(readImageSize(webpVp8x(480, 640), "image/webp"), { width: 480, height: 640 });
    assert.deepEqual(readImageSize(webpVp8l(480, 640), "image/webp"), { width: 480, height: 640 });
  });

  it("returns null when the declared type does not match the header", () => {
    const png = loadFixtureImage("ok-front.png").data;
    assert.equal(readImageSize(png, "image/jpeg"), null);
    assert.equal(readImageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), "image/jpeg"), null);
  });
});
