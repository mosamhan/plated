import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { RatingBadge } from '@/components/RatingBadge';
import { searchPlaces, type PlaceResult } from '@/lib/places';
import { useData, type RestaurantWithRating } from '@/store/DataContext';
import { useLocation } from '@/store/LocationContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const MAX_PLATED = 4;
const MAX_NEARBY = 6;

interface Props {
  /** A place already on Plated — it has an id, a rating and pins. */
  onSelectRated: (restaurantId: string) => void;
  /**
   * A place only Foursquare knows about. Nothing is written yet: it's shown from
   * the external data, and only becomes a row when the user actually acts.
   */
  onSelectExternal: (place: PlaceResult) => void;
}

/**
 * Search, inline under the bar rather than behind a full-screen overlay.
 *
 * Results come from two places and say which is which: what's on Plated (with
 * its rating) first, then everything else nearby from Foursquare. Picking either
 * puts it on the map — the difference is only whether we already have a rating
 * to show.
 */
export function InlineSearch({ onSelectRated, onSelectExternal }: Props) {
  const { colors } = useTheme();
  const { topRestaurants } = useData();
  const { placeQuery } = useLocation();

  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [nearby, setNearby] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqSeq = useRef(0);

  const q = query.trim();

  // On-Plated matches, scored so the closest name match leads rather than
  // whichever happens to be best-rated.
  const rated = useMemo<RestaurantWithRating[]>(() => {
    if (q.length < 1) return [];
    const needle = q.toLowerCase();
    return topRestaurants()
      .map((r) => {
        const name = r.name.toLowerCase();
        const score = name.startsWith(needle)
          ? 0
          : name.includes(needle)
            ? 1
            : r.cuisine.toLowerCase().includes(needle)
              ? 2
              : -1;
        return { r, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score || b.r.platedRating - a.r.platedRating)
      .slice(0, MAX_PLATED)
      .map((x) => x.r);
  }, [q, topRestaurants]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.length < 2) {
      setNearby([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      const seq = ++reqSeq.current;
      const res = await searchPlaces(q, placeQuery);
      // Ignore a response from a keystroke the user has already typed past.
      if (seq !== reqSeq.current) return;
      setNearby(res);
      setSearching(false);
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q, placeQuery]);

  // Anything already on Plated is shown from our own data, so drop the
  // Foursquare duplicate rather than listing the same place twice.
  const ratedNames = new Set(rated.map((r) => r.name.toLowerCase()));
  const external = nearby.filter((p) => !ratedNames.has(p.name.toLowerCase())).slice(0, MAX_NEARBY);

  const open = focused && q.length > 0;
  const nothing = open && !searching && rated.length === 0 && external.length === 0;

  const dismiss = () => {
    setFocused(false);
    setQuery('');
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          placeholder="Search dishes, drinks, places, people"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text }]}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
        />
        {q.length > 0 && (
          <Pressable onPress={dismiss} hitSlop={8}>
            <Ionicons name="close-circle" size={17} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {open && (
        <View style={[styles.drop, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {rated.map((r, i) => (
            <Pressable
              key={r.id}
              onPress={() => {
                dismiss();
                onSelectRated(r.id);
              }}
              style={({ pressed }) => [
                styles.row,
                i < rated.length + external.length - 1 && {
                  borderBottomColor: colors.border,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                },
                { opacity: pressed ? 0.7 : 1 },
              ]}>
              <Ionicons name="location" size={16} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                  {r.cuisine} · {r.orderCount} {r.orderCount === 1 ? 'plate' : 'plates'} on Plated
                </Text>
              </View>
              <RatingBadge score={r.platedRating} size="sm" />
            </Pressable>
          ))}

          {external.map((p, i) => (
            <Pressable
              key={p.fsqId}
              onPress={() => {
                dismiss();
                onSelectExternal(p);
              }}
              style={({ pressed }) => [
                styles.row,
                i < external.length - 1 && {
                  borderBottomColor: colors.border,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                },
                { opacity: pressed ? 0.7 : 1 },
              ]}>
              <Ionicons name="add-circle-outline" size={16} color={colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                  {[p.cuisine, p.location].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text style={[styles.notYet, { color: colors.textMuted }]}>Not rated yet</Text>
            </Pressable>
          ))}

          {searching && (
            <View style={styles.searching}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={[styles.meta, { color: colors.textMuted }]}>Looking nearby…</Text>
            </View>
          )}

          {nothing && (
            <Text style={[styles.meta, { color: colors.textMuted, padding: 14 }]}>
              Nothing nearby matches “{q}”.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontSize: 14, fontWeight: '500' },
  drop: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    zIndex: 30,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    // Floats over the map below it.
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11 },
  name: { fontSize: 14, fontWeight: '800' },
  meta: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  notYet: { fontSize: 11, fontWeight: '700' },
  searching: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.md },
});
