"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pickImage = pickImage;
exports.removeImage = removeImage;
exports.submitAnalysis = submitAnalysis;
exports.endSession = endSession;
const analyze_js_1 = require("./analyze.js");
const copy_js_1 = require("./copy.js");
const media_type_js_1 = require("./media-type.js");
const submit_js_1 = require("./submit.js");
async function pickImage(store, view, source, deps) {
    if (store.get().submitting)
        return;
    store.markPicker(true);
    try {
        const picked = await deps.choose(source);
        if (picked.status === "cancelled")
            return;
        if (picked.status === "failed") {
            store.setNotice(copy_js_1.COPY.pickerFail);
            return;
        }
        if (picked.tempFilePath.trim() === "") {
            store.setNotice(copy_js_1.COPY.emptyPick);
            return;
        }
        const mediaType = (0, media_type_js_1.mediaTypeFromPath)(picked.tempFilePath);
        if (!mediaType) {
            store.setNotice(copy_js_1.COPY.badType);
            return;
        }
        const previousPath = store.replaceShot({ view, tempFilePath: picked.tempFilePath, mediaType });
        deps.unlink(previousPath);
    }
    finally {
        store.markPicker(false);
    }
}
function removeImage(store, view, unlink) {
    if (store.get().submitting)
        return;
    unlink(store.removeShot(view));
}
/**
 * Read both temp files and call T2.
 * One missing photo sets a prompt and does not read or upload anything.
 * After a report, temp paths are dropped so the photos are not kept as an archive.
 */
async function submitAnalysis(store, deps) {
    const current = store.get();
    if (current.submitting)
        return "blocked";
    const decision = (0, submit_js_1.decideSubmit)(current.front, current.side);
    if (!decision.ok) {
        store.setNotice(decision.message);
        return "blocked";
    }
    const front = current.front;
    const side = current.side;
    if (!front || !side)
        return "blocked";
    const generation = store.generation();
    store.setSubmitting(true);
    store.setNotice(null);
    try {
        const frontPhoto = await deps.read(front);
        const sidePhoto = await deps.read(side);
        const outcome = await (0, analyze_js_1.analyzePhotos)(deps.transport, deps.baseUrl, frontPhoto, sidePhoto);
        if (store.generation() !== generation)
            return "blocked";
        if (outcome.kind === "report") {
            store.setReport(outcome.report);
            const removed = store.clearShots();
            deps.unlink(removed.frontPath);
            deps.unlink(removed.sidePath);
            deps.openReport();
            return "report";
        }
        if (outcome.kind === "retake") {
            store.setRetake(outcome.retakeGuidance);
            return "retake";
        }
        store.setNotice(outcome.message);
        return "error";
    }
    catch (_a) {
        if (store.generation() !== generation)
            return "blocked";
        store.setNotice(copy_js_1.COPY.readFail);
        return "error";
    }
    finally {
        if (store.generation() === generation)
            store.setSubmitting(false);
    }
}
function endSession(store, unlink) {
    const removed = store.clear();
    unlink(removed.frontPath);
    unlink(removed.sidePath);
}
