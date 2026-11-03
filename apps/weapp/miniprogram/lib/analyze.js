"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeUrl = analyzeUrl;
exports.createFetchTransport = createFetchTransport;
exports.analyzePhotos = analyzePhotos;
exports.interpretAnalyzeResponse = interpretAnalyzeResponse;
const copy_js_1 = require("./copy.js");
const SEVERITIES = ["mild", "moderate", "marked"];
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
    if (status === 200 && isRecord(parsed.report) && report === null && retake === null) {
        if (typeof parsed.report.disclaimer !== "string" || parsed.report.disclaimer.trim() === "") {
            return { kind: "error", message: copy_js_1.COPY.missingDisclaimer };
        }
    }
    if (status === 200 && report)
        return { kind: "report", report };
    if ((status === 200 || status === 400 || status === 422) && retake) {
        return { kind: "retake", retakeGuidance: retake };
    }
    const message = readServerMessage(parsed.message);
    if (message)
        return { kind: "error", message };
    return { kind: "error", message: copy_js_1.COPY.genericFailure };
}
function isPayload(photo) {
    return MEDIA_TYPES.includes(photo.mediaType) && photo.dataBase64.trim() !== "";
}
function readReport(value) {
    if (!isRecord(value) || value.schemaVersion !== 1)
        return null;
    if (typeof value.disclaimer !== "string" || value.disclaimer.trim() === "")
        return null;
    const issues = readIssues(value.issues);
    const causeGuesses = readCauses(value.causeGuesses);
    const exerciseSuggestions = readExercises(value.exerciseSuggestions);
    if (!issues || !causeGuesses || !exerciseSuggestions)
        return null;
    return {
        schemaVersion: 1,
        issues,
        causeGuesses,
        exerciseSuggestions,
        disclaimer: value.disclaimer.trim(),
    };
}
function readRetake(value) {
    if (!isRecord(value) || value.schemaVersion !== 1)
        return null;
    if (value.code !== "missing_image" && value.code !== "poor_quality")
        return null;
    if (typeof value.summary !== "string" || value.summary.trim() === "")
        return null;
    if ("issues" in value || "causeGuesses" in value || "exerciseSuggestions" in value || "disclaimer" in value) {
        return null;
    }
    const shots = readRetakeShots(value.shots);
    const checklist = readChecklist(value.checklist);
    if (!shots || !checklist)
        return null;
    return {
        schemaVersion: 1,
        code: value.code,
        summary: value.summary.trim(),
        shots,
        checklist,
    };
}
function readIssues(value) {
    if (!Array.isArray(value) || value.length === 0)
        return null;
    const issues = [];
    for (const item of value) {
        if (!isRecord(item))
            return null;
        if (typeof item.title !== "string" || item.title.trim() === "")
            return null;
        if (typeof item.detail !== "string" || item.detail.trim() === "")
            return null;
        if (!SEVERITIES.includes(item.severity))
            return null;
        issues.push({
            title: item.title.trim(),
            detail: item.detail.trim(),
            severity: item.severity,
        });
    }
    return issues;
}
function readCauses(value) {
    if (!Array.isArray(value) || value.length === 0)
        return null;
    const causes = [];
    for (const item of value) {
        if (!isRecord(item) || typeof item.guess !== "string" || item.guess.trim() === "")
            return null;
        const cause = { guess: item.guess.trim() };
        if (item.relatedIssueTitle !== undefined) {
            if (typeof item.relatedIssueTitle !== "string" || item.relatedIssueTitle.trim() === "")
                return null;
            cause.relatedIssueTitle = item.relatedIssueTitle.trim();
        }
        causes.push(cause);
    }
    return causes;
}
function readExercises(value) {
    if (!Array.isArray(value) || value.length === 0)
        return null;
    const exercises = [];
    for (const item of value) {
        if (!isRecord(item))
            return null;
        if (typeof item.name !== "string" || item.name.trim() === "")
            return null;
        if (typeof item.instruction !== "string" || item.instruction.trim() === "")
            return null;
        const exercise = {
            name: item.name.trim(),
            instruction: item.instruction.trim(),
        };
        if (item.addresses !== undefined) {
            if (typeof item.addresses !== "string" || item.addresses.trim() === "")
                return null;
            exercise.addresses = item.addresses.trim();
        }
        exercises.push(exercise);
    }
    return exercises;
}
function readRetakeShots(value) {
    if (!Array.isArray(value) || value.length === 0)
        return null;
    const shots = [];
    for (const item of value) {
        if (!isRecord(item))
            return null;
        if (item.view !== "front" && item.view !== "side")
            return null;
        if (item.problem !== "missing" && item.problem !== "poor_quality")
            return null;
        const reasons = readChecklist(item.reasons);
        const messages = readChecklist(item.messages);
        if (!reasons || !messages)
            return null;
        shots.push({ view: item.view, problem: item.problem, reasons, messages });
    }
    return shots;
}
function readChecklist(value) {
    if (!Array.isArray(value) || value.length === 0)
        return null;
    const lines = [];
    for (const item of value) {
        if (typeof item !== "string" || item.trim() === "")
            return null;
        lines.push(item.trim());
    }
    return lines;
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
