import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { describe, it } from "node:test";

import { REPORT_DISCLAIMER } from "posture-core";

import {
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  SHARE_SAVE_API,
  estimateTextWidth,
  layoutShareCard,
  paintShareCard,
  saveShareCard,
  type ShareBlock,
  type ShareCanvas,
  type ShareCardLayout,
  type ShareLine,
  type ShareSaveDeps,
} from "../src/share-card.js";
import { theme } from "../src/theme.js";
import type { Report } from "../src/types.js";
import { sampleReport } from "./fixtures.js";

const WIDTH = 750;
const HEIGHT = 1334;

function validReport(): Report {
  return sampleReport(REPORT_DISCLAIMER);
}

function textOf(layout: ShareCardLayout, role: ShareLine["role"]): string {
  return layout.lines
    .filter((line) => line.role === role)
    .map((line) => line.text)
    .join("");
}

function box(line: ShareLine): { x: number; y: number; w: number; h: number } {
  return {
    x: line.x,
    y: line.y,
    w: estimateTextWidth(line.text, line.fontSize, line.weight),
    h: line.fontSize,
  };
}

function intersects(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function channel(hex: string, index: number): number {
  return Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
}

function luminance(hex: string): number {
  const parts = [0, 1, 2].map((index) => {
    const value = channel(hex, index) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * parts[0]! + 0.7152 * parts[1]! + 0.0722 * parts[2]!;
}

function contrast(a: string, b: string): number {
  const lighter = Math.max(luminance(a), luminance(b));
  const darker = Math.min(luminance(a), luminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

function backgroundAt(layout: ShareCardLayout, x: number, y: number): string {
  let color = "#000000";
  for (const block of layout.blocks) {
    if (x >= block.x && x < block.x + block.width && y >= block.y && y < block.y + block.height) {
      color = block.color;
    }
  }
  return color;
}

function crc32(buf: Buffer): number {
  let crc = ~0;
  for (let index = 0; index < buf.length; index += 1) {
    crc ^= buf[index]!;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return ~crc >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    rgb.subarray(y * stride, (y + 1) * stride);
    raw.set(rgb.subarray(y * stride, (y + 1) * stride), row + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function readPngSize(png: Buffer): { width: number; height: number } {
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.subarray(12, 16).toString("ascii"), "IHDR");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** Replay the layout into an exact-color RGB buffer. Glyphs are solid blocks, so ink is countable. */
function rasterize(layout: ShareCardLayout): { rgb: Uint8Array; png: Buffer } {
  const rgb = new Uint8Array(layout.width * layout.height * 3);
  const paint = (x: number, y: number, w: number, h: number, color: string) => {
    const red = channel(color, 0);
    const green = channel(color, 1);
    const blue = channel(color, 2);
    const left = Math.max(0, Math.floor(x));
    const top = Math.max(0, Math.floor(y));
    const right = Math.min(layout.width, Math.ceil(x + w));
    const bottom = Math.min(layout.height, Math.ceil(y + h));
    for (let py = top; py < bottom; py += 1) {
      for (let px = left; px < right; px += 1) {
        const offset = (py * layout.width + px) * 3;
        rgb[offset] = red;
        rgb[offset + 1] = green;
        rgb[offset + 2] = blue;
      }
    }
  };
  for (const block of layout.blocks) paint(block.x, block.y, block.width, block.height, block.color);
  for (const line of layout.lines) {
    let cursor = line.x;
    for (const char of Array.from(line.text)) {
      const glyphWidth = estimateTextWidth(char, line.fontSize, line.weight);
      const inkWidth = Math.max(1, glyphWidth * 0.72);
      const inkHeight = line.fontSize * 0.7;
      paint(cursor, line.y + (line.fontSize - inkHeight) / 2, inkWidth, inkHeight, line.color);
      cursor += glyphWidth;
    }
  }
  return { rgb, png: encodePng(layout.width, layout.height, rgb) };
}

function countColor(rgb: Uint8Array, width: number, region: ShareBlock, color: string): number {
  const red = channel(color, 0);
  const green = channel(color, 1);
  const blue = channel(color, 2);
  let count = 0;
  const left = Math.max(0, Math.floor(region.x));
  const top = Math.max(0, Math.floor(region.y));
  const right = Math.min(width, Math.ceil(region.x + region.width));
  const bottom = Math.min(region.y + region.height, HEIGHT);
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * width + x) * 3;
      if (rgb[offset] === red && rgb[offset + 1] === green && rgb[offset + 2] === blue) count += 1;
    }
  }
  return count;
}

function bulkyReport(): Report {
  const issue = (title: string, severity: Report["issues"][number]["severity"]): Report["issues"][number] => ({
    title,
    detail: "侧面与正面都能看到这条偏移，久坐之后更明显，训练时先把动作做慢。",
    severity,
  });
  const exercise = (index: number): Report["exerciseSuggestions"][number] => ({
    name: `肩胛稳定伸展${index}号动作名称补足长度`,
    instruction: "肋骨下沉，肩胛向后下收，再缓慢回到起点。每组做八次，中间休息，疼痛就停下。".repeat(2),
  });
  return {
    schemaVersion: 1,
    disclaimer: REPORT_DISCLAIMER,
    issues: [
      issue("头相对躯干持续前移且下颌前突", "mild"),
      issue("双肩向前内扣并带动胸椎变圆", "marked"),
      issue("骨盆相对足部偏前", "moderate"),
    ],
    causeGuesses: [{ guess: "可能与长时间低头看屏幕有关，这只是训练猜测。" }],
    exerciseSuggestions: [exercise(1), exercise(2), exercise(3), exercise(4), exercise(5)],
  };
}

describe("share card layout", () => {
  it("draws a portrait poster whose disclaimer, lead problem, and exercise tips are readable", () => {
    const report = validReport();
    const layout = layoutShareCard(report);
    assert.ok(layout);
    if (!layout) return;
    assert.equal(layout.width, WIDTH);
    assert.equal(layout.width, SHARE_CARD_WIDTH);
    assert.equal(layout.height, HEIGHT);
    assert.equal(layout.height, SHARE_CARD_HEIGHT);
    assert.equal(SHARE_SAVE_API, "saveImageToPhotosAlbum");

    const heading = layout.lines.find((line) => line.role === "disclaimerHeading");
    const band = layout.blocks.find((block) => block.role === "disclaimer");
    assert.ok(heading);
    assert.ok(band);
    if (!heading || !band) return;
    assert.equal(heading.text, "非医疗诊断");
    assert.ok(heading.fontSize >= 36);
    assert.equal(heading.color.toLowerCase(), theme.color.primaryInk);
    assert.equal(band.color.toLowerCase(), theme.color.primarySoft);
    assert.equal(band.y, 0);
    assert.ok(band.height >= heading.fontSize + 24);
    assert.equal(textOf(layout, "disclaimer"), report.disclaimer);
    for (const line of layout.lines.filter((item) => item.role === "disclaimer" || item.role === "disclaimerHeading")) {
      assert.ok(line.fontSize >= 24, `${line.role} ${line.fontSize}`);
      assert.ok(line.y >= band.y);
      assert.ok(line.y + line.fontSize <= band.y + band.height);
      const ink = line.role === "disclaimerHeading" ? theme.color.primaryInk : theme.color.inkSecondary;
      assert.equal(line.color.toLowerCase(), ink);
    }
    assert.ok(band.y + band.height < HEIGHT * 0.45);

    assert.equal(textOf(layout, "leadTitle"), "头前引");
    assert.equal(textOf(layout, "leadDetail"), report.issues[0]?.detail);
    assert.match(textOf(layout, "severity"), /中等/);
    assert.match(textOf(layout, "otherIssues"), /圆肩趋势/);
    for (const exercise of report.exerciseSuggestions) {
      assert.equal(textOf(layout, "exerciseName").includes(exercise.name), true, exercise.name);
      assert.equal(textOf(layout, "exerciseTip").includes(exercise.instruction), true, exercise.instruction);
    }
    assert.equal(textOf(layout, "footer").includes("不含自拍"), true);
    assert.equal(JSON.stringify(layout).includes("wxfile"), false);
    assert.equal(JSON.stringify(layout).includes("base64"), false);
    assert.equal(JSON.stringify(layout).includes(report.causeGuesses[0]?.guess ?? "缺失"), false);

    for (const line of layout.lines) {
      const glyph = box(line);
      assert.ok(glyph.w > 0, line.text);
      assert.ok(line.x >= 24, line.text);
      assert.ok(line.x + glyph.w <= WIDTH - 24, `${line.role} ${line.text}`);
      assert.ok(line.y >= 0 && line.y + line.fontSize <= HEIGHT, line.text);
      assert.ok(contrast(line.color, backgroundAt(layout, line.x + 1, line.y + 1)) >= 4.5, line.role);
    }
    for (let left = 0; left < layout.lines.length; left += 1) {
      for (let right = left + 1; right < layout.lines.length; right += 1) {
        const a: ShareLine = layout.lines[left]!;
        const b: ShareLine = layout.lines[right]!;
        assert.equal(intersects(box(a), box(b)), false, `${a.text} / ${b.text}`);
      }
    }

    const image = rasterize(layout);
    assert.deepEqual(readPngSize(image.png), { width: WIDTH, height: HEIGHT });
    assert.ok(image.png.length > 1000);
    const headingInk = countColor(image.rgb, WIDTH, band, theme.color.primaryInk);
    const bodyInk = countColor(image.rgb, WIDTH, band, theme.color.inkSecondary);
    assert.equal(layout.blocks.find((block) => block.role === "background")?.color, theme.color.bg);
    for (const badge of layout.blocks.filter((block) => block.role === "badge")) {
      assert.equal(badge.color, theme.color.primary);
    }
    for (const panel of layout.blocks.filter((block) => block.role === "panel")) {
      assert.equal(panel.color, theme.color.surface);
    }
    for (const line of layout.lines.filter((item) => item.role === "exerciseIndex")) {
      assert.equal(line.color, theme.color.onPrimary);
    }
    const bandFill = countColor(image.rgb, WIDTH, band, theme.color.primarySoft);
    assert.ok(headingInk + bodyInk > 800, `disclaimer ink ${headingInk + bodyInk}`);
    assert.ok(bandFill > headingInk + bodyInk, "disclaimer band stays visible around the text");
    const lower: ShareBlock = {
      role: "background",
      x: 0,
      y: band.y + band.height,
      width: WIDTH,
      height: HEIGHT - band.height,
      color: theme.color.ink,
    };
    assert.ok(countColor(image.rgb, WIDTH, lower, theme.color.ink) > 400, "problem and exercise text is painted below the disclaimer");
  });

  it("leads with the most severe issue and still fits a long report", () => {
    const report = bulkyReport();
    const layout = layoutShareCard(report);
    assert.ok(layout);
    if (!layout) return;
    assert.equal(textOf(layout, "leadTitle"), "双肩向前内扣并带动胸椎变圆");
    assert.equal(textOf(layout, "disclaimer"), REPORT_DISCLAIMER);
    assert.equal(textOf(layout, "disclaimerHeading"), "非医疗诊断");
    let names = textOf(layout, "exerciseName");
    for (const exercise of report.exerciseSuggestions) {
      assert.equal(names.startsWith(exercise.name), true, exercise.name);
      names = names.slice(exercise.name.length);
    }
    assert.equal(names, "");
    for (const line of layout.lines) {
      const glyph = box(line);
      assert.ok(line.x + glyph.w <= WIDTH - 24, line.text);
      assert.ok(line.y + line.fontSize <= HEIGHT, line.text);
    }
    const image = rasterize(layout);
    assert.equal(readPngSize(image.png).height, HEIGHT);
  });

  it("paints when the disclaimer, a lead issue, and exercise lines are drawable", () => {
    const report = validReport();
    assert.equal(layoutShareCard({ ...report, disclaimer: "   " }), null);
    assert.equal(layoutShareCard({ ...report, issues: [] }), null);
    assert.equal(
      layoutShareCard({
        ...report,
        issues: [{ title: "  ", detail: "有内容。", severity: "mild" }],
      }),
      null,
    );
    assert.equal(
      layoutShareCard({
        ...report,
        exerciseSuggestions: [{ name: "  ", instruction: "背靠墙抬臂。", addresses: "" }, ...report.exerciseSuggestions.slice(1)],
      }),
      null,
    );
    const two = layoutShareCard({ ...report, exerciseSuggestions: report.exerciseSuggestions.slice(0, 2) });
    assert.ok(two);
    assert.equal(textOf(two!, "exerciseName").includes("靠墙天使"), true);
    assert.equal(textOf(two!, "exerciseName").includes("弹力带面拉"), true);
    const six = layoutShareCard({
      ...report,
      exerciseSuggestions: [
        ...report.exerciseSuggestions,
        { name: "猫牛", instruction: "双手撑地，脊柱缓慢屈伸。" },
        { name: "死虫", instruction: "仰卧对侧手脚缓慢伸直。" },
      ],
    });
    assert.ok(six);
    assert.equal(textOf(six!, "exerciseName").includes("猫牛"), true);
    assert.equal(textOf(six!, "exerciseName").includes("死虫"), true);
    const untitledDetail = layoutShareCard({
      ...report,
      schemaVersion: 2 as 1,
      causeGuesses: [],
      issues: [{ title: "头前引", detail: "  ", severity: "moderate" }],
    });
    assert.ok(untitledDetail);
    assert.equal(textOf(untitledDetail!, "leadTitle"), "头前引");
    assert.equal(textOf(untitledDetail!, "leadDetail"), "");
    assert.equal(textOf(untitledDetail!, "disclaimer"), report.disclaimer);
  });

  it("rounds poster panels and badges with the shared radii", () => {
    const layout = layoutShareCard(validReport());
    assert.ok(layout);
    if (!layout) return;
    const panels = layout.blocks.filter((block) => block.role === "panel");
    const badges = layout.blocks.filter((block) => block.role === "badge");
    assert.ok(panels.length > 0);
    assert.ok(badges.length > 0);
    for (const panel of panels) assert.equal(panel.radius, theme.radius.card);
    for (const badge of badges) assert.equal(badge.radius, theme.radius.badge);
    for (const line of layout.lines) {
      const glyph = box(line);
      for (const block of [...panels, ...badges]) {
        const centerX = line.x + glyph.w / 2;
        const centerY = line.y + glyph.h / 2;
        if (!insideRounded(block, centerX, centerY)) continue;
        assert.equal(insideRounded(block, line.x, line.y), true, line.text);
        assert.equal(insideRounded(block, line.x + glyph.w, line.y), true, line.text);
        assert.equal(insideRounded(block, line.x, line.y + glyph.h), true, line.text);
        assert.equal(insideRounded(block, line.x + glyph.w, line.y + glyph.h), true, line.text);
      }
    }
    const arcs: number[] = [];
    let rects = 0;
    const ctx: ShareCanvas = {
      fillStyle: "",
      font: "",
      textAlign: "left",
      textBaseline: "top",
      fillRect() {
        rects += 1;
      },
      fillText() {},
      beginPath() {},
      moveTo() {},
      arcTo(_x1, _y1, _x2, _y2, radius) {
        arcs.push(radius);
      },
      closePath() {},
      fill() {},
    };
    paintShareCard(ctx, layout);
    assert.equal(rects, layout.blocks.filter((block) => (block.radius ?? 0) === 0).length);
    assert.equal(arcs.filter((radius) => radius === theme.radius.card).length, panels.length * 4);
    assert.equal(arcs.filter((radius) => radius === theme.radius.badge).length, badges.length * 4);
  });
});

function insideRounded(block: ShareBlock, x: number, y: number): boolean {
  const right = block.x + block.width;
  const bottom = block.y + block.height;
  if (x < block.x || y < block.y || x > right || y > bottom) return false;
  const radius = Math.min(block.radius ?? 0, block.width / 2, block.height / 2);
  if (radius <= 0) return true;
  const cx = Math.min(Math.max(x, block.x + radius), right - radius);
  const cy = Math.min(Math.max(y, block.y + radius), bottom - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius + 1e-6;
}

describe("save share card", () => {
  function deps(log: string[], outcome: "saved" | "denied" | "failed" | "throw", confirm = false): ShareSaveDeps {
    return {
      paintAndExport(layout) {
        log.push(`export:${layout.lines.some((line) => line.text === "非医疗诊断")}`);
        return Promise.resolve("wxfile://tmp_share.png");
      },
      saveToAlbum(filePath) {
        log.push(`album:${filePath}`);
        if (outcome === "throw") return Promise.reject(new Error("album"));
        return Promise.resolve(outcome);
      },
      confirmOpenSettings() {
        log.push("confirm");
        return Promise.resolve(confirm);
      },
      openSettings() {
        log.push("settings");
        return Promise.resolve();
      },
      unlink(filePath) {
        log.push(`unlink:${filePath}`);
      },
      hold(open) {
        log.push(open ? "hold" : "release");
      },
      notify(kind) {
        log.push(`notify:${kind}`);
      },
    };
  }

  it("saves the temp poster to the album and deletes the temp file", async () => {
    const log: string[] = [];
    const result = await saveShareCard(validReport(), deps(log, "saved"));
    assert.equal(result, "saved");
    assert.deepEqual(log, [
      "hold",
      "export:true",
      "album:wxfile://tmp_share.png",
      "notify:saved",
      "unlink:wxfile://tmp_share.png",
      "release",
    ]);
    const album = log.indexOf("album:wxfile://tmp_share.png");
    assert.ok(log.indexOf("hold") < album);
    assert.ok(album < log.indexOf("release"));
    assert.equal(log.filter((entry) => entry.startsWith("unlink:")).length, 1);
  });

  it("asks for album permission and does not keep the temp poster", async () => {
    const cancelled: string[] = [];
    assert.equal(await saveShareCard(validReport(), deps(cancelled, "denied", false)), "denied");
    assert.equal(cancelled.includes("settings"), false);
    assert.equal(cancelled.includes("notify:failed"), true);
    assert.equal(cancelled.includes("unlink:wxfile://tmp_share.png"), true);
    assert.equal(cancelled.at(-1), "release");

    const accepted: string[] = [];
    assert.equal(await saveShareCard(validReport(), deps(accepted, "denied", true)), "denied");
    assert.ok(accepted.indexOf("confirm") < accepted.indexOf("settings"));
    assert.equal(accepted.includes("notify:saved"), false);
    assert.equal(accepted.includes("unlink:wxfile://tmp_share.png"), true);
  });

  it("does not export or save when the report cannot be drawn", async () => {
    const log: string[] = [];
    const result = await saveShareCard({ ...validReport(), disclaimer: "" }, deps(log, "saved"));
    assert.equal(result, "invalid");
    assert.deepEqual(log, ["notify:invalid"]);
  });

  it("releases the session hold when export or the album call fails", async () => {
    const missing: string[] = [];
    const failedExport: ShareSaveDeps = {
      ...deps(missing, "saved"),
      paintAndExport() {
        missing.push("export");
        return Promise.resolve(null);
      },
    };
    assert.equal(await saveShareCard(validReport(), failedExport), "failed");
    assert.deepEqual(missing, ["hold", "export", "notify:failed", "release"]);

    const thrown: string[] = [];
    assert.equal(await saveShareCard(validReport(), deps(thrown, "throw")), "failed");
    assert.equal(thrown.includes("unlink:wxfile://tmp_share.png"), true);
    assert.equal(thrown.at(-1), "release");
    assert.equal(thrown.includes("notify:saved"), false);
  });
});
