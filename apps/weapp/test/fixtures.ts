import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { MediaType, PhotoPayload, Report, RetakeGuidance } from "../src/types.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../../packages/posture-core/test/fixtures");

export function loadPhoto(name: string, mediaType: MediaType = "image/png"): PhotoPayload {
  return {
    mediaType,
    dataBase64: readFileSync(join(fixturesDir, name)).toString("base64"),
  };
}

export function sampleReport(disclaimer: string): Report {
  return {
    schemaVersion: 1,
    disclaimer,
    issues: [
      { title: "头前引", detail: "侧面观下，头相对躯干前移。", severity: "moderate" },
      { title: "圆肩趋势", detail: "正面观下，双肩略向前内扣。", severity: "mild" },
    ],
    causeGuesses: [
      { relatedIssueTitle: "头前引", guess: "可能与长时间低头看屏幕有关。" },
      { guess: "圆肩可能与胸前偏紧有关，这是猜测。" },
    ],
    exerciseSuggestions: [
      { name: "靠墙天使", instruction: "背靠墙，手臂沿墙缓慢上举下落。", addresses: "圆肩趋势" },
      { name: "弹力带面拉", instruction: "向面部拉弹力带并挤肩胛。" },
      { name: "仰卧收下巴", instruction: "仰卧，后脑轻轻压向地面。" },
      { name: "鸟狗", instruction: "四肢撑地，对侧手脚缓慢伸直。" },
    ],
  };
}

export function sampleRetake(): RetakeGuidance {
  return {
    schemaVersion: 1,
    code: "poor_quality",
    summary: "侧面照片质量不够，本次只给出重拍指引，不会做体态分析。",
    shots: [
      {
        view: "side",
        problem: "poor_quality",
        reasons: ["low_resolution"],
        messages: ["侧面照片分辨率过低，看不清全身轮廓。请提高清晰度后重拍。"],
      },
    ],
    checklist: [
      "在明亮、均匀的光线下拍摄，避免逆光和严重模糊。",
      "全身入画：头顶到脚尖都在画面内。",
    ],
  };
}
