import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const { ANALYZE_TIMEOUT_MS, COMPRESS_QUALITY } = require("../miniprogram/config.js") as {
  ANALYZE_TIMEOUT_MS: number;
  COMPRESS_QUALITY: number;
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

describe("mini program shell", () => {
  it("has capture and report pages and no history page", () => {
    const app = JSON.parse(read("miniprogram/app.json")) as {
      pages: string[];
      permission: { "scope.camera": { desc: string } };
    };
    assert.deepEqual(app.pages, ["pages/capture/capture", "pages/report/report"]);
    assert.equal(/[A-Za-z]/.test(app.permission["scope.camera"].desc), false);
    for (const page of ["capture", "report"]) {
      const config = JSON.parse(read(`miniprogram/pages/${page}/${page}.json`)) as { navigationBarTitleText: string };
      assert.equal(/[A-Za-z]/.test(config.navigationBarTitleText), false);
      assert.match(config.navigationBarTitleText, /\p{Script=Han}/u);
    }
  });

  it("puts a sticky disclaimer banner above the findings", () => {
    const wxml = read("miniprogram/pages/report/report.wxml");
    const banner = wxml.indexOf("disclaimer-banner");
    const issues = wxml.indexOf("section-issues");
    assert.ok(banner >= 0 && issues > banner);
    assert.match(wxml, /\{\{disclaimer\}\}/);
    assert.match(wxml, /\{\{disclaimerHeading\}\}/);
    const style = read("miniprogram/pages/report/report.wxss");
    assert.match(style, /position:\s*sticky/);
    assert.match(style, /#3f2a1d/);
  });

  it("keeps visible markup in Chinese", () => {
    for (const page of ["capture", "report"]) {
      const wxml = read(`miniprogram/pages/${page}/${page}.wxml`);
      const visible = wxml.replace(/<[^>]+>/g, " ").replace(/\{\{[^}]+\}\}/g, " ");
      assert.equal(/[A-Za-z]/.test(visible), false, visible);
    }
  });

  it("saves a share card from the report page without archiving the poster", () => {
    const wxml = read("miniprogram/pages/report/report.wxml");
    const page = read("miniprogram/pages/report/report.js");
    const source = read("src/share-card.ts");
    assert.match(wxml, /bindtap="onSaveShare"/);
    assert.match(wxml, /class="share-hint"/);
    assert.match(wxml, /type="2d"/);
    assert.match(wxml, /id="share-card"/);
    assert.ok(wxml.indexOf("disclaimer-banner") < wxml.indexOf("onSaveShare"));
    assert.match(page, /saveImageToPhotosAlbum/);
    assert.match(page, /canvasToTempFilePath/);
    assert.match(page, /createOffscreenCanvas/);
    assert.match(page, /holdSession/);
    assert.match(source, /saveImageToPhotosAlbum/);
    assert.doesNotMatch(source, /drawImage|tempFilePath|dataBase64/);
    assert.doesNotMatch(page, /onShareAppMessage|setStorage|saveFile|writeFile/);
    const app = JSON.parse(read("miniprogram/app.json")) as {
      permission: { "scope.writePhotosAlbum": { desc: string } };
    };
    const album = app.permission["scope.writePhotosAlbum"].desc;
    assert.equal(/[A-Za-z]/.test(album), false);
    assert.match(album, /相册/);
  });

  it("does not archive photos or reports, and does not add login", () => {
    const files = [
      ...walk(join(root, "src")).map((file) => relative(root, file)),
      ...walk(join(root, "miniprogram")).map((file) => relative(root, file)),
    ];
    const forbidden =
      /setStorage|getStorage|saveFile|writeFile|openDatabase|onShareAppMessage|getUserProfile|wx\.login|请登录|立即登录|微信登录|pages\/history/;
    for (const file of files) {
      if (!/\.(ts|js|wxml|json|wxss)$/.test(file)) continue;
      const text = read(file);
      assert.equal(forbidden.test(text), false, file);
    }
    const source = walk(join(root, "src"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    assert.equal(source.includes("posture-core"), false);
    assert.equal(source.includes("posture-api"), false);
    assert.equal(source.includes("analyzePosture"), false);
    assert.match(read("miniprogram/pages/capture/capture.js"), /lib\/flow\.js/);
    assert.match(read("miniprogram/pages/report/report.js"), /clearReport/);
    assert.match(read("miniprogram/pages/report/report.js"), /reLaunch/);
    assert.match(read("miniprogram/app.js"), /onAppHide/);
    assert.match(read("miniprogram/config.js"), /apiBaseUrl/);
    const appJson = JSON.parse(read("miniprogram/app.json")) as { networkTimeout: { request: number } };
    assert.equal(appJson.networkTimeout.request, ANALYZE_TIMEOUT_MS);
    assert.match(read("miniprogram/services/wx-transport.js"), /ANALYZE_TIMEOUT_MS/);
    assert.doesNotMatch(read("miniprogram/services/wx-transport.js"), /\b60000\b/);
    assert.match(read("miniprogram/services/photos.js"), /COMPRESS_QUALITY/);
    assert.equal(typeof COMPRESS_QUALITY, "number");
    assert.doesNotMatch(read("miniprogram/services/photos.js"), /quality:\s*\d+/);
  });
});
