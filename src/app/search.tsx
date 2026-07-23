import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RatingBadge } from '@/components/RatingBadge';
import { RestaurantActionSheet } from '@/components/RestaurantActionSheet';
import { TextField } from '@/components/TextField';
import { Restaurant } from '@/data/types';
import { isPlacesConfigured, PlaceResult, searchPlaces } from '@/lib/places';
import { useData } from '@/store/DataContext';
import { useLocation } from '@/store/LocationContext';
import { radius, spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

type Selected =
  | { kind: 'db'; restaurant: Restaurant; rating?: number }
  | { kind: 'fsq'; place: PlaceResult };

export default function Search() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { searchRestaurants, restaurantWithRating } = useData();
  const { location, placeQuery } = useLocation();
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onPlated = useMemo(() => searchRestaurants(query), [searchRestaurants, query]);

  const runSearch = async (term: string) => {
    if (!isPlacesConfigured) return;
    setSearching(true);
    setPlaces(await searchPlaces(term.trim() || 'restaurant', placeQuery));
    setSearching(false);
  };

  // Live typeahead — search as you type (debounced), no Enter required.
  useEffect(() => {
    if (!isPlacesConfigured) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => runSearch(query), 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, placeQuery.ll, placeQuery.near]);

  const addAt = (p: PlaceResult) => {
    const q = (s: string) => encodeURIComponent(s);
    router.push(
      `/create?fsqId=${q(p.fsqId)}&fsqName=${q(p.name)}&fsqCuisine=${q(p.cuisine)}&fsqLocation=${q(p.location)}`,
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ paddingRight: 4 }}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <TextField
            icon="search"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            placeholder="Search restaurants, cafés & dishes"
            autoFocus
            style={{ paddingVertical: 8 }}
          />
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 60 }}>
        {/* Already on Plated */}
        {onPlated.length > 0 && (
          <>
            <Text style={[styles.section, { color: colors.text }]}>On Plated</Text>
            {onPlated.map((item) => {
              const withRating = restaurantWithRating(item.id);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setSelected({ kind: 'db', restaurant: item, rating: withRating?.platedRating })}
                  style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Image source={{ uri: item.image }} style={[styles.img, { backgroundColor: colors.surface }]} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                    <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                      {item.cuisine}{item.location ? ` · ${item.location}` : ''}
                    </Text>
                  </View>
                  {withRating && withRating.orderCount > 0 && <RatingBadge score={withRating.platedRating} size="sm" />}
                </Pressable>
              );
            })}
          </>
        )}

        {/* Real venues from Foursquare */}
        <View style={styles.fsqHead}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.section, { color: colors.text, marginBottom: 0 }]}>
              {query.trim() ? 'Results' : 'Restaurants near you'}
            </Text>
            <Pressable onPress={() => router.push('/settings/location')} style={styles.nearRow} hitSlop={8}>
              <Ionicons name="location" size={12} color={colors.accent} />
              <Text style={[styles.nearLabel, { color: colors.text }]}>{location.label}</Text>
              <Text style={[styles.nearChange, { color: colors.accent }]}>Change</Text>
            </Pressable>
          </View>
          {searching && <ActivityIndicator size="small" color={colors.accent} />}
        </View>

        {isPlacesConfigured && places.length === 0 && !searching && (
          <View style={styles.emptyBox}>
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              {query.trim()
                ? `No “${query.trim()}” found near ${location.label}. If it's in another city, change your location.`
                : `No restaurants found near ${location.label} yet.`}
            </Text>
            <Pressable
              onPress={() => router.push('/settings/location')}
              style={[styles.changeBtn, { backgroundColor: colors.accent }]}>
              <Ionicons name="navigate" size={15} color={colors.accentText} />
              <Text style={[styles.changeBtnText, { color: colors.accentText }]}>Change location</Text>
            </Pressable>
          </View>
        )}

        {places.map((p) => (
          <Pressable
            key={p.fsqId}
            onPress={() => setSelected({ kind: 'fsq', place: p })}
            style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.venueIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="restaurant" size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{p.name}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                {p.cuisine}{p.location ? ` · ${p.location}` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
      </ScrollView>

      {/* Restaurant action tile: directions + reservations + primary action */}
      {selected?.kind === 'db' && (
        <RestaurantActionSheet
          visible
          onClose={() => setSelected(null)}
          name={selected.restaurant.name}
          cuisine={selected.restaurant.cuisine}
          location={selected.restaurant.location}
          lat={selected.restaurant.lat}
          lng={selected.restaurant.lng}
          rating={selected.rating}
          primaryLabel="View on Plated"
          primaryIcon="restaurant"
          onPrimary={() => router.push(`/restaurant/${selected.restaurant.id}`)}
        />
      )}
      {selected?.kind === 'fsq' && (
        <RestaurantActionSheet
          visible
          onClose={() => setSelected(null)}
          name={selected.place.name}
          cuisine={selected.place.cuisine}
          location={selected.place.location}
          lat={selected.place.lat}
          lng={selected.place.lng}
          primaryLabel="Add a plate here"
          primaryIcon="add"
          onPrimary={() => addAt(selected.place)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingBottom: 4 },
  section: { ...typography.heading, marginTop: spacing.lg, marginBottom: spacing.md },
  nearRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  nearLabel: { fontSize: 12, fontWeight: '700' },
  nearChange: { fontSize: 12, fontWeight: '800', marginLeft: 4 },
  fsqHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.sm },
  emptyBox: { alignItems: 'flex-start', gap: spacing.md, marginTop: spacing.md },
  hint: { fontSize: 13, fontWeight: '500', lineHeight: 19 },
  changeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  changeBtnText: { fontSize: 14, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  img: { width: 54, height: 54, borderRadius: radius.md },
  venueIcon: { width: 54, height: 54, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 13, fontWeight: '500', marginTop: 2 },
});
