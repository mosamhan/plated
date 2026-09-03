/** One emoji "cluster" — a base pictograph, optional ZWJ sequences (👨‍👩‍👧), a
 *  variation selector, or a two-letter flag (🇺🇸) — matched as a single unit. */
const EMOJI_CLUSTER = new RegExp(
  '(\\p{Extended_Pictographic}(\\u200D\\p{Extended_Pictographic})*\\uFE0F?|\\p{Regional_Indicator}{2})',
  'gu',
);

/**
 * How many emoji a message is made of, if — ignoring whitespace — it's
 * *nothing but* emoji. Returns 0 for anything with real text mixed in, so a
 * caption like "🔥 order again" doesn't get treated the same as "🔥🔥🔥".
 */
export function emojiOnlyCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const matches = trimmed.match(EMOJI_CLUSTER);
  if (!matches) return 0;
  const withoutWhitespace = trimmed.replace(/\s+/g, '');
  if (matches.join('').length !== withoutWhitespace.length) return 0;
  return matches.length;
}

/** iMessage/Instagram convention: a handful of bare emoji render oversized, no bubble. */
export function isBigEmojiMessage(text: string): boolean {
  const count = emojiOnlyCount(text);
  return count > 0 && count <= 3;
}
