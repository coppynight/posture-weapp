"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHARE_SAVE_API = exports.SHARE_CARD_HEIGHT = exports.SHARE_CARD_WIDTH = void 0;
exports.estimateTextWidth = estimateTextWidth;
exports.layoutShareCard = layoutShareCard;
exports.paintShareCard = paintShareCard;
exports.saveShareCard = saveShareCard;
const copy_js_1 = require("./copy.js");
const present_js_1 = require("./present.js");
/** Portrait poster. 750 matches the mini program design width; 1334 is a phone-screen height that stays readable in an album and in a WeChat chat. */
exports.SHARE_CARD_WIDTH = 750;
exports.SHARE_CARD_HEIGHT = 1334;
/**
 * Primary path: save the poster into the phone album, then the guest forwards that image in WeChat.
 * The page keeps the mini program card share hidden because the report exists only for this visit.
 */
exports.SHARE_SAVE_API = "saveImageToPhotosAlbum";
const BACKGROUND = "#f3efe6";
const BAND = "#3f2a1d";
const BAND_INK = "#fff8ee";
const PANEL = "#fffdf8";
const INK = "#1c1915";
const MUTED = "#3f3428";
const ACCENT = "#0f6e56";
const ACCENT_INK = "#f7fffb";
const PAD = 36;
const CONTENT_WIDTH = exports.SHARE_CARD_WIDTH - PAD * 2;
const BOTTOM_GAP = 28;
const ATTEMPTS = [
    { detailLines: 3, tipLines: 2, showOthers: true },
    { detailLines: 2, tipLines: 2, showOthers: true },
    { detailLines: 2, tipLines: 1, showOthers: true },
    { detailLines: 1, tipLines: 1, showOthers: false },
    { detailLines: 1, tipLines: 0, showOthers: false },
];
const SEVERITY_RANK = { mild: 1, moderate: 2, marked: 3 };
/** Full-width CJK metrics. Device fonts are at most this wide, so wrapped lines stay inside the poster. */
function estimateTextWidth(text, fontSize, _weight) {
    var _a;
    let width = 0;
    for (const char of text) {
        const code = (_a = char.codePointAt(0)) !== null && _a !== void 0 ? _a : 0;
        if (code <= 0x20)
            width += fontSize * 0.33;
        else if (code < 0x80)
            width += fontSize * 0.56;
        else
            width += fontSize;
    }
    return width;
}
function layoutShareCard(report, measure = estimateTextWidth) {
    if (!isPaintable(report))
        return null;
    for (const attempt of ATTEMPTS) {
        const layout = compose(report, measure, attempt);
        if (layout && fits(layout, measure))
            return layout;
    }
    return null;
}
function paintShareCard(ctx, layout) {
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (const block of layout.blocks) {
        ctx.fillStyle = block.color;
        ctx.fillRect(block.x, block.y, block.width, block.height);
    }
    for (const line of layout.lines) {
        ctx.fillStyle = line.color;
        ctx.font = line.weight === "bold" ? `bold ${line.fontSize}px sans-serif` : `${line.fontSize}px sans-serif`;
        ctx.fillText(line.text, line.x, line.y);
    }
}
/**
 * Draw the poster, hand the temp image to the album, then delete the temp file.
 * `hold` stays set across the album prompt so a system sheet does not wipe the session.
 */
async function saveShareCard(report, deps) {
    const layout = layoutShareCard(report);
    if (!layout) {
        deps.notify("invalid");
        return "invalid";
    }
    deps.hold(true);
    let temp = null;
    try {
        temp = await deps.paintAndExport(layout);
        if (!temp) {
            deps.notify("failed");
            return "failed";
        }
        const outcome = await deps.saveToAlbum(temp);
        if (outcome === "saved") {
            deps.notify("saved");
            return "saved";
        }
        if (outcome === "denied") {
            const open = await deps.confirmOpenSettings();
            if (open)
                await deps.openSettings();
            else
                deps.notify("failed");
            return "denied";
        }
        deps.notify("failed");
        return "failed";
    }
    catch (_a) {
        deps.notify("failed");
        return "failed";
    }
    finally {
        if (temp)
            deps.unlink(temp);
        deps.hold(false);
    }
}
function isPaintable(report) {
    if (!report || report.schemaVersion !== 1)
        return false;
    if (typeof report.disclaimer !== "string" || report.disclaimer.trim() === "")
        return false;
    if (!Array.isArray(report.issues) || report.issues.length === 0)
        return false;
    if (!Array.isArray(report.causeGuesses) || report.causeGuesses.length === 0)
        return false;
    if (!Array.isArray(report.exerciseSuggestions))
        return false;
    const count = report.exerciseSuggestions.length;
    if (count < 3 || count > 5)
        return false;
    for (const issue of report.issues) {
        if (!issue || typeof issue.title !== "string" || issue.title.trim() === "")
            return false;
        if (typeof issue.detail !== "string" || issue.detail.trim() === "")
            return false;
    }
    for (const exercise of report.exerciseSuggestions) {
        if (!exercise || typeof exercise.name !== "string" || exercise.name.trim() === "")
            return false;
        if (typeof exercise.instruction !== "string" || exercise.instruction.trim() === "")
            return false;
    }
    return true;
}
function compose(report, measure, attempt) {
    const lead = leadIssue(report.issues);
    if (!lead)
        return null;
    const blocks = [
        { role: "background", x: 0, y: 0, width: exports.SHARE_CARD_WIDTH, height: exports.SHARE_CARD_HEIGHT, color: BACKGROUND },
    ];
    const lines = [];
    const bandHeight = paintDisclaimer(blocks, lines, report.disclaimer, measure);
    if (bandHeight === null)
        return null;
    let cursor = bandHeight + 28;
    cursor = placeText(lines, "title", copy_js_1.COPY.shareTitle, PAD, cursor, 40, "bold", INK, CONTENT_WIDTH, null, measure);
    cursor += 8;
    cursor = placeText(lines, "section", copy_js_1.COPY.shareLead, PAD, cursor, 26, "bold", ACCENT, CONTENT_WIDTH, null, measure);
    cursor += 8;
    cursor = paintLead(blocks, lines, lead, report.issues, attempt, cursor, measure);
    cursor += 16;
    cursor = placeText(lines, "section", copy_js_1.COPY.shareExercises, PAD, cursor, 26, "bold", ACCENT, CONTENT_WIDTH, null, measure);
    cursor += 8;
    report.exerciseSuggestions.forEach((exercise, index) => {
        cursor = paintExercise(blocks, lines, exercise, index + 1, attempt.tipLines, cursor, measure);
    });
    cursor += 8;
    placeText(lines, "footer", copy_js_1.COPY.shareFooter, PAD, cursor, 24, "normal", MUTED, CONTENT_WIDTH, null, measure);
    return { width: exports.SHARE_CARD_WIDTH, height: exports.SHARE_CARD_HEIGHT, blocks, lines };
}
function paintDisclaimer(blocks, lines, disclaimer, measure) {
    const bodySize = 28;
    const headingSize = 42;
    const body = wrapText(disclaimer, CONTENT_WIDTH, bodySize, "normal", measure, null);
    if (body.join("") !== disclaimer.replace(/\n/g, ""))
        return null;
    const top = 32;
    const headingY = top;
    const bodyY = headingY + lineHeight(headingSize) + 12;
    const bandHeight = bodyY + body.length * lineHeight(bodySize) + 32;
    if (bandHeight > exports.SHARE_CARD_HEIGHT * 0.5)
        return null;
    blocks.push({ role: "disclaimer", x: 0, y: 0, width: exports.SHARE_CARD_WIDTH, height: bandHeight, color: BAND });
    placeText(lines, "disclaimerHeading", copy_js_1.COPY.disclaimerHeading, PAD, headingY, headingSize, "bold", BAND_INK, CONTENT_WIDTH, null, measure);
    body.forEach((text, index) => {
        lines.push({
            role: "disclaimer",
            text,
            x: PAD,
            y: bodyY + index * lineHeight(bodySize),
            fontSize: bodySize,
            weight: "normal",
            color: BAND_INK,
        });
    });
    return bandHeight;
}
function paintLead(blocks, lines, lead, issues, attempt, cursor, measure) {
    const panel = openPanel(blocks, cursor);
    let inner = cursor + 18;
    const textX = PAD + 18;
    const textWidth = CONTENT_WIDTH - 36;
    inner = placeText(lines, "leadTitle", lead.title.trim(), textX, inner, 34, "bold", INK, textWidth, null, measure);
    const severity = (0, present_js_1.severityLabel)(lead.severity);
    if (severity) {
        inner += 4;
        inner = placeText(lines, "severity", severity, textX, inner, 24, "bold", ACCENT, textWidth, 1, measure);
    }
    inner += 6;
    inner = placeText(lines, "leadDetail", lead.detail.trim(), textX, inner, 26, "normal", MUTED, textWidth, attempt.detailLines, measure);
    const others = issues.filter((issue) => issue !== lead).map((issue) => issue.title.trim());
    if (attempt.showOthers && others.length > 0) {
        inner += 8;
        inner = placeText(lines, "otherIssues", `${copy_js_1.COPY.shareAlso}：${others.join("、")}`, textX, inner, 24, "normal", INK, textWidth, 2, measure);
    }
    return closePanel(panel, inner, cursor);
}
function paintExercise(blocks, lines, exercise, index, tipLines, cursor, measure) {
    const panel = openPanel(blocks, cursor);
    const badgeSize = 36;
    const innerLeft = PAD + 16;
    const badgeY = cursor + 16;
    blocks.push({ role: "badge", x: innerLeft, y: badgeY, width: badgeSize, height: badgeSize, color: ACCENT });
    const indexText = String(index);
    const indexSize = 22;
    const indexWidth = measure(indexText, indexSize, "bold");
    lines.push({
        role: "exerciseIndex",
        text: indexText,
        x: innerLeft + (badgeSize - indexWidth) / 2,
        y: badgeY + (badgeSize - indexSize) / 2,
        fontSize: indexSize,
        weight: "bold",
        color: ACCENT_INK,
    });
    const nameX = innerLeft + badgeSize + 12;
    const nameWidth = PAD + CONTENT_WIDTH - 16 - nameX;
    let inner = placeText(lines, "exerciseName", exercise.name.trim(), nameX, badgeY, 28, "bold", INK, nameWidth, null, measure);
    if (tipLines > 0) {
        inner += 4;
        inner = placeText(lines, "exerciseTip", exercise.instruction.trim(), nameX, inner, 24, "normal", MUTED, nameWidth, tipLines, measure);
    }
    const contentBottom = Math.max(inner, badgeY + badgeSize);
    return closePanel(panel, contentBottom, cursor) + 12;
}
function openPanel(blocks, cursor) {
    const panel = { role: "panel", x: PAD, y: cursor, width: CONTENT_WIDTH, height: 0, color: PANEL };
    blocks.push(panel);
    return panel;
}
function closePanel(panel, contentBottom, cursor) {
    const bottom = contentBottom + 16;
    panel.height = bottom - cursor;
    return bottom;
}
function placeText(lines, role, text, x, y, fontSize, weight, color, maxWidth, maxLines, measure) {
    const wrapped = wrapText(text, maxWidth, fontSize, weight, measure, maxLines);
    const step = lineHeight(fontSize);
    wrapped.forEach((row, index) => {
        lines.push({ role, text: row, x, y: y + index * step, fontSize, weight, color });
    });
    return y + wrapped.length * step;
}
function fits(layout, measure) {
    return layout.lines.every((line) => {
        if (line.text === "")
            return false;
        if (line.x < 24 || line.y < 0)
            return false;
        if (line.y + line.fontSize > exports.SHARE_CARD_HEIGHT - BOTTOM_GAP)
            return false;
        return line.x + measure(line.text, line.fontSize, line.weight) <= exports.SHARE_CARD_WIDTH - 24;
    });
}
function leadIssue(issues) {
    var _a, _b;
    let best = null;
    for (const issue of issues) {
        if (!best || ((_a = SEVERITY_RANK[issue.severity]) !== null && _a !== void 0 ? _a : 0) > ((_b = SEVERITY_RANK[best.severity]) !== null && _b !== void 0 ? _b : 0))
            best = issue;
    }
    return best;
}
function lineHeight(fontSize) {
    return Math.ceil(fontSize * 1.35);
}
function wrapText(text, maxWidth, fontSize, weight, measure, maxLines) {
    const lines = [];
    let current = "";
    for (const char of text) {
        if (char === "\n") {
            if (current !== "")
                lines.push(current);
            current = "";
            continue;
        }
        const next = current + char;
        if (current !== "" && measure(next, fontSize, weight) > maxWidth) {
            lines.push(current);
            current = char;
        }
        else {
            current = next;
        }
    }
    if (current !== "")
        lines.push(current);
    if (lines.length === 0)
        return [];
    if (maxLines === null || lines.length <= maxLines)
        return lines;
    const head = lines.slice(0, maxLines - 1);
    const rest = lines.slice(maxLines - 1).join("");
    head.push(ellipsize(rest, maxWidth, fontSize, weight, measure));
    return head;
}
function ellipsize(text, maxWidth, fontSize, weight, measure) {
    const mark = "…";
    if (measure(text, fontSize, weight) <= maxWidth)
        return text;
    let kept = "";
    for (const char of text) {
        const next = kept + char;
        if (measure(next + mark, fontSize, weight) > maxWidth)
            break;
        kept = next;
    }
    return `${kept}${mark}`;
}
