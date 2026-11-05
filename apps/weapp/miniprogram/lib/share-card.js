"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHARE_SAVE_API = exports.SHARE_CARD_HEIGHT = exports.SHARE_CARD_WIDTH = void 0;
exports.estimateTextWidth = estimateTextWidth;
exports.layoutShareCard = layoutShareCard;
exports.paintShareCard = paintShareCard;
exports.saveShareCard = saveShareCard;
const copy_js_1 = require("./copy.js");
const present_js_1 = require("./present.js");
const theme_js_1 = require("./theme.js");
/** Portrait poster. 750 matches the mini program design width; 1334 is a phone-screen height that stays readable in an album and in a WeChat chat. */
exports.SHARE_CARD_WIDTH = 750;
exports.SHARE_CARD_HEIGHT = 1334;
/**
 * Primary path: save the poster into the phone album, then the guest forwards that image in WeChat.
 * The page keeps the mini program card share hidden because the report exists only for this visit.
 */
exports.SHARE_SAVE_API = "saveImageToPhotosAlbum";
const BACKGROUND = theme_js_1.theme.color.bg;
const BAND = theme_js_1.theme.color.primarySoft;
const BAND_HEADING = theme_js_1.theme.color.primaryInk;
const BAND_INK = theme_js_1.theme.color.ink;
const PANEL = theme_js_1.theme.color.surface;
const INK = theme_js_1.theme.color.ink;
const SECONDARY = theme_js_1.theme.color.inkSecondary;
const ACCENT = theme_js_1.theme.color.primaryInk;
const BADGE = theme_js_1.theme.color.primary;
const BADGE_INK = theme_js_1.theme.color.onPrimary;
const PAD = 36;
const CONTENT_WIDTH = exports.SHARE_CARD_WIDTH - PAD * 2;
const BOTTOM_GAP = 28;
const ATTEMPTS = [
    { detailLines: 3, tipLines: 2, showOthers: true, showCounts: true },
    { detailLines: 2, tipLines: 2, showOthers: true, showCounts: true },
    { detailLines: 2, tipLines: 1, showOthers: true, showCounts: true },
    { detailLines: 1, tipLines: 1, showOthers: true, showCounts: false },
    { detailLines: 1, tipLines: 1, showOthers: false, showCounts: false },
    { detailLines: 1, tipLines: 0, showOthers: false, showCounts: false },
];
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
    var _a;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (const block of layout.blocks) {
        ctx.fillStyle = block.color;
        const radius = (_a = block.radius) !== null && _a !== void 0 ? _a : 0;
        if (radius > 0)
            fillRoundRect(ctx, block.x, block.y, block.width, block.height, radius);
        else
            ctx.fillRect(block.x, block.y, block.width, block.height);
    }
    for (const line of layout.lines) {
        ctx.fillStyle = line.color;
        ctx.font = line.weight === "bold" ? `bold ${line.fontSize}px sans-serif` : `${line.fontSize}px sans-serif`;
        ctx.fillText(line.text, line.x, line.y);
    }
}
function fillRoundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
    ctx.fill();
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
/** Display gate only. Count, version, and unused fields stay on the T1 report contract. */
function isPaintable(report) {
    if (!report || typeof report.disclaimer !== "string" || report.disclaimer.trim() === "")
        return false;
    if (!(0, present_js_1.primaryIssue)(report.issues))
        return false;
    if (!Array.isArray(report.exerciseSuggestions))
        return false;
    return report.exerciseSuggestions.every((exercise) => {
        if (!exercise)
            return false;
        return drawnText(exercise.name) !== "" && drawnText(exercise.instruction) !== "";
    });
}
function drawnText(value) {
    return typeof value === "string" ? value.trim() : "";
}
function compose(report, measure, attempt) {
    const lead = (0, present_js_1.primaryIssue)(report.issues);
    if (!lead)
        return null;
    const blocks = [
        { role: "background", x: 0, y: 0, width: exports.SHARE_CARD_WIDTH, height: exports.SHARE_CARD_HEIGHT, color: BACKGROUND },
    ];
    const lines = [];
    const bandHeight = paintDisclaimer(blocks, lines, report.disclaimer, measure);
    if (bandHeight === null)
        return null;
    let cursor = bandHeight + 16;
    cursor = placeText(lines, "title", copy_js_1.COPY.shareTitle, PAD, cursor, theme_js_1.theme.type.posterTitle, "bold", INK, CONTENT_WIDTH, null, measure);
    cursor += 8;
    cursor = paintOverviewLead(lines, lead, report, attempt, cursor, measure);
    cursor += 14;
    cursor = placeText(lines, "section", copy_js_1.COPY.sectionProblem, PAD, cursor, theme_js_1.theme.type.subhead, "bold", ACCENT, CONTENT_WIDTH, null, measure);
    cursor += 8;
    cursor = paintLead(blocks, lines, lead, report.issues, attempt, cursor, measure);
    cursor += 12;
    cursor = placeText(lines, "section", copy_js_1.COPY.sectionAction, PAD, cursor, theme_js_1.theme.type.subhead, "bold", ACCENT, CONTENT_WIDTH, null, measure);
    cursor += 8;
    report.exerciseSuggestions.forEach((exercise, index) => {
        cursor = paintExercise(blocks, lines, exercise, index + 1, attempt.tipLines, cursor, measure);
    });
    cursor += 8;
    placeText(lines, "footer", copy_js_1.COPY.shareFooter, PAD, cursor, theme_js_1.theme.type.caption, "normal", SECONDARY, CONTENT_WIDTH, null, measure);
    return { width: exports.SHARE_CARD_WIDTH, height: exports.SHARE_CARD_HEIGHT, blocks, lines };
}
function paintDisclaimer(blocks, lines, disclaimer, measure) {
    const sectionSize = theme_js_1.theme.type.subhead;
    const bodySize = theme_js_1.theme.type.reading;
    const headingSize = theme_js_1.theme.type.display;
    const body = wrapText(disclaimer, CONTENT_WIDTH, bodySize, "normal", measure, null);
    if (body.join("") !== disclaimer.replace(/\n/g, ""))
        return null;
    const top = 28;
    const sectionY = top;
    const headingY = sectionY + lineHeight(sectionSize) + 8;
    const bodyY = headingY + lineHeight(headingSize) + 12;
    const bandHeight = bodyY + body.length * lineHeight(bodySize) + 24;
    if (bandHeight > exports.SHARE_CARD_HEIGHT * 0.5)
        return null;
    blocks.push({ role: "disclaimer", x: 0, y: 0, width: exports.SHARE_CARD_WIDTH, height: bandHeight, color: BAND });
    placeText(lines, "section", copy_js_1.COPY.sectionOverview, PAD, sectionY, sectionSize, "bold", BAND_HEADING, CONTENT_WIDTH, null, measure);
    placeText(lines, "disclaimerHeading", copy_js_1.COPY.disclaimerHeading, PAD, headingY, headingSize, "bold", BAND_HEADING, CONTENT_WIDTH, null, measure);
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
function paintOverviewLead(lines, lead, report, attempt, cursor, measure) {
    const title = drawnText(lead.title);
    const titleSize = theme_js_1.theme.type.section;
    const severity = (0, present_js_1.severityLabel)(lead.severity);
    const severitySize = theme_js_1.theme.type.caption;
    const titleWidth = measure(title, titleSize, "bold");
    const severityWidth = severity ? measure(severity, severitySize, "bold") : 0;
    const gap = 16;
    if (severity && titleWidth + gap + severityWidth <= CONTENT_WIDTH) {
        lines.push({ role: "overviewIssue", text: title, x: PAD, y: cursor, fontSize: titleSize, weight: "bold", color: INK });
        lines.push({
            role: "overviewSeverity",
            text: severity,
            x: PAD + titleWidth + gap,
            y: cursor + Math.max(0, (lineHeight(titleSize) - lineHeight(severitySize)) / 2),
            fontSize: severitySize,
            weight: "bold",
            color: ACCENT,
        });
        cursor += lineHeight(titleSize);
    }
    else {
        cursor = placeText(lines, "overviewIssue", title, PAD, cursor, titleSize, "bold", INK, CONTENT_WIDTH, null, measure);
        if (severity) {
            cursor += 4;
            cursor = placeText(lines, "overviewSeverity", severity, PAD, cursor, severitySize, "bold", ACCENT, CONTENT_WIDTH, 1, measure);
        }
    }
    if (attempt.showCounts) {
        cursor += 6;
        cursor = placeText(lines, "overviewCounts", (0, present_js_1.sectionCountLine)(report.issues.length, report.exerciseSuggestions.length), PAD, cursor, theme_js_1.theme.type.caption, "normal", SECONDARY, CONTENT_WIDTH, 1, measure);
    }
    return cursor;
}
function paintLead(blocks, lines, lead, issues, attempt, cursor, measure) {
    const panel = openPanel(blocks, cursor);
    let inner = cursor + 18;
    const textX = PAD + 18;
    const textWidth = CONTENT_WIDTH - 36;
    inner = placeText(lines, "leadTitle", drawnText(lead.title), textX, inner, theme_js_1.theme.type.section, "bold", INK, textWidth, null, measure);
    const severity = (0, present_js_1.severityLabel)(lead.severity);
    if (severity) {
        inner += 4;
        inner = placeText(lines, "severity", severity, textX, inner, theme_js_1.theme.type.caption, "bold", ACCENT, textWidth, 1, measure);
    }
    const detail = drawnText(lead.detail);
    if (detail) {
        inner += 6;
        inner = placeText(lines, "leadDetail", detail, textX, inner, theme_js_1.theme.type.subhead, "normal", SECONDARY, textWidth, attempt.detailLines, measure);
    }
    const others = issues.filter((issue) => issue !== lead).map((issue) => drawnText(issue.title)).filter((title) => title !== "");
    if (attempt.showOthers && others.length > 0) {
        inner += 8;
        inner = placeText(lines, "otherIssues", `${copy_js_1.COPY.shareAlso}：${others.join("、")}`, textX, inner, theme_js_1.theme.type.caption, "normal", INK, textWidth, 2, measure);
    }
    return closePanel(panel, inner, cursor);
}
function paintExercise(blocks, lines, exercise, index, tipLines, cursor, measure) {
    const panel = openPanel(blocks, cursor);
    const badgeSize = theme_js_1.theme.radius.badge * 2;
    const innerLeft = PAD + 16;
    const badgeY = cursor + 12;
    blocks.push({
        role: "badge",
        x: innerLeft,
        y: badgeY,
        width: badgeSize,
        height: badgeSize,
        color: BADGE,
        radius: theme_js_1.theme.radius.badge,
    });
    const indexText = String(index);
    const indexSize = theme_js_1.theme.type.index;
    const indexWidth = measure(indexText, indexSize, "bold");
    lines.push({
        role: "exerciseIndex",
        text: indexText,
        x: innerLeft + (badgeSize - indexWidth) / 2,
        y: badgeY + (badgeSize - indexSize) / 2,
        fontSize: indexSize,
        weight: "bold",
        color: BADGE_INK,
    });
    const nameX = innerLeft + badgeSize + 12;
    const nameWidth = PAD + CONTENT_WIDTH - 16 - nameX;
    let inner = placeText(lines, "exerciseName", drawnText(exercise.name), nameX, badgeY, theme_js_1.theme.type.reading, "bold", INK, nameWidth, null, measure);
    if (tipLines > 0) {
        inner += 4;
        inner = placeText(lines, "exerciseTip", drawnText(exercise.instruction), nameX, inner, theme_js_1.theme.type.caption, "normal", SECONDARY, nameWidth, tipLines, measure);
    }
    const contentBottom = Math.max(inner, badgeY + badgeSize);
    return closePanel(panel, contentBottom, cursor) + 8;
}
function openPanel(blocks, cursor) {
    const panel = {
        role: "panel",
        x: PAD,
        y: cursor,
        width: CONTENT_WIDTH,
        height: 0,
        color: PANEL,
        radius: theme_js_1.theme.radius.card,
    };
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
