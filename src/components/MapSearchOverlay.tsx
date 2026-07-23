import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RatingBadge } from '@/components/RatingBadge';
import { searchPlaces, type PlaceResult } from '@/lib/places';
import { useData } from '@/store/DataContext';
import { useLocation } from '@/store/LocationContext';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * Full-screen map search (an in-tree overlay, NOT a Modal, so it can open the
 * restaurant detail sheet — which is a Modal — without nesting). Type to find
 * restaurants nearest you (Foursquare, biased to your location); with an empty
 * query it suggests restaurants ranked by their plates. Selecting a result
 * opens the same detail sheet as tapping a pin.
 */
export function MapSearchOverlay({
  onClose,
  onSelectRestaurant,
}: {
  onClose: () => void;
  onSelectRestaurant: (id: string) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { topRestaurants, ensureRestaurant } = useData();
  const { placeQuery, location } = useLocation();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [opening, setOpening] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqSeq = useRef(0);

  // Suggested = restaurants ranked by their plates (best-rated, has plates).
  const suggested = topRestaurants().slice(0, 12);

  // Debounced nearest-restaurant search as you type.
  useEffect(() => {
    const q = query.trim();
    if (debounce.current) clearTimeout(debounce.current);
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      const seq = ++reqSeq.current;
      const res = await searchPlaces(q, placeQuery);
      if (seq === reqSeq.current) {
        setResults(res);
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, placeQuery]);

  const openPlace = async (place: PlaceResult) => {
    setOpening(true);
    const id = await ensureRestaurant(place);
    setOpening(false);
    if (id) {
      onClose();
      onSelectRestaurant(id);
    }
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      {/* Search bar */}
      <View style={styles.headerRow}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={`Search restaurants near ${location.label}`}
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text }]}
            returnKeyType="search"
          />
          {(searching || opening) && <ActivityIndicator size="small" color={colors.accent} />}
        </View>
        <Pressable onPress={onClose} hitSlop={8} style={{ paddingHorizontal: 4 }}>
          <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 15 }}>Cancel</Text>
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        {query.trim().length >= 2 ? (
          <>
            {results.map((r) => (
              <Pressable key={r.fsqId} onPress={() => openPlace(r)} style={[styles.row, { borderBottomColor: colors.border }]}>
                <Ionicons name="location-outline" size={18} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{r.name}</Text>
                  <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                    {r.cuisine}{r.location ? ` · ${r.location}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ))}
            {results.length === 0 && !searching && (
              <Text style={[styles.empty, { color: colors.textMuted }]}>No restaurants found near you.</Text>
            )}
          </>
        ) : (
          <>
            <Text style={[styles.section, { color: colors.text, fontFamily: displayFont }]}>Suggested for you</Text>
            <Text style={[styles.sectionSub, { color: colors.textMuted }]}>Highly-rated for their plates near {location.label}</Text>
            {suggested.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => {
                  onClose();
                  onSelectRestaurant(r.id);
                }}
                style={[styles.row, { borderBottomColor: colors.border }]}>
                <Ionicons name="restaurant-outline" size={18} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{r.name}</Text>
                  <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                    {r.cuisine} · {r.orderCount} {r.orderCount === 1 ? 'plate' : 'plates'} rated
                  </Text>
                </View>
                {r.platedRating > 0 && <RatingBadge score={r.platedRating} size="sm" />}
              </Pressable>
            ))}
            {suggested.length === 0 && (
              <Text style={[styles.empty, { color: colors.textMuted }]}>Search to find restaurants near you.</Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { zIndex: 50 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontSize: 15, fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 13, fontWeight: '500', marginTop: 1 },
  section: { fontSize: 20, fontWeight: '600', marginBottom: 2 },
  sectionSub: { fontSize: 13, fontWeight: '500', marginBottom: 12 },
  empty: { fontSize: 14, fontWeight: '500', textAlign: 'center', marginTop: 40 },
});
