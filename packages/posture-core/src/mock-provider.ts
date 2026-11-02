import type { AnalyzePostureRequest, MultimodalProvider } from "./provider.js";
import type { ModelReportInput } from "./types.js";

/**
 * Deterministic stand-in for a multimodal vendor.
 * It ignores pixel contents and returns one fixed Simplified Chinese draft.
 */
export class MockMultimodalProvider implements MultimodalProvider {
  readonly calls: AnalyzePostureRequest[] = [];

  async analyzePosture(input: AnalyzePostureRequest): Promise<ModelReportInput> {
    this.calls.push(input);
    return mockReportDraft();
  }
}

export function mockReportDraft(): ModelReportInput {
  return {
    issues: [
      {
        title: "头前引",
        detail: "侧面观下，耳垂落在肩峰前方，头相对躯干前移。",
        severity: "moderate",
      },
      {
        title: "圆肩趋势",
        detail: "正面观下，双肩略向前内扣，锁骨线条不够打开。",
        severity: "mild",
      },
    ],
    causeGuesses: [
      {
        relatedIssueTitle: "头前引",
        guess: "可能与长时间低头看屏幕、颈深屈肌耐力不足有关。这只是训练相关猜测，不是诊断。",
      },
      {
        relatedIssueTitle: "圆肩趋势",
        guess: "可能与胸前肌肉偏紧、上背发力不足有关。这只是训练相关猜测，不是诊断。",
      },
    ],
    exerciseSuggestions: [
      {
        name: "靠墙天使",
        instruction: "背靠墙，肋骨下沉，手臂沿墙缓慢上举下落，每组 8 次。",
        addresses: "圆肩趋势",
      },
      {
        name: "弹力带面拉",
        instruction: "弹力带固定在面前，向面部拉带并挤肩胛，每组 12 次。",
        addresses: "圆肩趋势",
      },
      {
        name: "仰卧收下巴",
        instruction: "仰卧，后脑轻轻压向地面做成双下巴，保持呼吸，每组 10 次。",
        addresses: "头前引",
      },
      {
        name: "鸟狗",
        instruction: "四肢撑地，对侧手脚缓慢伸直，骨盆保持水平，每侧 8 次。",
        addresses: "整体控制",
      },
    ],
  };
}
