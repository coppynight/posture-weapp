import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { COPY } from "../src/copy.js";

const HAN = /\p{Script=Han}/u;
const LATIN = /[A-Za-z]/;

describe("guest copy", () => {
  it("is Simplified Chinese, with no Latin letters", () => {
    const values = Object.values(COPY);
    assert.ok(values.length > 20);
    for (const [key, value] of Object.entries(COPY)) {
      assert.equal(typeof value, "string", key);
      assert.equal(LATIN.test(value), false, `${key}: ${value}`);
      assert.match(value, HAN, key);
    }
  });

  it("states the one-photo block, the disclaimer, and that there is no history list", () => {
    assert.match(COPY.needBoth, /缺一不能分析/);
    assert.match(COPY.missingFront, /正面/);
    assert.match(COPY.missingSide, /侧面/);
    assert.match(COPY.missingBoth, /不能开始分析/);
    assert.equal(COPY.disclaimerHeading, "非医疗诊断");
    assert.match(COPY.captureLead, /无需登录/);
    assert.match(COPY.sessionNote, /没有历史列表/);
    assert.equal(COPY.shareSave, "保存分享卡");
    assert.match(COPY.shareHint, /不含自拍照片/);
    assert.match(COPY.shareFooter, /不含自拍/);
    assert.equal(COPY.shareSaved, "已保存到相册");
    assert.equal(JSON.stringify(COPY).includes("请登录"), false);
  });
});
