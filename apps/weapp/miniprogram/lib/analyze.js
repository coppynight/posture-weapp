"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeUrl = analyzeUrl;
exports.createFetchTransport = createFetchTransport;
exports.analyzePhotos = analyzePhotos;
exports.interpretAnalyzeResponse = interpretAnalyzeResponse;
const copy_js_1 = require("./copy.js");
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** Join the configurable API origin with the T2 analyze path. */
function analyzeUrl(baseUrl) {
    const trimmed = baseUrl.trim().replace(/\/+$/, "");
    if (!/^https?:\/\/[^/\s]+/i.test(trimmed)) {
        throw new Error("bad base url");
    }
    return `${trimmed}/v1/analyze`;
}
function createFetchTransport(fetchImpl) {
    return {
        async postJson(url, body) {
            const response = await fetchImpl(url, {
                method: "POST",
                headers: {
                    accept: "application/json",
                    "content-type": "application/json",
                    "cache-control": "no-store",
                },
                body: JSON.stringify(body),
            });
            return { status: response.status, text: await response.text() };
        },
    };
}
/**
 * Send both photos to T2 and classify the JSON.
 * This does not score posture. A missing photo is rejected before the call.
 */
async function analyzePhotos(transport, baseUrl, front, side) {
    if (!isPayload(front) || !isPayload(side)) {
        return { kind: "error", message: copy_js_1.COPY.readFail };
    }
    let url;
    try {
        url = analyzeUrl(baseUrl);
    }
    catch (_a) {
        return { kind: "error", message: copy_js_1.COPY.badBaseUrl };
    }
    const body = {
        front: { mediaType: front.mediaType, dataBase64: front.dataBase64 },
        side: { mediaType: side.mediaType, dataBase64: side.dataBase64 },
    };
    try {
        const response = await transport.postJson(url, body);
        return interpretAnalyzeResponse(response.status, response.text);
    }
    catch (_b) {
        return { kind: "error", message: copy_js_1.COPY.network };
    }
}
function interpretAnalyzeResponse(status, text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch (_a) {
        return { kind: "error", message: copy_js_1.COPY.badResponse };
    }
    if (!isRecord(parsed))
        return { kind: "error", message: copy_js_1.COPY.badResponse };
    const report = readReport(parsed.report);
    const retake = readRetake(parsed.retakeGuidance);
    if (report && retake)
        return { kind: "error", message: copy_js_1.COPY.badResponse };
    if (status === 200 && report)
        return { kind: "report", report };
    if ((status === 200 || status === 400 || status === 422) && retake) {
        return { kind: "retake", retakeGuidance: retake };
    }
    if (status === 200 && isRecord(parsed.report) && !hasDisclaimer(parsed.report)) {
        return { kind: "error", message: copy_js_1.COPY.missingDisclaimer };
    }
    const message = readServerMessage(parsed.message);
    if (message)
        return { kind: "error", message };
    return { kind: "error", message: copy_js_1.COPY.genericFailure };
}
function isPayload(photo) {
    return MEDIA_TYPES.includes(photo.mediaType) && photo.dataBase64.trim() !== "";
}
/**
 * Enough structure to render the page. Limits, enums, and wording rules stay on the server.
 */
function readReport(value) {
    if (!isRecord(value) || !hasDisclaimer(value))
        return null;
    if (!Array.isArray(value.issues) || !Array.isArray(value.causeGuesses) || !Array.isArray(value.exerciseSuggestions)) {
        return null;
    }
    return {
        schemaVersion: 1,
        disclaimer: value.disclaimer,
        issues: value.issues,
        causeGuesses: value.causeGuesses,
        exerciseSuggestions: value.exerciseSuggestions,
    };
}
function readRetake(value) {
    if (!isRecord(value))
        return null;
    if (typeof value.summary !== "string" || value.summary.trim() === "")
        return null;
    if (!Array.isArray(value.shots) || !Array.isArray(value.checklist))
        return null;
    return {
        schemaVersion: 1,
        code: value.code,
        summary: value.summary,
        shots: value.shots,
        checklist: value.checklist,
    };
}
function hasDisclaimer(value) {
    return typeof value.disclaimer === "string" && value.disclaimer.trim() !== "";
}
function readServerMessage(value) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
