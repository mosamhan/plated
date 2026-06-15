import { Platform } from 'react-native';

/**
 * Display serif (Fraunces) — used in exactly three places for editorial,
 * food-magazine character: dish names, screen titles, and the big rating
 * numeral. Everything else stays on the system sans.
 */
export const displayFont = Platform.select({
  web: "'Fraunces_600SemiBold', Georgia, 'Times New Roman', serif",
  default: 'Fraunces_600SemiBold',
});

export const displayFontBold = Platform.select({
  web: "'Fraunces_700Bold', Georgia, 'Times New Roman', serif",
  default: 'Fraunces_700Bold',
});
