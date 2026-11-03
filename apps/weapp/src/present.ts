import { COPY } from "./copy.js";
import type { SessionState } from "./session.js";
import type { Report, RetakeGuidance } from "./types.js";

export interface SlotView {
  label: string;
  hint: string;
  filled: boolean;
  preview: string;
  shootLabel: string;
  albumLabel: string;
  removeLabel: string;
  needsRetake: boolean;
}

export interface RetakeView {
  title: string;
  lead: string;
  summary: string;
  checklistTitle: string;
  checklist: string[];
  shots: Array<{ label: string; messages: string[] }>;
}

export interface CaptureView {
  title: string;
  lead: string;
  needBoth: string;
  front: SlotView;
  side: SlotView;
  submitLabel: string;
  submitting: boolean;
  ready: boolean;
  notice: string | null;
  retake: RetakeView | null;
}

export interface ReportView {
  title: string;
  disclaimerHeading: string;
  disclaimer: string;
  /** The report page renders this block first, sticky, and high contrast. */
  disclaimerProminent: true;
  issuesTitle: string;
  causesTitle: string;
  causesNote: string;
  exercisesTitle: string;
  sessionNote: string;
  againLabel: string;
  shareLabel: string;
  shareHint: string;
  shareSavingLabel: string;
  issues: Array<{ title: string; detail: string; severityLabel: string }>;
  causes: Array<{ guess: string; related: string }>;
  exercises: Array<{ key: string; index: number; name: string; instruction: string; addresses: string }>;
}

/** Section order on the report page. The disclaimer stays ahead of any finding. */
export const REPORT_SECTION_ORDER = ["disclaimer", "issues", "causes", "exercises"] as const;

export function captureView(state: SessionState): CaptureView {
  const retakeViews = new Set((state.retakeGuidance?.shots ?? []).map((shot) => shot.view));
  return {
    title: COPY.captureTitle,
    lead: COPY.captureLead,
    needBoth: COPY.needBoth,
    front: slotView(state, "front", retakeViews.has("front")),
    side: slotView(state, "side", retakeViews.has("side")),
    submitLabel: state.submitting ? COPY.submitting : COPY.submit,
    submitting: state.submitting,
    ready: state.front !== null && state.side !== null && !state.submitting,
    notice: state.notice,
    retake: state.retakeGuidance ? retakeView(state.retakeGuidance) : null,
  };
}

export function reportView(report: Report): ReportView {
  return {
    title: COPY.reportTitle,
    disclaimerHeading: COPY.disclaimerHeading,
    disclaimer: report.disclaimer,
    disclaimerProminent: true,
    issuesTitle: COPY.issuesTitle,
    causesTitle: COPY.causesTitle,
    causesNote: COPY.causesNote,
    exercisesTitle: COPY.exercisesTitle,
    sessionNote: COPY.sessionNote,
    againLabel: COPY.again,
    shareLabel: COPY.shareSave,
    shareHint: COPY.shareHint,
    shareSavingLabel: COPY.shareSaving,
    issues: report.issues.map((issue) => ({
      title: issue.title,
      detail: issue.detail,
      severityLabel: severityLabel(issue.severity),
    })),
    causes: report.causeGuesses.map((cause) => ({
      guess: cause.guess,
      related: cause.relatedIssueTitle ? `${COPY.relatedPrefix}：${cause.relatedIssueTitle}` : "",
    })),
    exercises: report.exerciseSuggestions.map((exercise, index) => ({
      key: `${index + 1}-${exercise.name}`,
      index: index + 1,
      name: exercise.name,
      instruction: exercise.instruction,
      addresses: exercise.addresses ? `${COPY.addressesPrefix}：${exercise.addresses}` : "",
    })),
  };
}

export function severityLabel(severity: string): string {
  switch (severity) {
    case "mild":
      return COPY.severityMild;
    case "moderate":
      return COPY.severityModerate;
    case "marked":
      return COPY.severityMarked;
    default:
      return "";
  }
}

function slotView(state: SessionState, view: "front" | "side", needsRetake: boolean): SlotView {
  const shot = view === "front" ? state.front : state.side;
  const filled = shot !== null;
  return {
    label: view === "front" ? COPY.frontLabel : COPY.sideLabel,
    hint: view === "front" ? COPY.frontHint : COPY.sideHint,
    filled,
    preview: shot ? shot.tempFilePath : "",
    shootLabel: filled ? COPY.reshoot : COPY.shoot,
    albumLabel: filled ? COPY.reselect : COPY.album,
    removeLabel: COPY.remove,
    needsRetake,
  };
}

function retakeView(guidance: RetakeGuidance): RetakeView {
  return {
    title: COPY.retakeTitle,
    lead: COPY.retakeLead,
    summary: guidance.summary,
    checklistTitle: COPY.checklistTitle,
    checklist: guidance.checklist.slice(),
    shots: guidance.shots.map((shot) => ({
      label: shot.view === "front" ? COPY.frontLabel : COPY.sideLabel,
      messages: shot.messages.slice(),
    })),
  };
}
