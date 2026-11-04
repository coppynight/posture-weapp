/**
 * Shared visual tokens for the capture page, the report page, and the share-card poster.
 * Confirmed moodboard: a light ground, neutral gray, and one near-black accent.
 * Pages read these values as CSS variables in app.wxss. The poster imports this module.
 */
export const theme = {
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
} as const;

/** CSS custom properties. app.wxss must declare each one so the pages stay on this palette. */
export const themeCssVars = {
  "--color-bg": theme.color.bg,
  "--color-surface": theme.color.surface,
  "--color-ink": theme.color.ink,
  "--color-ink-secondary": theme.color.inkSecondary,
  "--color-muted": theme.color.muted,
  "--color-line": theme.color.line,
  "--color-primary": theme.color.primary,
  "--color-on-primary": theme.color.onPrimary,
  "--color-primary-soft": theme.color.primarySoft,
  "--color-primary-ink": theme.color.primaryInk,
  "--radius-card": `${theme.radius.card}rpx`,
  "--radius-control": `${theme.radius.control}rpx`,
  "--radius-media": `${theme.radius.media}rpx`,
  "--radius-pill": `${theme.radius.pill}rpx`,
  "--size-ordinal": `${theme.size.ordinal}rpx`,
  "--type-title": `${theme.type.title}rpx`,
  "--type-display": `${theme.type.display}rpx`,
  "--type-section": `${theme.type.section}rpx`,
  "--type-card-title": `${theme.type.cardTitle}rpx`,
  "--type-body": `${theme.type.body}rpx`,
  "--type-reading": `${theme.type.reading}rpx`,
  "--type-subhead": `${theme.type.subhead}rpx`,
  "--type-caption": `${theme.type.caption}rpx`,
  "--type-index": `${theme.type.index}rpx`,
} as const;
