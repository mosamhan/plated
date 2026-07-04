import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RatingBadge } from '@/components/RatingBadge';
import { TextField } from '@/components/TextField';
import { isPlacesConfigured, PlaceResult, searchPlaces } from '@/lib/places';
import { useData } from '@/store/DataContext';
import { radius, spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export default function Search() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { searchRestaurants, restaurantWithRating } = useData();
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Restaurants already on Plated (with a Plated's Rating), matched locally.
  const onPlated = useMemo(() => searchRestaurants(query), [searchRestaurants, query]);

  const runSearch = async () => {
    if (!query.trim() || !isPlacesConfigured) return;
    setSearching(true);
    setPlaces(await searchPlaces(query.trim()));
    setSearching(false);
  };

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
            onSubmitEditing={runSearch}
            returnKeyType="search"
            placeholder="Search restaurants & dishes"
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
                  onPress={() => router.push(`/restaurant/${item.id}`)}
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
          <Text style={[styles.section, { color: colors.text, marginBottom: 0 }]}>
            {isPlacesConfigured ? 'Add a plate somewhere new' : 'More restaurants'}
          </Text>
          {searching && <ActivityIndicator size="small" color={colors.accent} />}
        </View>

        {isPlacesConfigured && places.length === 0 && (
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            {query.trim() ? 'Press search to find real restaurants near you.' : 'Search to discover restaurants and rate a dish.'}
          </Text>
        )}

        {places.map((p) => (
          <Pressable
            key={p.fsqId}
            onPress={() => addAt(p)}
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
            <View style={[styles.addPill, { backgroundColor: colors.accent }]}>
              <Ionicons name="add" size={16} color={colors.accentText} />
              <Text style={{ color: colors.accentText, fontWeight: '800', fontSize: 12 }}>Plate</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingBottom: 4 },
  section: { ...typography.heading, marginTop: spacing.lg, marginBottom: spacing.md },
  fsqHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.sm },
  hint: { fontSize: 13, fontWeight: '500', marginTop: spacing.md },
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
  addPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
});
