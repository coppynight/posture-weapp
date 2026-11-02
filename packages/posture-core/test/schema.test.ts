import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { REPORT_DISCLAIMER, validateReport, validateRetakeGuidance } from "../src/index.js";
import { mockReportDraft } from "../src/mock-provider.js";

function withSuggestions(count: number): unknown {
  const draft = mockReportDraft();
  const seed = draft.exerciseSuggestions[0];
  if (seed === undefined) {
    throw new Error("mock draft is missing a suggestion");
  }
  return {
    ...draft,
    exerciseSuggestions: Array.from({ length: count }, (_, index) => ({
      name: `${seed.name}${index + 1}`,
      instruction: seed.instruction,
      addresses: seed.addresses,
    })),
  };
}

describe("validateReport", () => {
  it("accepts the mock draft once the canonical disclaimer is stamped", () => {
    const result = validateReport(mockReportDraft(), { stampDisclaimer: true });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.disclaimer, REPORT_DISCLAIMER);
    assert.equal(result.value.exerciseSuggestions.length, 4);
  });

  it("rejects a draft that does not carry the canonical disclaimer", () => {
    const result = validateReport(mockReportDraft());
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.errors.join("\n"), /disclaimer/);
  });

  it("accepts suggestion counts from 3 to 5 and rejects the boundaries outside that", () => {
    assert.equal(validateReport(withSuggestions(3), { stampDisclaimer: true }).ok, true);
    assert.equal(validateReport(withSuggestions(5), { stampDisclaimer: true }).ok, true);
    assert.equal(validateReport(withSuggestions(2), { stampDisclaimer: true }).ok, false);
    assert.equal(validateReport(withSuggestions(6), { stampDisclaimer: true }).ok, false);
  });

  it("rejects cause text that is not phrased as a guess", () => {
    const draft = mockReportDraft();
    const result = validateReport(
      {
        ...draft,
        causeGuesses: [
          { relatedIssueTitle: "头前引", guess: "就是颈深屈肌损伤。" },
          ...draft.causeGuesses.slice(1),
        ],
      },
      { stampDisclaimer: true },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.errors.join("\n"), /guess/);
  });

  it("rejects branded course names in exercise suggestions", () => {
    const draft = mockReportDraft();
    const result = validateReport(
      {
        ...draft,
        exerciseSuggestions: [
          {
            name: "帕梅拉燃脂",
            instruction: "跟着这节课做完整组。",
            addresses: "圆肩趋势",
          },
          ...draft.exerciseSuggestions.slice(1),
        ],
      },
      { stampDisclaimer: true },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.errors.join("\n"), /帕梅拉/);
  });

  it("accepts a JSON string payload", () => {
    const result = validateReport(JSON.stringify(mockReportDraft()), { stampDisclaimer: true });
    assert.equal(result.ok, true);
  });
});

describe("validateRetakeGuidance", () => {
  it("rejects an object that smuggles report fields", () => {
    const result = validateRetakeGuidance({
      schemaVersion: 1,
      code: "poor_quality",
      summary: "请重拍。",
      shots: [
        {
          view: "front",
          problem: "poor_quality",
          reasons: ["blurry"],
          messages: ["正面照片过于模糊。请重拍。"],
        },
      ],
      checklist: ["请重拍全身照。", "保持光线均匀。"],
      disclaimer: REPORT_DISCLAIMER,
      issues: [],
    });
    assert.equal(result.ok, false);
  });
});
