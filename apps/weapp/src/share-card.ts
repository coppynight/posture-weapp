import { COPY } from "./copy.js";
import { severityLabel } from "./present.js";
import { theme } from "./theme.js";
import type { ExerciseSuggestion, PostureIssue, Report } from "./types.js";

/** Portrait poster. 750 matches the mini program design width; 1334 is a phone-screen height that stays readable in an album and in a WeChat chat. */
export const SHARE_CARD_WIDTH = 750;
export const SHARE_CARD_HEIGHT = 1334;

/**
 * Primary path: save the poster into the phone album, then the guest forwards that image in WeChat.
 * The page keeps the mini program card share hidden because the report exists only for this visit.
 */
export const SHARE_SAVE_API = "saveImageToPhotosAlbum" as const;

const BACKGROUND = theme.color.bg;
const BAND = theme.color.primarySoft;
const BAND_HEADING = theme.color.primaryInk;
const BAND_INK = theme.color.inkSecondary;
const PANEL = theme.color.surface;
const INK = theme.color.ink;
const SECONDARY = theme.color.inkSecondary;
const ACCENT = theme.color.primaryInk;
const BADGE = theme.color.primary;
const BADGE_INK = theme.color.onPrimary;

const PAD = 36;
const CONTENT_WIDTH = SHARE_CARD_WIDTH - PAD * 2;
const BOTTOM_GAP = 28;

export type TextWeight = "normal" | "bold";

export type TextMeasure = (text: string, fontSize: number, weight: TextWeight) => number;

export type ShareBlockRole = "background" | "disclaimer" | "panel" | "badge";

export type ShareLineRole =
  | "disclaimerHeading"
  | "disclaimer"
  | "title"
  | "section"
  | "leadTitle"
  | "severity"
  | "leadDetail"
  | "otherIssues"
  | "exerciseIndex"
  | "exerciseName"
  | "exerciseTip"
  | "footer";

export interface ShareBlock {
  role: ShareBlockRole;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  /** Corner radius in poster pixels. Omitted on full-bleed fills. */
  radius?: number;
}

export interface ShareLine {
  role: ShareLineRole;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  weight: TextWeight;
  color: string;
}

export interface ShareCardLayout {
  width: number;
  height: number;
  blocks: ShareBlock[];
  lines: ShareLine[];
}

/** Subset of a 2d canvas context. WeChat's offscreen canvas and the page canvas both provide it. */
export interface ShareCanvas {
  fillStyle: string;
  font: string;
  textAlign: "left" | "right" | "center";
  textBaseline: "top" | "middle" | "alphabetic" | "bottom";
  fillRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  closePath(): void;
  fill(): void;
}

export interface ShareSaveDeps {
  paintAndExport(layout: ShareCardLayout): Promise<string | null>;
  saveToAlbum(filePath: string): Promise<"saved" | "denied" | "failed">;
  confirmOpenSettings(): Promise<boolean>;
  openSettings(): Promise<void>;
  unlink(filePath: string): void;
  hold(open: boolean): void;
  notify(kind: "saved" | "failed" | "invalid"): void;
}

interface Attempt {
  detailLines: number;
  tipLines: number;
  showOthers: boolean;
}

const ATTEMPTS: readonly Attempt[] = [
  { detailLines: 3, tipLines: 2, showOthers: true },
  { detailLines: 2, tipLines: 2, showOthers: true },
  { detailLines: 2, tipLines: 1, showOthers: true },
  { detailLines: 1, tipLines: 1, showOthers: false },
  { detailLines: 1, tipLines: 0, showOthers: false },
];

const SEVERITY_RANK: Record<string, number> = { mild: 1, moderate: 2, marked: 3 };

/** Full-width CJK metrics. Device fonts are at most this wide, so wrapped lines stay inside the poster. */
export function estimateTextWidth(text: string, fontSize: number, _weight: TextWeight): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x20) width += fontSize * 0.33;
    else if (code < 0x80) width += fontSize * 0.56;
    else width += fontSize;
  }
  return width;
}

export function layoutShareCard(report: Report, measure: TextMeasure = estimateTextWidth): ShareCardLayout | null {
  if (!isPaintable(report)) return null;
  for (const attempt of ATTEMPTS) {
    const layout = compose(report, measure, attempt);
    if (layout && fits(layout, measure)) return layout;
  }
  return null;
}

export function paintShareCard(ctx: ShareCanvas, layout: ShareCardLayout): void {
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (const block of layout.blocks) {
    ctx.fillStyle = block.color;
    const radius = block.radius ?? 0;
    if (radius > 0) fillRoundRect(ctx, block.x, block.y, block.width, block.height, radius);
    else ctx.fillRect(block.x, block.y, block.width, block.height);
  }
  for (const line of layout.lines) {
    ctx.fillStyle = line.color;
    ctx.font = line.weight === "bold" ? `bold ${line.fontSize}px sans-serif` : `${line.fontSize}px sans-serif`;
    ctx.fillText(line.text, line.x, line.y);
  }
}

function fillRoundRect(ctx: ShareCanvas, x: number, y: number, width: number, height: number, radius: number): void {
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
export async function saveShareCard(
  report: Report,
  deps: ShareSaveDeps,
): Promise<"saved" | "denied" | "failed" | "invalid"> {
  const layout = layoutShareCard(report);
  if (!layout) {
    deps.notify("invalid");
    return "invalid";
  }
  deps.hold(true);
  let temp: string | null = null;
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
      if (open) await deps.openSettings();
      else deps.notify("failed");
      return "denied";
    }
    deps.notify("failed");
    return "failed";
  } catch {
    deps.notify("failed");
    return "failed";
  } finally {
    if (temp) deps.unlink(temp);
    deps.hold(false);
  }
}

/** Display gate only. Count, version, and unused fields stay on the T1 report contract. */
function isPaintable(report: Report): boolean {
  if (!report || typeof report.disclaimer !== "string" || report.disclaimer.trim() === "") return false;
  if (!leadIssue(report.issues)) return false;
  if (!Array.isArray(report.exerciseSuggestions)) return false;
  return report.exerciseSuggestions.every((exercise) => {
    if (!exercise) return false;
    return drawnText(exercise.name) !== "" && drawnText(exercise.instruction) !== "";
  });
}

function drawnText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function compose(report: Report, measure: TextMeasure, attempt: Attempt): ShareCardLayout | null {
  const lead = leadIssue(report.issues);
  if (!lead) return null;
  const blocks: ShareBlock[] = [
    { role: "background", x: 0, y: 0, width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT, color: BACKGROUND },
  ];
  const lines: ShareLine[] = [];
  const bandHeight = paintDisclaimer(blocks, lines, report.disclaimer, measure);
  if (bandHeight === null) return null;

  let cursor = bandHeight + 28;
  cursor = placeText(lines, "title", COPY.shareTitle, PAD, cursor, theme.type.posterTitle, "bold", INK, CONTENT_WIDTH, null, measure);
  cursor += 8;
  cursor = placeText(lines, "section", COPY.shareLead, PAD, cursor, theme.type.subhead, "bold", ACCENT, CONTENT_WIDTH, null, measure);
  cursor += 8;
  cursor = paintLead(blocks, lines, lead, report.issues, attempt, cursor, measure);
  cursor += 16;
  cursor = placeText(lines, "section", COPY.shareExercises, PAD, cursor, theme.type.subhead, "bold", ACCENT, CONTENT_WIDTH, null, measure);
  cursor += 8;
  report.exerciseSuggestions.forEach((exercise, index) => {
    cursor = paintExercise(blocks, lines, exercise, index + 1, attempt.tipLines, cursor, measure);
  });
  cursor += 8;
  placeText(lines, "footer", COPY.shareFooter, PAD, cursor, theme.type.caption, "normal", SECONDARY, CONTENT_WIDTH, null, measure);
  return { width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT, blocks, lines };
}

function paintDisclaimer(
  blocks: ShareBlock[],
  lines: ShareLine[],
  disclaimer: string,
  measure: TextMeasure,
): number | null {
  const bodySize = theme.type.reading;
  const headingSize = theme.type.display;
  const body = wrapText(disclaimer, CONTENT_WIDTH, bodySize, "normal", measure, null);
  if (body.join("") !== disclaimer.replace(/\n/g, "")) return null;
  const top = 32;
  const headingY = top;
  const bodyY = headingY + lineHeight(headingSize) + 12;
  const bandHeight = bodyY + body.length * lineHeight(bodySize) + 32;
  if (bandHeight > SHARE_CARD_HEIGHT * 0.5) return null;
  blocks.push({ role: "disclaimer", x: 0, y: 0, width: SHARE_CARD_WIDTH, height: bandHeight, color: BAND });
  placeText(lines, "disclaimerHeading", COPY.disclaimerHeading, PAD, headingY, headingSize, "bold", BAND_HEADING, CONTENT_WIDTH, null, measure);
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

function paintLead(
  blocks: ShareBlock[],
  lines: ShareLine[],
  lead: PostureIssue,
  issues: readonly PostureIssue[],
  attempt: Attempt,
  cursor: number,
  measure: TextMeasure,
): number {
  const panel = openPanel(blocks, cursor);
  let inner = cursor + 18;
  const textX = PAD + 18;
  const textWidth = CONTENT_WIDTH - 36;
  inner = placeText(lines, "leadTitle", drawnText(lead.title), textX, inner, theme.type.section, "bold", INK, textWidth, null, measure);
  const severity = severityLabel(lead.severity);
  if (severity) {
    inner += 4;
    inner = placeText(lines, "severity", severity, textX, inner, theme.type.caption, "bold", ACCENT, textWidth, 1, measure);
  }
  const detail = drawnText(lead.detail);
  if (detail) {
    inner += 6;
    inner = placeText(lines, "leadDetail", detail, textX, inner, theme.type.subhead, "normal", SECONDARY, textWidth, attempt.detailLines, measure);
  }
  const others = issues.filter((issue) => issue !== lead).map((issue) => drawnText(issue.title)).filter((title) => title !== "");
  if (attempt.showOthers && others.length > 0) {
    inner += 8;
    inner = placeText(lines, "otherIssues", `${COPY.shareAlso}：${others.join("、")}`, textX, inner, theme.type.caption, "normal", INK, textWidth, 2, measure);
  }
  return closePanel(panel, inner, cursor);
}

function paintExercise(
  blocks: ShareBlock[],
  lines: ShareLine[],
  exercise: ExerciseSuggestion,
  index: number,
  tipLines: number,
  cursor: number,
  measure: TextMeasure,
): number {
  const panel = openPanel(blocks, cursor);
  const badgeSize = theme.radius.badge * 2;
  const innerLeft = PAD + 16;
  const badgeY = cursor + 16;
  blocks.push({
    role: "badge",
    x: innerLeft,
    y: badgeY,
    width: badgeSize,
    height: badgeSize,
    color: BADGE,
    radius: theme.radius.badge,
  });
  const indexText = String(index);
  const indexSize = theme.type.index;
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
  let inner = placeText(lines, "exerciseName", drawnText(exercise.name), nameX, badgeY, theme.type.reading, "bold", INK, nameWidth, null, measure);
  if (tipLines > 0) {
    inner += 4;
    inner = placeText(
      lines,
      "exerciseTip",
      drawnText(exercise.instruction),
      nameX,
      inner,
      theme.type.caption,
      "normal",
      SECONDARY,
      nameWidth,
      tipLines,
      measure,
    );
  }
  const contentBottom = Math.max(inner, badgeY + badgeSize);
  return closePanel(panel, contentBottom, cursor) + 12;
}

function openPanel(blocks: ShareBlock[], cursor: number): ShareBlock {
  const panel: ShareBlock = {
    role: "panel",
    x: PAD,
    y: cursor,
    width: CONTENT_WIDTH,
    height: 0,
    color: PANEL,
    radius: theme.radius.card,
  };
  blocks.push(panel);
  return panel;
}

function closePanel(panel: ShareBlock, contentBottom: number, cursor: number): number {
  const bottom = contentBottom + 16;
  panel.height = bottom - cursor;
  return bottom;
}

function placeText(
  lines: ShareLine[],
  role: ShareLineRole,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  weight: TextWeight,
  color: string,
  maxWidth: number,
  maxLines: number | null,
  measure: TextMeasure,
): number {
  const wrapped = wrapText(text, maxWidth, fontSize, weight, measure, maxLines);
  const step = lineHeight(fontSize);
  wrapped.forEach((row, index) => {
    lines.push({ role, text: row, x, y: y + index * step, fontSize, weight, color });
  });
  return y + wrapped.length * step;
}

function fits(layout: ShareCardLayout, measure: TextMeasure): boolean {
  return layout.lines.every((line) => {
    if (line.text === "") return false;
    if (line.x < 24 || line.y < 0) return false;
    if (line.y + line.fontSize > SHARE_CARD_HEIGHT - BOTTOM_GAP) return false;
    return line.x + measure(line.text, line.fontSize, line.weight) <= SHARE_CARD_WIDTH - 24;
  });
}

function leadIssue(issues: readonly PostureIssue[]): PostureIssue | null {
  if (!Array.isArray(issues)) return null;
  let best: PostureIssue | null = null;
  for (const issue of issues) {
    if (drawnText(issue?.title) === "") continue;
    if (!best || (SEVERITY_RANK[issue.severity] ?? 0) > (SEVERITY_RANK[best.severity] ?? 0)) best = issue;
  }
  return best;
}

function lineHeight(fontSize: number): number {
  return Math.ceil(fontSize * 1.35);
}

function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  weight: TextWeight,
  measure: TextMeasure,
  maxLines: number | null,
): string[] {
  const lines: string[] = [];
  let current = "";
  for (const char of text) {
    if (char === "\n") {
      if (current !== "") lines.push(current);
      current = "";
      continue;
    }
    const next = current + char;
    if (current !== "" && measure(next, fontSize, weight) > maxWidth) {
      lines.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  if (current !== "") lines.push(current);
  if (lines.length === 0) return [];
  if (maxLines === null || lines.length <= maxLines) return lines;
  const head = lines.slice(0, maxLines - 1);
  const rest = lines.slice(maxLines - 1).join("");
  head.push(ellipsize(rest, maxWidth, fontSize, weight, measure));
  return head;
}

function ellipsize(
  text: string,
  maxWidth: number,
  fontSize: number,
  weight: TextWeight,
  measure: TextMeasure,
): string {
  const mark = "…";
  if (measure(text, fontSize, weight) <= maxWidth) return text;
  let kept = "";
  for (const char of text) {
    const next = kept + char;
    if (measure(next + mark, fontSize, weight) > maxWidth) break;
    kept = next;
  }
  return `${kept}${mark}`;
}
