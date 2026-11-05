import { COPY } from "./copy.js";
import type { SessionState } from "./session.js";
import type { PostureIssue, Report, RetakeGuidance, ShotView } from "./types.js";

/** One capture screen. Front and side are never shown together. */
export type CaptureStep = "front" | "side";

export interface SlotView {
  view: ShotView;
  label: string;
  hint: string;
  filled: boolean;
  preview: string;
  shootLabel: string;
  albumLabel: string;
  removeLabel: string;
  needsRetake: boolean;
}

/** Retake copy for the step on screen. The other photo's messages stay on its own step. */
export interface CaptureRetakeView {
  title: string;
  lead: string;
  summary: string;
  messages: string[];
  checklistTitle: string;
  checklist: string[];
}

export interface CaptureView {
  step: CaptureStep;
  stepLabel: string;
  title: string;
  guide: string;
  backLabel: string;
  frontChosenLabel: string;
  slot: SlotView;
  aside: string;
  primaryLabel: string;
  primaryAction: "next" | "analyze";
  primaryReady: boolean;
  submitting: boolean;
  notice: string | null;
  retake: CaptureRetakeView | null;
  /** Shown on the front step when the side photo also has to be retaken. */
  otherRetakeNote: string;
}

export interface OverviewIssueView {
  title: string;
  severityLabel: string;
}

export interface ProblemCardView {
  key: string;
  title: string;
  detail: string;
  severityLabel: string;
  guesses: Array<{ text: string }>;
  unmatched: boolean;
}

export interface ReportView {
  title: string;
  overviewTitle: string;
  disclaimerHeading: string;
  disclaimer: string;
  /** The overview card renders the disclaimer before any finding. */
  disclaimerProminent: true;
  overviewIssue: OverviewIssueView | null;
  countsLabel: string;
  problemTitle: string;
  causesNote: string;
  problems: ProblemCardView[];
  actionTitle: string;
  exercises: Array<{ key: string; index: number; name: string; instruction: string; addresses: string }>;
  sessionNote: string;
  againLabel: string;
  shareLabel: string;
  shareHint: string;
  shareSavingLabel: string;
}

/**
 * Reading order on the report page and the share card.
 * The disclaimer is the first block inside 总览, ahead of any finding.
 */
export const REPORT_SECTION_ORDER = ["overview", "problem", "action"] as const;

const SEVERITY_RANK: Record<string, number> = { mild: 1, moderate: 2, marked: 3 };

/** Side is only reachable after a front photo is chosen. The page asks; this does not clear the side photo. */
export function resolveCaptureStep(state: SessionState, requested: CaptureStep): CaptureStep {
  if (requested === "side" && state.front) return "side";
  return "front";
}

/**
 * Where to land when retake guidance arrives.
 * A result that names the front photo opens the front step. Otherwise stay on the side step.
 * Call this once. Later navigation is the guest's own next and back actions.
 */
export function routeAfterRetake(guidance: RetakeGuidance): CaptureStep {
  return guidance.shots.some((shot) => shot.view === "front") ? "front" : "side";
}

/** Highest severity wins. A tie keeps the earlier issue. The same rule is used on the share card. */
export function primaryIssue(issues: readonly PostureIssue[]): PostureIssue | null {
  if (!Array.isArray(issues)) return null;
  let best: PostureIssue | null = null;
  for (const issue of issues) {
    if (!issue || typeof issue.title !== "string" || issue.title.trim() === "") continue;
    const rank = SEVERITY_RANK[issue.severity] ?? 0;
    const bestRank = best ? (SEVERITY_RANK[best.severity] ?? 0) : -1;
    if (!best || rank > bestRank) best = issue;
  }
  return best;
}

export function sectionCountLine(issueCount: number, actionCount: number): string {
  return `${issueCount} 个${COPY.sectionProblem} · ${actionCount} 个${COPY.sectionAction}`;
}

export function captureView(state: SessionState, step: CaptureStep = "front"): CaptureView {
  const guidance = state.retakeGuidance;
  const retakeViews = new Set((guidance?.shots ?? []).map((shot) => shot.view));
  const showRetake = guidance !== null && retakeViews.has(step);
  const front = step === "front";
  return {
    step,
    stepLabel: front ? COPY.frontLabel : COPY.sideLabel,
    title: front ? COPY.frontStepTitle : COPY.sideStepTitle,
    guide: front ? COPY.frontHint : COPY.sideHint,
    backLabel: front ? "" : COPY.backToFront,
    frontChosenLabel: front ? "" : COPY.frontChosen,
    slot: slotView(state, step, retakeViews.has(step)),
    aside: front ? COPY.captureLead : COPY.needBoth,
    primaryLabel: !front && state.submitting ? COPY.submitting : front ? COPY.nextStep : COPY.submit,
    primaryAction: front ? "next" : "analyze",
    primaryReady: front ? state.front !== null && !state.submitting : state.front !== null && state.side !== null && !state.submitting,
    submitting: state.submitting,
    notice: state.notice,
    retake: showRetake && guidance ? retakeView(guidance, step) : null,
    otherRetakeNote: front && retakeViews.has("front") && retakeViews.has("side") ? COPY.sideAlsoRetake : "",
  };
}

export function reportView(report: Report): ReportView {
  const lead = primaryIssue(report.issues);
  return {
    title: COPY.reportTitle,
    overviewTitle: COPY.sectionOverview,
    disclaimerHeading: COPY.disclaimerHeading,
    disclaimer: report.disclaimer,
    disclaimerProminent: true,
    overviewIssue: lead ? { title: lead.title, severityLabel: severityLabel(lead.severity) } : null,
    countsLabel: sectionCountLine(report.issues.length, report.exerciseSuggestions.length),
    problemTitle: COPY.sectionProblem,
    causesNote: COPY.causesNote,
    problems: problemCards(report),
    actionTitle: COPY.sectionAction,
    exercises: report.exerciseSuggestions.map((exercise, index) => ({
      key: `${index + 1}-${exercise.name}`,
      index: index + 1,
      name: exercise.name,
      instruction: exercise.instruction,
      addresses: exercise.addresses ? `${COPY.addressesPrefix}：${exercise.addresses}` : "",
    })),
    sessionNote: COPY.sessionNote,
    againLabel: COPY.again,
    shareLabel: COPY.shareSave,
    shareHint: COPY.shareHint,
    shareSavingLabel: COPY.shareSaving,
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

function problemCards(report: Report): ProblemCardView[] {
  const cards: ProblemCardView[] = report.issues.map((issue, index) => ({
    key: `issue-${index}`,
    title: issue.title,
    detail: issue.detail,
    severityLabel: severityLabel(issue.severity),
    guesses: [],
    unmatched: false,
  }));
  const unmatched: Array<{ text: string }> = [];
  for (const cause of report.causeGuesses) {
    const related = typeof cause.relatedIssueTitle === "string" ? cause.relatedIssueTitle.trim() : "";
    const card = related === "" ? undefined : cards.find((item) => item.title.trim() === related);
    const guess = { text: cause.guess };
    if (card) card.guesses.push(guess);
    else unmatched.push(guess);
  }
  if (unmatched.length > 0) {
    cards.push({
      key: "unmatched",
      title: COPY.unmatchedCause,
      detail: "",
      severityLabel: "",
      guesses: unmatched,
      unmatched: true,
    });
  }
  return cards;
}

function slotView(state: SessionState, view: ShotView, needsRetake: boolean): SlotView {
  const shot = view === "front" ? state.front : state.side;
  const filled = shot !== null;
  return {
    view,
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

function retakeView(guidance: RetakeGuidance, view: ShotView): CaptureRetakeView {
  const messages: string[] = [];
  for (const shot of guidance.shots) {
    if (shot.view === view) messages.push(...shot.messages);
  }
  return {
    title: COPY.retakeTitle,
    lead: COPY.retakeLead,
    summary: guidance.summary,
    messages,
    checklistTitle: COPY.checklistTitle,
    checklist: guidance.checklist.slice(),
  };
}
