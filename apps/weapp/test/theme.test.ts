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

function hue(hex: string): number {
  const red = channel(hex, 0) / 255;
  const green = channel(hex, 1) / 255;
  const blue = channel(hex, 2) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (delta === 0) return 0;
  let turn = 0;
  if (max === red) turn = ((green - blue) / delta) % 6;
  else if (max === green) turn = (blue - red) / delta + 2;
  else turn = (red - green) / delta + 4;
  return (turn * 60 + 360) % 360;
}

function chroma(hex: string): number {
  return Math.max(channel(hex, 0), channel(hex, 1), channel(hex, 2)) - Math.min(channel(hex, 0), channel(hex, 1), channel(hex, 2));
}

describe("visual tokens", () => {
  it("keeps a light ground, one teal, and neutral greys", () => {
    assert.ok(luminance(theme.color.bg) > 0.85, theme.color.bg);
    assert.ok(luminance(theme.color.surface) > 0.9, theme.color.surface);
    assert.ok(luminance(theme.color.primarySoft) > 0.75, theme.color.primarySoft);
    assert.ok(luminance(theme.color.line) > 0.7, theme.color.line);
    for (const name of ["primary", "primaryInk"] as const) {
      const hex = theme.color[name];
      const tone = hue(hex);
      assert.ok(tone >= 160 && tone <= 185, `${name} hue ${tone}`);
      assert.ok(channel(hex, 1) > channel(hex, 0), name);
      assert.ok(channel(hex, 1) > channel(hex, 2), name);
    }
    for (const name of ["bg", "ink", "inkSecondary", "muted", "line"] as const) {
      assert.ok(chroma(theme.color[name]) <= 16, `${name} chroma ${chroma(theme.color[name])}`);
    }
    for (const hex of Object.values(theme.color)) {
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

  it("uses large radii and a descending type scale", () => {
    assert.ok(theme.radius.card >= 40);
    assert.ok(theme.radius.control >= 28);
    assert.ok(theme.radius.card > theme.radius.control);
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
  });

  it("paints the share card with the same light teal tokens", () => {
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
      if (block.role === "panel") assert.equal(block.radius, theme.radius.card);
      if (block.role === "badge") assert.equal(block.radius, theme.radius.badge);
    }
    for (const line of layout.lines) {
      assert.ok(allowedColors.has(line.color), line.color);
      assert.ok(allowedSizes.has(line.fontSize), `${line.role} ${line.fontSize}`);
    }
    const heading = layout.lines.find((line) => line.role === "disclaimerHeading");
    assert.equal(heading?.color, theme.color.primaryInk);
    assert.equal(heading?.fontSize, theme.type.display);
  });
});
