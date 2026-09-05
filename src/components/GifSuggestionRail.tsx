import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';

import { GifResult, searchStickers } from '@/lib/giphy';
import { tapLight } from '@/lib/haptics';
import { extractFirstUrl } from '@/lib/linkPreview';
import { radius, spacing } from '@/theme/palettes';

/** Below this, whatever's typed is too short to search meaningfully. */
const MIN_QUERY_LENGTH = 2;
/**
 * Past this many words, the draft has stopped being "a word or two I'm
 * about to swap for a GIF" and turned into an actual sentence — suggestions
 * keyed off it stop being relevant, and the rail would just be sitting
 * there stale (or re-searching on every keystroke of an unrelated caption)
 * for as long as the message keeps growing.
 */
const MAX_QUERY_WORDS = 4;
const DEBOUNCE_MS = 400;
const MAX_RESULTS = 12;

/**
 * A row of sticker suggestions (Giphy GIFs and Giphy stickers together, one
 * mixed feed — see `searchStickers`) matching whatever's currently being
 * typed — TikTok's DM composer does this (type "wow", a strip of matching
 * GIFs appears right above the keyboard) instead of making it something you
 * have to go find behind an icon. Tapping one sends it immediately; the
 * typed text is left alone, since a suggestion is an alternative to sending
 * it, not something that consumes it.
 *
 * The dedicated Stickers composer button (`GifPickerSheet.tsx`) stays as the
 * fallback for browsing or searching without first typing a matching word.
 */
export function GifSuggestionRail({ query, onPick }: { query: string; onPick: (url: string) => void }) {
  const [results, setResults] = useState<GifResult[]>([]);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a slow earlier search resolving after a faster later one
  // and clobbering it with stale results.
  const requestId = useRef(0);

  const trimmed = query.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  // A pasted link is never a GIF search term — without this, "check this
  // out https://en.wikipedia.org/wiki/Cat" gets treated as a literal query
  // (Giphy fuzzy-matches "cat" out of the URL) instead of leaving the
  // link-preview card as the one thing that renders for it.
  const inRange = trimmed.length >= MIN_QUERY_LENGTH && wordCount <= MAX_QUERY_WORDS && !extractFirstUrl(trimmed);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    // Out of range, just stop issuing new searches — no need to clear
    // `results` here too; the render below already hides the rail whenever
    // the query itself is out of range, independent of what's still in state.
    if (!inRange) return;
    const id = ++requestId.current;
    debounceTimer.current = setTimeout(() => {
      searchStickers(trimmed).then((r) => {
        if (requestId.current === id) setResults(r.slice(0, MAX_RESULTS));
      });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [trimmed, inRange]);

  if (!inRange || results.length === 0) return null;

  return (
    <FlatList
      horizontal
      data={results}
      keyExtractor={(g) => `${g.kind}-${g.id}`}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => {
            tapLight();
            onPick(item.fullUrl);
          }}
          style={styles.cell}>
          <Image
            source={{ uri: item.previewUrl }}
            recyclingKey={`${item.kind}-${item.id}`}
            cachePolicy="memory-disk"
            transition={0}
            style={styles.thumb}
            contentFit="cover"
          />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { gap: 6, paddingHorizontal: spacing.lg, paddingVertical: 8 },
  cell: { width: 84, height: 84 },
  thumb: { width: '100%', height: '100%', borderRadius: radius.md },
});
