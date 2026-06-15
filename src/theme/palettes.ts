/**
 * Plated theme system.
 *
 * Four hand-tuned palettes the user can preview and switch between live.
 * Every screen/component reads colors from `useTheme()` (see ThemeContext),
 * so changing the active palette restyles the entire app instantly.
 */

export type ThemeName = 'coral' | 'teal' | 'charcoal' | 'saffron' | 'noir';

export interface Palette {
  /** Whether this is a dark theme (drives status bar style, etc.) */
  isDark: boolean;
  /** App background */
  background: string;
  /** Slightly raised surfaces (section backgrounds, inputs) */
  surface: string;
  /** Cards / feed items */
  card: string;
  /** Primary text */
  text: string;
  /** Secondary / muted text */
  textMuted: string;
  /** Hairline borders & dividers */
  border: string;
  /** Brand accent */
  accent: string;
  /** Tinted accent background (chips, soft buttons) */
  accentSoft: string;
  /** Text/icon color that sits on top of `accent` */
  accentText: string;
  /** Positive / verified */
  success: string;
  /** Rating score colors */
  ratingHigh: string;
  ratingMid: string;
  ratingLow: string;
  /** Shadow color (iOS) */
  shadow: string;
  /**
   * Order call-to-action. Always warm/appetizing in every theme — research
   * shows cool tints suppress appetite, so even the teal theme keeps a warm
   * order button.
   */
  orderCta: string;
  orderCtaText: string;
}

export interface ThemeMeta {
  name: ThemeName;
  label: string;
  description: string;
  palette: Palette;
}

const coral: Palette = {
  isDark: false,
  background: '#FFFFFF',
  surface: '#FFF6F4',
  card: '#FFFFFF',
  text: '#1A1413',
  textMuted: '#8C817C',
  border: '#F2E8E4',
  accent: '#E03131',
  accentSoft: '#FFE7E8',
  accentText: '#FFFFFF',
  success: '#23B26D',
  ratingHigh: '#23B26D',
  ratingMid: '#E08A00',
  ratingLow: '#E25241',
  shadow: '#3A1E18',
  orderCta: '#E03131',
  orderCtaText: '#FFFFFF',
};

const teal: Palette = {
  isDark: false,
  background: '#FFFFFF',
  surface: '#F1FBF8',
  card: '#FFFFFF',
  text: '#102420',
  textMuted: '#6B7B77',
  border: '#E1F0EB',
  accent: '#0B7B6C',
  accentSoft: '#D6F4EE',
  accentText: '#FFFFFF',
  success: '#11B5A4',
  ratingHigh: '#0FB89C',
  ratingMid: '#E08A00',
  ratingLow: '#E25241',
  shadow: '#06302A',
  orderCta: '#D9480F',
  orderCtaText: '#FFFFFF',
};

const charcoal: Palette = {
  isDark: true,
  background: '#0E0F12',
  surface: '#16181D',
  card: '#1C1F27',
  text: '#F4F6F8',
  textMuted: '#9AA1AD',
  border: '#2A2E38',
  accent: '#C8FF4D',
  accentSoft: '#26301A',
  accentText: '#11150A',
  success: '#5BE3A7',
  ratingHigh: '#A6E84F',
  ratingMid: '#FFCB47',
  ratingLow: '#FF6B5E',
  shadow: '#000000',
  orderCta: '#FF7A45',
  orderCtaText: '#1A0E06',
};

const saffron: Palette = {
  isDark: false,
  background: '#FFFDF8',
  surface: '#FBF3E2',
  card: '#FFFFFF',
  text: '#251B10',
  textMuted: '#8C7B61',
  border: '#EFE3CC',
  accent: '#B07207',
  accentSoft: '#FBEDCE',
  accentText: '#FFFFFF',
  success: '#2E9E63',
  ratingHigh: '#2E9E63',
  ratingMid: '#D98E0B',
  ratingLow: '#D9542F',
  shadow: '#3A2A0E',
  orderCta: '#D9480F',
  orderCtaText: '#FFFFFF',
};

const noir: Palette = {
  isDark: true,
  background: '#121110',
  surface: '#1C1813',
  card: '#221C14',
  text: '#F5F1E8',
  textMuted: '#A99F8C',
  border: '#33291B',
  accent: '#D9A441',
  accentSoft: '#2E2415',
  accentText: '#1A1304',
  success: '#5BD08A',
  ratingHigh: '#6BD98A',
  ratingMid: '#E0A93E',
  ratingLow: '#FF7A6B',
  shadow: '#000000',
  orderCta: '#D9480F',
  orderCtaText: '#FFFFFF',
};

export const THEMES: Record<ThemeName, ThemeMeta> = {
  coral: {
    name: 'coral',
    label: 'Coral',
    description: 'Warm & appetizing — friendly social feel',
    palette: coral,
  },
  teal: {
    name: 'teal',
    label: 'Fresh Teal',
    description: 'Clean & trustworthy — Beli-inspired',
    palette: teal,
  },
  charcoal: {
    name: 'charcoal',
    label: 'Midnight',
    description: 'Bold dark mode with an electric accent',
    palette: charcoal,
  },
  saffron: {
    name: 'saffron',
    label: 'Saffron',
    description: 'Upscale amber-gold on soft cream',
    palette: saffron,
  },
  noir: {
    name: 'noir',
    label: 'Noir Gold',
    description: 'Premium dark — charcoal & warm gold',
    palette: noir,
  },
};

export const THEME_ORDER: ThemeName[] = ['saffron', 'coral', 'teal', 'noir', 'charcoal'];

export const DEFAULT_THEME: ThemeName = 'saffron';

/** Shared design tokens that do not change between palettes. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 26,
  pill: 999,
} as const;

export const typography = {
  hero: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.3 },
  heading: { fontSize: 18, fontWeight: '700' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '500' as const },
  bodyStrong: { fontSize: 15, fontWeight: '700' as const },
  label: { fontSize: 13, fontWeight: '600' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
} as const;

/**
 * Pick a rating color from a 0–10 score.
 * Thresholds: 8.5+ excellent / 6.5–8.4 good / below 6.5 weak — calibrated so
 * "high" stays meaningful (food-app scores cluster high).
 */
export function ratingColor(palette: Palette, score: number): string {
  if (score >= 8.5) return palette.ratingHigh;
  if (score >= 6.5) return palette.ratingMid;
  return palette.ratingLow;
}

/** 9.0+ plates get a flame — meaning survives grayscale & colorblindness. */
export function isTopRated(score: number): boolean {
  return score >= 9;
}

/**
 * Readable text color for an arbitrary background (YIQ luma). Rating colors
 * vary per theme (e.g. Midnight's bright lime), so badge text is computed,
 * not hardcoded white.
 */
export function contrastText(hexBg: string): string {
  const hex = hexBg.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? '#1A1413' : '#FFFFFF';
}
