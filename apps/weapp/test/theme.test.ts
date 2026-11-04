import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { REPORT_DISCLAIMER } from "posture-core";

import { layoutShareCard } from "../src/share-card.js";
import { theme, themeCssVars } from "../src/theme.js";
import { sampleReport } from "./fixtures.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
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

function chroma(hex: string): number {
  return Math.max(channel(hex, 0), channel(hex, 1), channel(hex, 2)) - Math.min(channel(hex, 0), channel(hex, 1), channel(hex, 2));
}

const confirmedColors = {
  bg: "#f7f7f8",
  surface: "#ffffff",
  ink: "#0d0d0d",
  inkSecondary: "#3f3f46",
  muted: "#5d5d67",
  line: "#e6e6e6",
  primary: "#0d0d0d",
  onPrimary: "#ffffff",
  primarySoft: "#f3f3f3",
  primaryInk: "#0d0d0d",
} as const;

const retiredColors = ["#0f766e", "#f4fffb", "#d4efe8", "#0c5c52", "#f5f7f7", "#1c2422", "#3e4a47", "#55625e", "#dce3e1"];

describe("visual tokens", () => {
  it("uses the confirmed light neutral palette and one near-black accent", () => {
    assert.deepEqual(theme.color, confirmedColors);
    assert.ok(luminance(theme.color.bg) > 0.85, theme.color.bg);
    assert.ok(luminance(theme.color.surface) > 0.9, theme.color.surface);
    assert.ok(luminance(theme.color.primarySoft) > 0.75, theme.color.primarySoft);
    assert.ok(luminance(theme.color.line) > 0.7, theme.color.line);
    for (const [name, hex] of Object.entries(theme.color)) {
      assert.ok(chroma(hex) <= 16, `${name} chroma ${chroma(hex)}`);
      assert.ok(channel(hex, 1) <= channel(hex, 0) + 8, `${name} green cast`);
      const red = channel(hex, 0);
      const green = channel(hex, 1);
      const blue = channel(hex, 2);
      assert.equal(red > green + 15 && red > blue + 15, false, hex);
    }
    assert.ok(contrast(theme.color.ink, theme.color.bg) >= 7);
    assert.ok(contrast(theme.color.ink, theme.color.surface) >= 7);
    assert.ok(contrast(theme.color.ink, theme.color.primarySoft) >= 7);
    assert.ok(contrast(theme.color.inkSecondary, theme.color.bg) >= 4.5);
    assert.ok(contrast(theme.color.inkSecondary, theme.color.surface) >= 4.5);
    assert.ok(contrast(theme.color.muted, theme.color.bg) >= 4.5);
    assert.ok(contrast(theme.color.muted, theme.color.surface) >= 4.5);
    assert.ok(contrast(theme.color.muted, theme.color.line) >= 4.5);
    assert.ok(contrast(theme.color.muted, theme.color.primarySoft) >= 4.5);
    assert.ok(contrast(theme.color.primaryInk, theme.color.bg) >= 4.5);
    assert.ok(contrast(theme.color.primaryInk, theme.color.surface) >= 4.5);
    assert.ok(contrast(theme.color.primaryInk, theme.color.primarySoft) >= 4.5);
    assert.ok(contrast(theme.color.onPrimary, theme.color.primary) >= 4.5);
  });

  it("keeps control radius, a 32 card radius, and a descending type scale", () => {
    assert.equal(theme.radius.card, 32);
    assert.equal(theme.radius.control, 32);
    assert.equal(theme.radius.media, 24);
    assert.equal(theme.radius.pill, 999);
    assert.equal(theme.size.ordinal, 48);
    assert.notEqual(theme.radius.control, theme.size.ordinal);
    assert.ok(theme.radius.control > theme.radius.media);
    assert.equal(theme.radius.badge * 2 >= theme.type.index, true);
    const steps = [
      theme.type.title,
      theme.type.display,
      theme.type.posterTitle,
      theme.type.section,
      theme.type.cardTitle,
      theme.type.body,
      theme.type.reading,
      theme.type.subhead,
      theme.type.caption,
      theme.type.index,
    ];
    for (let index = 1; index < steps.length; index += 1) {
      assert.ok(steps[index - 1]! > steps[index]!, `${steps[index - 1]} > ${steps[index]}`);
    }
  });

  it("publishes the same tokens as global CSS variables and the navigation bar", () => {
    const sheet = read("miniprogram/app.wxss");
    for (const [name, value] of Object.entries(themeCssVars)) {
      assert.match(sheet, new RegExp(`${name}\\s*:\\s*${value.replace("#", "\\#")}\\s*;`), name);
    }
    const app = JSON.parse(read("miniprogram/app.json")) as {
      window: { navigationBarBackgroundColor: string; backgroundColor: string; navigationBarTextStyle: string };
    };
    assert.equal(app.window.navigationBarBackgroundColor.toLowerCase(), theme.color.bg);
    assert.equal(app.window.backgroundColor.toLowerCase(), theme.color.bg);
    assert.equal(app.window.navigationBarTextStyle, "black");
  });

  it("skins capture and report from the variables, without a second palette", () => {
    const sheet = read("miniprogram/app.wxss");
    const capture = read("miniprogram/pages/capture/capture.wxss");
    const report = read("miniprogram/pages/report/report.wxss");
    const captureMarkup = read("miniprogram/pages/capture/capture.wxml");
    const reportMarkup = read("miniprogram/pages/report/report.wxml");
    for (const file of [capture, report]) {
      assert.doesNotMatch(file, /#[0-9a-fA-F]{3,8}\b/);
      assert.match(file, /var\(--radius-card\)/);
      assert.match(file, /var\(--type-title\)/);
      assert.doesNotMatch(file, /\.btn-primary|\.btn-outline|\.btn-share|\.btn-again|\.ordinal/);
    }
    assert.match(sheet, /\.btn-primary\s*\{[^}]*var\(--color-primary\)/);
    assert.match(sheet, /\.btn-outline\s*\{[^}]*var\(--color-line\)/);
    assert.match(sheet, /button\[disabled\]\.btn-primary/);
    assert.match(sheet, /\.btn-muted\s*,\s*button\[disabled\]\.btn-primary/);
    assert.match(sheet, /\.ordinal\s*\{[^}]*var\(--size-ordinal\)/);
    assert.match(sheet, /\.ordinal\s*\{[^}]*border-radius:\s*var\(--radius-pill\)/);
    assert.match(sheet, /\.btn-primary\s*,\s*\.btn-outline\s*\{[^}]*height:\s*96rpx/);
    assert.match(sheet, /\.btn-primary\s*,\s*\.btn-outline\s*\{[^}]*var\(--radius-control\)/);
    assert.equal(theme.size.ordinal, 48);
    assert.match(captureMarkup, /class="ordinal"/);
    assert.match(reportMarkup, /class="ordinal"/);
    assert.match(captureMarkup, /class="btn-primary/);
    assert.match(reportMarkup, /class="btn-primary /);
    assert.match(reportMarkup, /class="btn-outline /);
    assert.doesNotMatch(captureMarkup, /slot-index|btn-share|btn-again/);
    assert.doesNotMatch(reportMarkup, /exercise-index|btn-share|btn-again/);
    assert.match(capture, /var\(--color-primary\)/);
    assert.match(capture, /var\(--color-primary-soft\)/);
    assert.match(report, /var\(--color-primary-soft\)/);
    assert.match(report, /var\(--color-primary-ink\)/);
    assert.match(report, /var\(--type-display\)/);
    assert.doesNotMatch(read("src/share-card.ts"), /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(read("src/share-card.ts"), /\bMUTED\b/);
    assert.match(capture, /\.slot\s*\{[^}]*border:\s*2rpx solid var\(--color-line\)/);
    assert.match(capture, /\.slot-filled\s*,\s*\.slot-warn\s*\{[^}]*border-color:\s*var\(--color-primary\)/);
    assert.doesNotMatch(capture, /dashed/);
    assert.doesNotMatch(capture, /\.slot-warn\s*\{[^}]*background/);
    assert.match(capture, /\.retake\s*\{[^}]*var\(--color-surface\)/);
    assert.doesNotMatch(capture, /\.retake\s*\{[^}]*var\(--color-primary-soft\)/);
    assert.match(capture, /\.title\s*\{[^}]*font-weight:\s*600/);
    assert.match(capture, /\.slot-label\s*\{[^}]*font-weight:\s*600/);
    assert.match(capture, /\.retake-title\s*\{[^}]*font-weight:\s*600/);
    assert.match(report, /\.disclaimer-kicker\s*\{[^}]*font-weight:\s*600/);
    assert.match(report, /\.disclaimer-kicker\s*\{[^}]*var\(--color-primary-ink\)/);
    assert.match(report, /\.disclaimer-body\s*\{[^}]*var\(--color-ink-secondary\)/);
    assert.match(report, /\.tag\s*\{[^}]*var\(--color-primary-soft\)/);
    assert.match(report, /\.tag\s*\{[^}]*var\(--color-ink-secondary\)/);
    assert.match(report, /\.title\s*\{[^}]*font-weight:\s*600/);
    assert.match(report, /\.section-title\s*\{[^}]*font-weight:\s*600/);
    assert.match(report, /\.card-title\s*\{[^}]*font-weight:\s*600/);
    assert.doesNotMatch(report, /font-weight:\s*700/);
    const retiredSurfaces = [
      "src/theme.ts",
      "src/share-card.ts",
      "miniprogram/app.wxss",
      "miniprogram/app.json",
      "miniprogram/lib/theme.js",
      "miniprogram/lib/share-card.js",
      "miniprogram/pages/capture/capture.wxss",
      "miniprogram/pages/report/report.wxss",
    ];
    for (const path of retiredSurfaces) {
      const source = read(path).toLowerCase();
      for (const hex of retiredColors) {
        assert.equal(source.includes(hex), false, `${path} still has ${hex}`);
      }
    }
  });

  it("paints the share card with the same neutral tokens", () => {
    const layout = layoutShareCard(sampleReport(REPORT_DISCLAIMER));
    assert.ok(layout);
    if (!layout) return;
    const allowedColors = new Set<string>(Object.values(theme.color));
    const allowedSizes = new Set<number>(Object.values(theme.type));
    const background = layout.blocks.find((block) => block.role === "background");
    const band = layout.blocks.find((block) => block.role === "disclaimer");
    assert.equal(background?.color, theme.color.bg);
    assert.equal(band?.color, theme.color.primarySoft);
    assert.ok(band && luminance(band.color) > 0.75);
    for (const block of layout.blocks) {
      assert.ok(allowedColors.has(block.color), block.color);
      if (block.role === "panel") {
        assert.equal(block.color, theme.color.surface);
        assert.equal(block.radius, theme.radius.card);
        assert.equal(block.radius, 32);
      }
      if (block.role === "badge") {
        assert.equal(block.color, theme.color.primary);
        assert.equal(block.radius, theme.radius.badge);
      }
    }
    for (const line of layout.lines) {
      assert.ok(allowedColors.has(line.color), line.color);
      assert.ok(allowedSizes.has(line.fontSize), `${line.role} ${line.fontSize}`);
    }
    const heading = layout.lines.find((line) => line.role === "disclaimerHeading");
    assert.equal(heading?.color, theme.color.primaryInk);
    assert.equal(heading?.fontSize, theme.type.display);
    for (const line of layout.lines.filter((item) => item.role === "disclaimer")) {
      assert.equal(line.color, theme.color.inkSecondary);
    }
    for (const line of layout.lines.filter((item) => item.role === "section")) {
      assert.equal(line.color, theme.color.primaryInk);
    }
    for (const line of layout.lines.filter((item) => item.role === "exerciseIndex")) {
      assert.equal(line.color, theme.color.onPrimary);
    }
  });
});
