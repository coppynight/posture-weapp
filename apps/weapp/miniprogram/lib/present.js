"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPORT_SECTION_ORDER = void 0;
exports.captureView = captureView;
exports.reportView = reportView;
exports.severityLabel = severityLabel;
const copy_js_1 = require("./copy.js");
/** Section order on the report page. The disclaimer stays ahead of any finding. */
exports.REPORT_SECTION_ORDER = ["disclaimer", "issues", "causes", "exercises"];
function captureView(state) {
    var _a, _b;
    const retakeViews = new Set(((_b = (_a = state.retakeGuidance) === null || _a === void 0 ? void 0 : _a.shots) !== null && _b !== void 0 ? _b : []).map((shot) => shot.view));
    return {
        title: copy_js_1.COPY.captureTitle,
        lead: copy_js_1.COPY.captureLead,
        needBoth: copy_js_1.COPY.needBoth,
        front: slotView(state, "front", retakeViews.has("front")),
        side: slotView(state, "side", retakeViews.has("side")),
        submitLabel: state.submitting ? copy_js_1.COPY.submitting : copy_js_1.COPY.submit,
        submitting: state.submitting,
        ready: state.front !== null && state.side !== null && !state.submitting,
        notice: state.notice,
        retake: state.retakeGuidance ? retakeView(state.retakeGuidance) : null,
    };
}
function reportView(report) {
    return {
        title: copy_js_1.COPY.reportTitle,
        disclaimerHeading: copy_js_1.COPY.disclaimerHeading,
        disclaimer: report.disclaimer,
        disclaimerProminent: true,
        issuesTitle: copy_js_1.COPY.issuesTitle,
        causesTitle: copy_js_1.COPY.causesTitle,
        causesNote: copy_js_1.COPY.causesNote,
        exercisesTitle: copy_js_1.COPY.exercisesTitle,
        sessionNote: copy_js_1.COPY.sessionNote,
        againLabel: copy_js_1.COPY.again,
        shareLabel: copy_js_1.COPY.shareSave,
        shareHint: copy_js_1.COPY.shareHint,
        shareSavingLabel: copy_js_1.COPY.shareSaving,
        issues: report.issues.map((issue) => ({
            title: issue.title,
            detail: issue.detail,
            severityLabel: severityLabel(issue.severity),
        })),
        causes: report.causeGuesses.map((cause) => ({
            guess: cause.guess,
            related: cause.relatedIssueTitle ? `${copy_js_1.COPY.relatedPrefix}：${cause.relatedIssueTitle}` : "",
        })),
        exercises: report.exerciseSuggestions.map((exercise, index) => ({
            key: `${index + 1}-${exercise.name}`,
            index: index + 1,
            name: exercise.name,
            instruction: exercise.instruction,
            addresses: exercise.addresses ? `${copy_js_1.COPY.addressesPrefix}：${exercise.addresses}` : "",
        })),
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
function slotView(state, view, needsRetake) {
    const shot = view === "front" ? state.front : state.side;
    const filled = shot !== null;
    return {
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
function retakeView(guidance) {
    return {
        title: copy_js_1.COPY.retakeTitle,
        lead: copy_js_1.COPY.retakeLead,
        summary: guidance.summary,
        checklistTitle: copy_js_1.COPY.checklistTitle,
        checklist: guidance.checklist.slice(),
        shots: guidance.shots.map((shot) => ({
            label: shot.view === "front" ? copy_js_1.COPY.frontLabel : copy_js_1.COPY.sideLabel,
            messages: shot.messages.slice(),
        })),
    };
}
