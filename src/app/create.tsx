import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { RatingInput } from '@/components/RatingInput';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { foodPhoto } from '@/data/images';
import { success } from '@/lib/haptics';
import { isPlacesConfigured, PlaceResult, searchPlaces } from '@/lib/places';
import { useData } from '@/store/DataContext';
import { radius, spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const SAMPLE_PHOTOS = Array.from({ length: 15 }, (_, i) => foodPhoto(i));

export default function CreatePlate() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    restaurantId?: string;
    fsqId?: string;
    fsqName?: string;
    fsqCuisine?: string;
    fsqLocation?: string;
  }>();
  const { restaurants, restaurantFor, addOrder } = useData();

  // Restaurant selection: either an existing restaurant id, or a Foursquare place.
  const presetPlace: PlaceResult | null = params.fsqId
    ? {
        fsqId: params.fsqId,
        name: params.fsqName ?? 'Restaurant',
        cuisine: params.fsqCuisine ?? 'Restaurant',
        location: params.fsqLocation ?? '',
      }
    : null;

  const [restaurantId, setRestaurantId] = useState<string | undefined>(params.restaurantId);
  const [place, setPlace] = useState<PlaceResult | null>(presetPlace);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [photo, setPhoto] = useState<string>(SAMPLE_PHOTOS[0]);
  const [dishName, setDishName] = useState('');
  const [description, setDescription] = useState('');
  const [rating, setRating] = useState(8);
  const [posting, setPosting] = useState(false);

  const selectedRestaurant = restaurantId ? restaurantFor(restaurantId) : undefined;
  const selectedLabel = selectedRestaurant?.name ?? place?.name;
  const canPost = (!!restaurantId || !!place) && dishName.trim().length > 0 && !posting;

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResults(await searchPlaces(query.trim()));
    setSearching(false);
  };

  const clearSelection = () => {
    setRestaurantId(undefined);
    setPlace(null);
    setResults([]);
    setQuery('');
  };

  const onPost = async () => {
    if (!canPost) return;
    setPosting(true);
    const order = await addOrder({
      restaurantId,
      place: place ?? undefined,
      dishName: dishName.trim(),
      photo,
      description: description.trim() || 'No notes yet.',
      rating,
      tags: ['Nearby'],
    });
    setPosting(false);
    if (order) {
      success();
      router.back();
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="New plate" closeMode />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 100 }}
        keyboardShouldPersistTaps="handled">
        {/* Photo */}
        <Image source={{ uri: photo }} style={[styles.preview, { backgroundColor: colors.surface }]} contentFit="cover" />
        <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Choose a photo</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
          {SAMPLE_PHOTOS.map((p) => (
            <Pressable key={p} onPress={() => setPhoto(p)}>
              <Image
                source={{ uri: p }}
                style={[styles.thumb, { borderColor: p === photo ? colors.accent : colors.border, borderWidth: p === photo ? 3 : 1 }]}
                contentFit="cover"
              />
            </Pressable>
          ))}
        </ScrollView>

        {/* Restaurant */}
        <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: spacing.xl }]}>Restaurant</Text>

        {selectedLabel ? (
          <View style={[styles.selectedCard, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="location" size={18} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.selName, { color: colors.text }]} numberOfLines={1}>{selectedLabel}</Text>
              {(selectedRestaurant?.cuisine || place?.cuisine) && (
                <Text style={[styles.selMeta, { color: colors.textMuted }]} numberOfLines={1}>
                  {selectedRestaurant?.cuisine ?? place?.cuisine}
                  {place?.location ? ` · ${place.location}` : ''}
                </Text>
              )}
            </View>
            {!params.restaurantId && !params.fsqId && (
              <Pressable onPress={clearSelection} hitSlop={8}>
                <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 13 }}>Change</Text>
              </Pressable>
            )}
          </View>
        ) : isPlacesConfigured ? (
          <View>
            <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={runSearch}
                returnKeyType="search"
                placeholder="Search restaurants near you"
                placeholderTextColor={colors.textMuted}
                style={[styles.searchInput, { color: colors.text }]}
              />
              {searching && <ActivityIndicator size="small" color={colors.accent} />}
            </View>
            {results.map((r) => (
              <Pressable
                key={r.fsqId}
                onPress={() => setPlace(r)}
                style={[styles.resultRow, { borderBottomColor: colors.border }]}>
                <Ionicons name="restaurant-outline" size={18} color={colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resName, { color: colors.text }]} numberOfLines={1}>{r.name}</Text>
                  <Text style={[styles.resMeta, { color: colors.textMuted }]} numberOfLines={1}>
                    {r.cuisine}{r.location ? ` · ${r.location}` : ''}
                  </Text>
                </View>
              </Pressable>
            ))}
            {results.length === 0 && query.length > 0 && !searching && (
              <Text style={[styles.hint, { color: colors.textMuted }]}>Press search to find “{query}”.</Text>
            )}
          </View>
        ) : (
          // Fallback (no Foursquare key): pick from known restaurants
          <View style={styles.restaurantWrap}>
            {restaurants.map((r) => {
              const active = r.id === restaurantId;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => setRestaurantId(r.id)}
                  style={[styles.rPill, { backgroundColor: active ? colors.accent : colors.surface, borderColor: active ? colors.accent : colors.border }]}>
                  {active && <Ionicons name="checkmark" size={14} color={colors.accentText} style={{ marginRight: 4 }} />}
                  <Text style={{ color: active ? colors.accentText : colors.text, fontWeight: '700', fontSize: 13 }}>{r.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Dish + description */}
        <View style={{ marginTop: spacing.xl }}>
          <TextField label="Dish name" value={dishName} onChangeText={setDishName} placeholder="e.g. Truffle Smash Burger" />
          <TextField
            label="Your notes"
            value={description}
            onChangeText={setDescription}
            placeholder="What made it great? Any ordering tips?"
            multiline
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
        </View>

        {/* Rating */}
        <Text style={[typography.heading, { color: colors.text, marginTop: spacing.md, marginBottom: spacing.md }]}>Your rating</Text>
        <View style={[styles.ratingBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <RatingInput value={rating} onChange={setRating} />
        </View>
      </ScrollView>

      {/* Post CTA */}
      <View style={[styles.cta, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        <Button label="Post plate" size="lg" icon="checkmark" onPress={onPost} disabled={!canPost} loading={posting} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  preview: { width: '100%', aspectRatio: 1.4, borderRadius: radius.lg, marginBottom: spacing.md },
  fieldLabel: { fontSize: 13, fontWeight: '700', marginBottom: 10 },
  thumb: { width: 64, height: 64, borderRadius: radius.md },
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
  },
  selName: { fontSize: 15, fontWeight: '800' },
  selMeta: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '500', paddingVertical: 12 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resName: { fontSize: 15, fontWeight: '700' },
  resMeta: { fontSize: 13, fontWeight: '500', marginTop: 1 },
  hint: { fontSize: 13, fontWeight: '500', marginTop: 12 },
  restaurantWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  ratingBox: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  cta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
