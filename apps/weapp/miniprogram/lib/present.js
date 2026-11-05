"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPORT_SECTION_ORDER = void 0;
exports.resolveCaptureStep = resolveCaptureStep;
exports.routeAfterRetake = routeAfterRetake;
exports.primaryIssue = primaryIssue;
exports.sectionCountLine = sectionCountLine;
exports.captureView = captureView;
exports.reportView = reportView;
exports.severityLabel = severityLabel;
const copy_js_1 = require("./copy.js");
/**
 * Reading order on the report page and the share card.
 * The disclaimer is the first block inside 总览, ahead of any finding.
 */
exports.REPORT_SECTION_ORDER = ["overview", "problem", "action"];
const SEVERITY_RANK = { mild: 1, moderate: 2, marked: 3 };
/** Side is only reachable after a front photo is chosen. The page asks; this does not clear the side photo. */
function resolveCaptureStep(state, requested) {
    if (requested === "side" && state.front)
        return "side";
    return "front";
}
/**
 * Where to land when retake guidance arrives.
 * A result that names the front photo opens the front step. Otherwise stay on the side step.
 * Call this once. Later navigation is the guest's own next and back actions.
 */
function routeAfterRetake(guidance) {
    return guidance.shots.some((shot) => shot.view === "front") ? "front" : "side";
}
/** Highest severity wins. A tie keeps the earlier issue. The same rule is used on the share card. */
function primaryIssue(issues) {
    var _a, _b;
    if (!Array.isArray(issues))
        return null;
    let best = null;
    for (const issue of issues) {
        if (!issue || typeof issue.title !== "string" || issue.title.trim() === "")
            continue;
        const rank = (_a = SEVERITY_RANK[issue.severity]) !== null && _a !== void 0 ? _a : 0;
        const bestRank = best ? ((_b = SEVERITY_RANK[best.severity]) !== null && _b !== void 0 ? _b : 0) : -1;
        if (!best || rank > bestRank)
            best = issue;
    }
    return best;
}
function sectionCountLine(issueCount, actionCount) {
    return `${issueCount} 个${copy_js_1.COPY.sectionProblem} · ${actionCount} 个${copy_js_1.COPY.sectionAction}`;
}
function captureView(state, step = "front") {
    var _a;
    const guidance = state.retakeGuidance;
    const retakeViews = new Set(((_a = guidance === null || guidance === void 0 ? void 0 : guidance.shots) !== null && _a !== void 0 ? _a : []).map((shot) => shot.view));
    const showRetake = guidance !== null && retakeViews.has(step);
    const front = step === "front";
    return {
        step,
        stepLabel: front ? copy_js_1.COPY.frontLabel : copy_js_1.COPY.sideLabel,
        title: front ? copy_js_1.COPY.frontStepTitle : copy_js_1.COPY.sideStepTitle,
        guide: front ? copy_js_1.COPY.frontHint : copy_js_1.COPY.sideHint,
        backLabel: front ? "" : copy_js_1.COPY.backToFront,
        frontChosenLabel: front ? "" : copy_js_1.COPY.frontChosen,
        slot: slotView(state, step, retakeViews.has(step)),
        aside: front ? copy_js_1.COPY.captureLead : copy_js_1.COPY.needBoth,
        primaryLabel: !front && state.submitting ? copy_js_1.COPY.submitting : front ? copy_js_1.COPY.nextStep : copy_js_1.COPY.submit,
        primaryAction: front ? "next" : "analyze",
        primaryReady: front ? state.front !== null && !state.submitting : state.front !== null && state.side !== null && !state.submitting,
        submitting: state.submitting,
        notice: state.notice,
        retake: showRetake && guidance ? retakeView(guidance, step) : null,
        otherRetakeNote: front && retakeViews.has("front") && retakeViews.has("side") ? copy_js_1.COPY.sideAlsoRetake : "",
    };
}
function reportView(report) {
    const lead = primaryIssue(report.issues);
    return {
        title: copy_js_1.COPY.reportTitle,
        overviewTitle: copy_js_1.COPY.sectionOverview,
        disclaimerHeading: copy_js_1.COPY.disclaimerHeading,
        disclaimer: report.disclaimer,
        disclaimerProminent: true,
        overviewIssue: lead ? { title: lead.title, severityLabel: severityLabel(lead.severity) } : null,
        countsLabel: sectionCountLine(report.issues.length, report.exerciseSuggestions.length),
        problemTitle: copy_js_1.COPY.sectionProblem,
        causesNote: copy_js_1.COPY.causesNote,
        problems: problemCards(report),
        actionTitle: copy_js_1.COPY.sectionAction,
        exercises: report.exerciseSuggestions.map((exercise, index) => ({
            key: `${index + 1}-${exercise.name}`,
            index: index + 1,
            name: exercise.name,
            instruction: exercise.instruction,
            addresses: exercise.addresses ? `${copy_js_1.COPY.addressesPrefix}：${exercise.addresses}` : "",
        })),
        sessionNote: copy_js_1.COPY.sessionNote,
        againLabel: copy_js_1.COPY.again,
        shareLabel: copy_js_1.COPY.shareSave,
        shareHint: copy_js_1.COPY.shareHint,
        shareSavingLabel: copy_js_1.COPY.shareSaving,
    };
}
function severityLabel(severity) {
    switch (severity) {
        case "mild":
            return copy_js_1.COPY.severityMild;
        case "moderate":
            return copy_js_1.COPY.severityModerate;
        case "marked":
            return copy_js_1.COPY.severityMarked;
        default:
            return "";
    }
}
function problemCards(report) {
    const cards = report.issues.map((issue, index) => ({
        key: `issue-${index}`,
        title: issue.title,
        detail: issue.detail,
        severityLabel: severityLabel(issue.severity),
        guesses: [],
        unmatched: false,
    }));
    const unmatched = [];
    for (const cause of report.causeGuesses) {
        const related = typeof cause.relatedIssueTitle === "string" ? cause.relatedIssueTitle.trim() : "";
        const card = related === "" ? undefined : cards.find((item) => item.title.trim() === related);
        const guess = { text: cause.guess };
        if (card)
            card.guesses.push(guess);
        else
            unmatched.push(guess);
    }
    if (unmatched.length > 0) {
        cards.push({
            key: "unmatched",
            title: copy_js_1.COPY.unmatchedCause,
            detail: "",
            severityLabel: "",
            guesses: unmatched,
            unmatched: true,
        });
    }
    return cards;
}
function slotView(state, view, needsRetake) {
    const shot = view === "front" ? state.front : state.side;
    const filled = shot !== null;
    return {
        view,
        label: view === "front" ? copy_js_1.COPY.frontLabel : copy_js_1.COPY.sideLabel,
        hint: view === "front" ? copy_js_1.COPY.frontHint : copy_js_1.COPY.sideHint,
        filled,
        preview: shot ? shot.tempFilePath : "",
        shootLabel: filled ? copy_js_1.COPY.reshoot : copy_js_1.COPY.shoot,
        albumLabel: filled ? copy_js_1.COPY.reselect : copy_js_1.COPY.album,
        removeLabel: copy_js_1.COPY.remove,
        needsRetake,
    };
}
function retakeView(guidance, view) {
    const messages = [];
    for (const shot of guidance.shots) {
        if (shot.view === view)
            messages.push(...shot.messages);
    }
    return {
        title: copy_js_1.COPY.retakeTitle,
        lead: copy_js_1.COPY.retakeLead,
        summary: guidance.summary,
        messages,
        checklistTitle: copy_js_1.COPY.checklistTitle,
        checklist: guidance.checklist.slice(),
    };
}
