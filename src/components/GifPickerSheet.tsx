import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { GifResult, searchStickers } from '@/lib/giphy';
import { tapLight } from '@/lib/haptics';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const COLUMNS = 3;
const CELL_GAP = 3;

/**
 * The manual browse/search grid behind the composer's dedicated Stickers
 * button — the fallback for browsing on your own terms (trending, a specific
 * search) alongside the predictive `GifSuggestionRail`, which only ever shows
 * matches for what's already being typed. Visually modeled on
 * `PhotoPickerSheet`'s own grid (virtualized FlatList, `recyclingKey`/
 * `cachePolicy` on every cell since these thumbnails are heavier than a
 * static photo), but the data comes from the `giphy` Edge Function instead of
 * the device's photo library, and a debounced search bar stands in for the
 * album dropdown.
 *
 * One mixed feed of Giphy GIFs and Giphy stickers (`searchStickers`) rather
 * than a GIFs/Stickers toggle — they're the same kind of thing to a user
 * reaching for a reaction, and splitting them into two tabs the user had to
 * switch between was a UI step without a real distinction.
 *
 * Used two ways: `GifPicker` is the bare grid (reused wherever it needs to
 * render inline), and `GifPickerModal` wraps it in its own sheet — a
 * dedicated composer icon, not a tab buried inside the general attach/share
 * sheet, since it's used often enough to earn its own button (matching
 * Instagram/iMessage's own composer row).
 */
export function GifPicker({ onPick }: { onPick: (url: string) => void }) {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const cellSize = (windowWidth - spacing.lg * 2 - (COLUMNS - 1) * CELL_GAP) / COLUMNS;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    const r = await searchStickers(q);
    setLoading(false);
    setResults(r);
  }, []);

  // Trending the moment this sheet opens — `search` only sets state after
  // awaiting the network, so the rule can't see past the function call, same
  // as this codebase's other load-on-mount effects (conversationStreak.ts,
  // useMessagePins.ts).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    search(query);
    // Runs once on mount only — typing is debounced separately below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const onChangeQuery = (q: string) => {
    setQuery(q);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => search(q), 350);
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
            placeholder="Search stickers"
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
          />
        </View>
      </View>

      {loading && results.length === 0 ? (
        <View style={styles.loadingFill}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(g) => `${g.kind}-${g.id}`}
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
                recyclingKey={`${item.kind}-${item.id}`}
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

/**
 * The composer's dedicated Stickers sheet — its own bottom sheet (same shell
 * as `AttachSheet`/`SendToSheet`: transparent `Modal`, backdrop-tap to close,
 * slide-up sheet) rather than a tab living inside the general
 * plate/plato/restaurant share sheet, since reaching for a sticker is common
 * enough in a chat composer to earn a one-tap button of its own.
 */
export function GifPickerModal({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const { colors } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = Math.round(windowHeight * 0.72);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.modalSheet, { backgroundColor: colors.card, height: sheetHeight }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text style={[styles.modalTitle, { color: colors.text, fontFamily: displayFont }]}>Stickers</Text>
          <GifPicker
            onPick={(url) => {
              onPick(url);
              onClose();
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg, paddingBottom: 8 },
  searchWrap: { flex: 1, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12 },
  searchInput: { fontSize: 14, paddingVertical: 8 },
  loadingFill: { paddingVertical: 60, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: '100%', height: '100%', borderRadius: 6 },
  blank: { fontSize: 14, fontWeight: '500', textAlign: 'center', marginTop: 40, width: '100%' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: 10 },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
});
