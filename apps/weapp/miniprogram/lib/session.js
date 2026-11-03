"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emptySessionState = emptySessionState;
exports.createSessionStore = createSessionStore;
const copy_js_1 = require("./copy.js");
function emptySessionState() {
    return {
        front: null,
        side: null,
        report: null,
        retakeGuidance: null,
        notice: null,
        submitting: false,
        pickerOpen: false,
        sheetOpen: false,
    };
}
function createSessionStore() {
    let state = emptySessionState();
    let generation = 0;
    function paths() {
        return {
            frontPath: state.front ? state.front.tempFilePath : null,
            sidePath: state.side ? state.side.tempFilePath : null,
        };
    }
    function wipe(notice) {
        const removed = paths();
        generation += 1;
        state = emptySessionState();
        state.notice = notice;
        return removed;
    }
    function slot(view) {
        return view === "front" ? state.front : state.side;
    }
    return {
        generation() {
            return generation;
        },
        get() {
            return {
                front: state.front ? { ...state.front } : null,
                side: state.side ? { ...state.side } : null,
                report: state.report,
                retakeGuidance: state.retakeGuidance,
                notice: state.notice,
                submitting: state.submitting,
                pickerOpen: state.pickerOpen,
                sheetOpen: state.sheetOpen,
            };
        },
        replaceShot(shot) {
            const previous = slot(shot.view);
            const stored = {
                view: shot.view,
                tempFilePath: shot.tempFilePath,
                mediaType: shot.mediaType,
            };
            if (shot.view === "front")
                state.front = stored;
            else
                state.side = stored;
            state.notice = null;
            state.retakeGuidance = null;
            if (!previous || previous.tempFilePath === shot.tempFilePath)
                return null;
            return previous.tempFilePath;
        },
        removeShot(view) {
            const previous = slot(view);
            if (view === "front")
                state.front = null;
            else
                state.side = null;
            state.retakeGuidance = null;
            return previous ? previous.tempFilePath : null;
        },
        setNotice(message) {
            state.notice = message;
        },
        setSubmitting(value) {
            state.submitting = value;
        },
        setReport(report) {
            state.report = report;
            state.retakeGuidance = null;
            state.notice = null;
        },
        setRetake(guidance) {
            state.retakeGuidance = guidance;
            state.report = null;
            state.notice = null;
        },
        clearReport() {
            state.report = null;
        },
        clearShots() {
            const removed = paths();
            state.front = null;
            state.side = null;
            return removed;
        },
        markPicker(open) {
            state.pickerOpen = open;
        },
        holdSession(open) {
            state.sheetOpen = open;
        },
        clear() {
            return wipe(null);
        },
        onAppHide() {
            if (state.pickerOpen || state.sheetOpen) {
                return { cleared: false, frontPath: null, sidePath: null };
            }
            const hadContent = state.front !== null || state.side !== null || state.report !== null || state.retakeGuidance !== null;
            const removed = wipe(hadContent ? copy_js_1.COPY.sessionEnded : null);
            return { cleared: true, frontPath: removed.frontPath, sidePath: removed.sidePath };
        },
    };
}
