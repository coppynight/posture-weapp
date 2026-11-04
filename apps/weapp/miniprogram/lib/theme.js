"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.themeCssVars = exports.theme = void 0;
/**
 * Shared visual tokens for the capture page, the report page, and the share-card poster.
 * Confirmed moodboard: a light ground, neutral gray, and one near-black accent.
 * Pages read these values as CSS variables in app.wxss. The poster imports this module.
 */
exports.theme = {
    color: {
        bg: "#f7f7f8",
        surface: "#ffffff",
        ink: "#0d0d0d",
        inkSecondary: "#3f3f46",
        muted: "#5d5d67",
        line: "#e6e6e6",
        primary: "#0d0d0d",
        onPrimary: "#ffffff",
        primarySoft: "#f3f3f3",
        primaryInk: "#0d0d0d",
    },
    radius: {
        card: 32,
        control: 32,
        media: 24,
        /** Poster ordinal corner radius. On-screen ordinals use size.ordinal with radius.pill. */
        badge: 18,
        pill: 999,
    },
    /** Box size for the numbered marks on the capture slots and the report exercises. */
    size: {
        ordinal: 48,
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
    "--size-ordinal": `${exports.theme.size.ordinal}rpx`,
    "--type-title": `${exports.theme.type.title}rpx`,
    "--type-display": `${exports.theme.type.display}rpx`,
    "--type-section": `${exports.theme.type.section}rpx`,
    "--type-card-title": `${exports.theme.type.cardTitle}rpx`,
    "--type-body": `${exports.theme.type.body}rpx`,
    "--type-reading": `${exports.theme.type.reading}rpx`,
    "--type-subhead": `${exports.theme.type.subhead}rpx`,
    "--type-caption": `${exports.theme.type.caption}rpx`,
    "--type-index": `${exports.theme.type.index}rpx`,
};
