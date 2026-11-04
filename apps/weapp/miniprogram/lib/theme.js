"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.themeCssVars = exports.theme = void 0;
/**
 * Shared visual tokens for the capture page, the report page, and the share-card poster.
 * 「年轻干练」: a light ground, one teal, neutral greys, large radii, and one type scale.
 * Pages read these values as CSS variables in app.wxss. The poster imports this module.
 */
exports.theme = {
    color: {
        bg: "#f5f7f7",
        surface: "#ffffff",
        ink: "#1c2422",
        inkSecondary: "#3e4a47",
        muted: "#55625e",
        line: "#dce3e1",
        primary: "#0f766e",
        onPrimary: "#f4fffb",
        primarySoft: "#d4efe8",
        primaryInk: "#0c5c52",
    },
    radius: {
        card: 40,
        control: 32,
        media: 24,
        badge: 18,
        pill: 999,
    },
    type: {
        title: 56,
        display: 42,
        posterTitle: 40,
        section: 34,
        cardTitle: 32,
        body: 30,
        reading: 28,
        subhead: 26,
        caption: 24,
        index: 22,
    },
};
/** CSS custom properties. app.wxss must declare each one so the pages stay on this palette. */
exports.themeCssVars = {
    "--color-bg": exports.theme.color.bg,
    "--color-surface": exports.theme.color.surface,
    "--color-ink": exports.theme.color.ink,
    "--color-ink-secondary": exports.theme.color.inkSecondary,
    "--color-muted": exports.theme.color.muted,
    "--color-line": exports.theme.color.line,
    "--color-primary": exports.theme.color.primary,
    "--color-on-primary": exports.theme.color.onPrimary,
    "--color-primary-soft": exports.theme.color.primarySoft,
    "--color-primary-ink": exports.theme.color.primaryInk,
    "--radius-card": `${exports.theme.radius.card}rpx`,
    "--radius-control": `${exports.theme.radius.control}rpx`,
    "--radius-media": `${exports.theme.radius.media}rpx`,
    "--radius-pill": `${exports.theme.radius.pill}rpx`,
    "--type-title": `${exports.theme.type.title}rpx`,
    "--type-display": `${exports.theme.type.display}rpx`,
    "--type-poster-title": `${exports.theme.type.posterTitle}rpx`,
    "--type-section": `${exports.theme.type.section}rpx`,
    "--type-card-title": `${exports.theme.type.cardTitle}rpx`,
    "--type-body": `${exports.theme.type.body}rpx`,
    "--type-reading": `${exports.theme.type.reading}rpx`,
    "--type-subhead": `${exports.theme.type.subhead}rpx`,
    "--type-caption": `${exports.theme.type.caption}rpx`,
    "--type-index": `${exports.theme.type.index}rpx`,
};
