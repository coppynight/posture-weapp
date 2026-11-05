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

  it("reads the report as overview, then problems, then actions", () => {
    const wxml = read("miniprogram/pages/report/report.wxml");
    const overview = wxml.indexOf("section-overview");
    const problem = wxml.indexOf("section-problem");
    const action = wxml.indexOf("section-action");
    const disclaimer = wxml.indexOf("disclaimer-kicker");
    const footer = wxml.indexOf("report-footer");
    assert.ok(overview >= 0 && disclaimer > overview && problem > disclaimer && action > problem && footer > action);
    assert.match(wxml, /\{\{disclaimer\}\}/);
    assert.match(wxml, /\{\{disclaimerHeading\}\}/);
    assert.match(wxml, /\{\{overviewTitle\}\}/);
    assert.match(wxml, /\{\{problemTitle\}\}/);
    assert.match(wxml, /\{\{actionTitle\}\}/);
    assert.match(wxml, /\{\{countsLabel\}\}/);
    assert.match(wxml, /\{\{causesNote\}\}/);
    const style = read("miniprogram/pages/report/report.wxss");
    assert.match(style, /var\(--color-primary-soft\)/);
    assert.match(style, /var\(--type-display\)/);
    assert.doesNotMatch(style, /position:\s*sticky/);
  });

  it("shows one capture step and one photo slot", () => {
    const wxml = read("miniprogram/pages/capture/capture.wxml");
    const page = read("miniprogram/pages/capture/capture.js");
    assert.equal(wxml.match(/class="slot /g)?.length, 1);
    assert.match(wxml, /data-view="\{\{slot\.view\}\}"/);
    assert.doesNotMatch(wxml, /data-view="front"/);
    assert.doesNotMatch(wxml, /data-view="side"/);
    assert.match(wxml, /bindtap="onNext"/);
    assert.match(wxml, /bindtap="onBackFront"/);
    assert.match(wxml, /class="guide"/);
    assert.match(page, /step=side/);
    assert.match(page, /navigateBack/);
    assert.match(page, /routeAfterRetake/);
    assert.match(page, /resolveCaptureStep/);
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
    const service = read("miniprogram/services/share-card.js");
    const source = read("src/share-card.ts");
    assert.match(wxml, /bindtap="onSaveShare"/);
    assert.match(wxml, /class="share-hint"/);
    assert.match(wxml, /type="2d"/);
    assert.match(wxml, /id="share-card"/);
    assert.ok(wxml.indexOf("section-overview") < wxml.indexOf("onSaveShare"));
    assert.match(page, /services\/share-card\.js/);
    assert.match(page, /holdSession/);
    assert.doesNotMatch(page, /wx\.saveImageToPhotosAlbum|wx\.canvasToTempFilePath|wx\.createOffscreenCanvas|wx\.openSetting|wx\.showModal/);
    assert.match(service, /saveImageToPhotosAlbum/);
    assert.match(service, /canvasToTempFilePath/);
    assert.match(service, /createOffscreenCanvas/);
    assert.match(source, /saveImageToPhotosAlbum/);
    assert.doesNotMatch(source, /schemaVersion|causeGuesses|drawImage|tempFilePath|dataBase64/);
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
