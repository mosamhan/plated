import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { SegmentedPill } from '@/components/discover/SegmentedPill';
import { GifResult, searchGifs } from '@/lib/giphy';
import { tapLight } from '@/lib/haptics';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const COLUMNS = 3;
const CELL_GAP = 3;
const KINDS = [
  { key: 'gifs', label: 'GIFs' },
  { key: 'stickers', label: 'Stickers' },
] as const;
type GifKind = (typeof KINDS)[number]['key'];

/**
 * The manual "GIFs" tab inside the composer's Share sheet (`AttachSheet` in
 * `messages/[id].tsx`) — the fallback for browsing/searching on your own
 * terms (trending, a specific search) alongside the predictive
 * `GifSuggestionRail`, which only ever shows matches for what's already
 * being typed. Visually modeled on `PhotoPickerSheet`'s own grid
 * (virtualized FlatList, `recyclingKey`/`cachePolicy` on every cell since
 * these thumbnails are heavier than a static photo), but the data comes from
 * the `giphy` Edge Function instead of the device's photo library, and a
 * debounced search bar stands in for the album dropdown.
 *
 * Not its own `Modal` — it renders inline inside the AttachSheet that's
 * already open, the same way the Plates/Platos/Restaurants tabs render
 * inline content rather than each opening a separate sheet.
 */
export function GifPicker({ onPick }: { onPick: (url: string) => void }) {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const cellSize = (windowWidth - spacing.lg * 2 - (COLUMNS - 1) * CELL_GAP) / COLUMNS;

  const [kind, setKind] = useState<GifKind>('gifs');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string, k: GifKind) => {
    setLoading(true);
    const r = await searchGifs(q, k);
    setLoading(false);
    setResults(r);
  }, []);

  // Trending the moment this tab opens or you switch GIFs/Stickers. `search`
  // only sets state after awaiting the network — the rule can't see past the
  // function call, same as this codebase's other load-on-mount effects
  // (conversationStreak.ts, useMessagePins.ts).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    search(query, kind);
    // Only kind changing (not query) should re-trigger immediately — typing
    // is debounced separately below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, search]);

  const onChangeQuery = (q: string) => {
    setQuery(q);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => search(q, kind), 350);
  };

  useEffect(
    () => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    },
    [],
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            value={query}
            onChangeText={onChangeQuery}
            placeholder={`Search ${kind === 'gifs' ? 'GIFs' : 'stickers'}`}
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
          />
        </View>
        <SegmentedPill value={kind} onChange={setKind} options={[...KINDS]} minWidth={0} fontSize={13} compact />
      </View>

      {loading && results.length === 0 ? (
        <View style={styles.loadingFill}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(g) => g.id}
          numColumns={COLUMNS}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: 8, paddingBottom: 24 }}
          columnWrapperStyle={{ gap: CELL_GAP }}
          ItemSeparatorComponent={() => <View style={{ height: CELL_GAP }} />}
          ListEmptyComponent={
            <Text style={[styles.blank, { color: colors.textMuted }]}>
              {query.trim() ? 'No results.' : 'Nothing trending right now.'}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                tapLight();
                onPick(item.fullUrl);
              }}
              style={{ width: cellSize, height: cellSize }}>
              <Image
                source={{ uri: item.previewUrl }}
                recyclingKey={item.id}
                cachePolicy="memory-disk"
                transition={0}
                style={styles.thumb}
                contentFit="cover"
              />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg, paddingBottom: 8 },
  searchWrap: { flex: 1, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12 },
  searchInput: { fontSize: 14, paddingVertical: 8 },
  loadingFill: { paddingVertical: 60, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: '100%', height: '100%', borderRadius: 6 },
  blank: { fontSize: 14, fontWeight: '500', textAlign: 'center', marginTop: 40, width: '100%' },
});
