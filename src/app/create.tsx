import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { RestaurantMenuSheet, type MenuEntry } from '@/components/RestaurantMenuSheet';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { showAlert } from '@/lib/dialog';
import { success } from '@/lib/haptics';
import { fetchMenuItems, isPlacesConfigured, PlaceResult, searchPlaces } from '@/lib/places';
import { pickImage, uploadAsset } from '@/lib/upload';
import { useAuth } from '@/store/AuthContext';
import { useData } from '@/store/DataContext';
import { useLocation } from '@/store/LocationContext';
import { radius, spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

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
  const { restaurants, restaurantFor, addOrder, menuForRestaurant, restaurantMenu } = useData();
  const { userId } = useAuth();
  const { placeQuery } = useLocation();

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

  const [photo, setPhoto] = useState<string>('');
  const [description, setDescription] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  // Manual override of which added item is the post's headline (else auto = best).
  const [highlightOverride, setHighlightOverride] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Multi-item order: capture every dish the user had, each with its own
  // rating. The post's headline is auto-computed as the highest-rated item.
  const [items, setItems] = useState<{ name: string; rating: number }[]>([]);
  const [draftName, setDraftName] = useState('');
  const [draftRating, setDraftRating] = useState(8);
  // Structured menu from the paid API (when available) — merged with the
  // crowd-sourced menu for suggestions. Best-effort; empty is fine.
  const [apiMenu, setApiMenu] = useState<string[]>([]);

  // Pull the API menu once a Foursquare place is chosen.
  useEffect(() => {
    let alive = true;
    if (place?.fsqId) {
      fetchMenuItems(place.fsqId).then((m) => alive && setApiMenu(m));
    } else {
      setApiMenu([]);
    }
    return () => {
      alive = false;
    };
  }, [place?.fsqId]);

  const pickAndUpload = async (camera: boolean) => {
    const asset = await pickImage({ camera });
    if (!asset) return;
    if (!userId) {
      setPhoto(asset.uri); // no backend — just preview the local image
      return;
    }
    setUploading(true);
    const url = await uploadAsset('plates', userId, asset);
    setUploading(false);
    if (url) setPhoto(url);
    else showAlert('Upload failed', 'Could not upload that photo — please try again.');
  };

  const selectedRestaurant = restaurantId ? restaurantFor(restaurantId) : undefined;
  const selectedLabel = selectedRestaurant?.name ?? place?.name;
  const canPost = (!!restaurantId || !!place) && items.length > 0 && !posting;

  // Headline = the user's manual pick if set & still present, else the
  // highest-rated item (mirrors what the post will show).
  const headline = items.length
    ? (highlightOverride && items.find((it) => it.name === highlightOverride)) ||
      [...items].sort((a, b) => b.rating - a.rating)[0]
    : null;

  // Menu shown in the "View menu" sheet: crowd-sourced (this restaurant's
  // aggregated dishes) + any structured API items, deduped.
  const menuEntries: MenuEntry[] = (() => {
    const crowd = restaurantId ? restaurantMenu(restaurantId) : [];
    const seen = new Map<string, MenuEntry>();
    for (const e of crowd) seen.set(e.name.toLowerCase(), e);
    for (const n of apiMenu) if (!seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), { name: n, rating: 0, count: 0 });
    return [...seen.values()];
  })();

  // Menu suggestions: hybrid of the crowd-sourced menu (dishes already posted
  // here) + the paid API menu, deduped, minus what's already on this order,
  // filtered by the current draft text.
  const menuSuggestions = (() => {
    const crowd = restaurantId ? menuForRestaurant(restaurantId) : [];
    const seen = new Map<string, string>();
    for (const n of [...crowd, ...apiMenu]) {
      const key = n.trim().toLowerCase();
      if (key && !seen.has(key)) seen.set(key, n.trim());
    }
    return [...seen.values()]
      .filter((n) => !items.some((it) => it.name.toLowerCase() === n.toLowerCase()))
      .filter((n) => !draftName.trim() || n.toLowerCase().includes(draftName.trim().toLowerCase()))
      .slice(0, 6);
  })();

  const addItem = (name: string, ratingVal: number) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (items.some((it) => it.name.toLowerCase() === trimmed.toLowerCase())) return;
    setItems((p) => [...p, { name: trimmed, rating: ratingVal }]);
    setDraftName('');
    setDraftRating(8);
  };
  const removeItem = (name: string) => {
    setItems((p) => p.filter((it) => it.name !== name));
    if (highlightOverride === name) setHighlightOverride(null);
  };

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResults(await searchPlaces(query.trim(), placeQuery));
    setSearching(false);
  };

  const clearSelection = () => {
    setRestaurantId(undefined);
    setPlace(null);
    setResults([]);
    setQuery('');
  };

  const onPost = async () => {
    if (!canPost || !headline) return;
    setPosting(true);
    const order = await addOrder({
      restaurantId,
      place: place ?? undefined,
      // Headline mirrors the highest-rated item; items carries the full order.
      dishName: headline.name,
      rating: headline.rating,
      items,
      photo,
      description: description.trim() || 'No notes yet.',
      tags: ['Nearby'],
    });
    setPosting(false);
    if (order) {
      success();
      router.back();
    } else {
      showAlert('Could not post', 'Something went wrong posting your plate — please try again.');
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
        <View>
          {photo ? (
            <Image source={{ uri: photo }} style={[styles.preview, { backgroundColor: colors.surface }]} contentFit="cover" />
          ) : (
            <View style={[styles.preview, styles.previewEmpty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="camera-outline" size={30} color={colors.textMuted} />
              <Text style={[styles.previewHint, { color: colors.textMuted }]}>Add a photo of your plate</Text>
            </View>
          )}
          {uploading && (
            <View style={[styles.uploadOverlay, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.uploadText}>Uploading…</Text>
            </View>
          )}
        </View>
        <View style={styles.photoBtns}>
          <Pressable onPress={() => pickAndUpload(true)} style={[styles.photoBtn, { backgroundColor: colors.accent }]}>
            <Ionicons name="camera" size={17} color={colors.accentText} />
            <Text style={[styles.photoBtnText, { color: colors.accentText }]}>Take photo</Text>
          </Pressable>
          <Pressable onPress={() => pickAndUpload(false)} style={[styles.photoBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }]}>
            <Ionicons name="images" size={17} color={colors.text} />
            <Text style={[styles.photoBtnText, { color: colors.text }]}>Library</Text>
          </Pressable>
        </View>

        {/* Restaurant */}
        <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: spacing.xl }]}>Restaurant</Text>

        {selectedLabel ? (
          <>
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
            {/* View the restaurant's menu and add + rate items from it. */}
            <Pressable
              onPress={() => setMenuOpen(true)}
              style={[styles.menuBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="restaurant-outline" size={17} color={colors.accent} />
              <Text style={[styles.menuBtnText, { color: colors.text }]}>
                View menu{menuEntries.length ? ` · ${menuEntries.length}` : ''}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          </>
        ) : isPlacesConfigured ? (
          <View>
            <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={runSearch}
                returnKeyType="search"
                placeholder="Search restaurants & cafés near you"
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

        {/* Items you had — rate each dish; the post highlights the best one. */}
        <Text style={[typography.heading, { color: colors.text, marginTop: spacing.xl, marginBottom: 4 }]}>
          What did you have?
        </Text>
        <Text style={[styles.subhint, { color: colors.textMuted }]}>
          Rate each dish. Your post highlights the highest-rated one by default — tap another
          dish to highlight it instead. The rest give the restaurant’s dishes their own ratings.
        </Text>

        {/* Added items — tap a row to make it the highlighted dish. */}
        {items.map((it) => {
          const isBest = headline?.name === it.name;
          return (
            <Pressable
              key={it.name}
              onPress={() => setHighlightOverride(it.name)}
              style={[
                styles.itemRow,
                { backgroundColor: colors.surface, borderColor: isBest ? colors.accent : colors.border, borderWidth: isBest ? 1.5 : StyleSheet.hairlineWidth },
              ]}>
              <View style={[styles.itemScore, { backgroundColor: colors.accent }]}>
                <Text style={[styles.itemScoreText, { color: colors.accentText }]}>{it.rating.toFixed(1)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>{it.name}</Text>
                {isBest ? (
                  <Text style={[styles.bestTag, { color: colors.accent }]}>★ Highlighted dish</Text>
                ) : (
                  <Text style={[styles.tapTag, { color: colors.textMuted }]}>Tap to highlight</Text>
                )}
              </View>
              <Pressable onPress={() => removeItem(it.name)} hitSlop={8}>
                <Ionicons name="close-circle" size={22} color={colors.textMuted} />
              </Pressable>
            </Pressable>
          );
        })}

        {/* Menu suggestions from what others posted here */}
        {menuSuggestions.length > 0 && (
          <>
            <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: spacing.md }]}>On the menu here</Text>
            <View style={styles.suggestWrap}>
              {menuSuggestions.map((name) => (
                <Pressable
                  key={name}
                  onPress={() => setDraftName(name)}
                  style={[styles.suggestChip, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
                  <Ionicons name="add" size={13} color={colors.accent} />
                  <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>{name}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* Draft item: name + rating + add */}
        <View style={{ marginTop: spacing.md }}>
          <TextField label="Dish name" value={draftName} onChangeText={setDraftName} placeholder="e.g. Truffle Smash Burger" />
          <View style={[styles.ratingBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <RatingInput value={draftRating} onChange={setDraftRating} />
          </View>
          <Button
            label={items.length ? 'Add another item' : 'Add item'}
            variant="secondary"
            icon="add"
            style={{ marginTop: spacing.md }}
            disabled={!draftName.trim()}
            onPress={() => addItem(draftName, draftRating)}
          />
        </View>

        {/* Notes */}
        <View style={{ marginTop: spacing.xl }}>
          <TextField
            label="Your notes"
            value={description}
            onChangeText={setDescription}
            placeholder="What made it great? Any ordering tips?"
            multiline
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
        </View>
      </ScrollView>

      {/* Post CTA */}
      <View style={[styles.cta, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        <Button
          label={items.length > 1 ? `Post plate · ${items.length} items` : 'Post plate'}
          size="lg"
          icon="checkmark"
          onPress={onPost}
          disabled={!canPost}
          loading={posting}
        />
      </View>

      {/* Restaurant menu — add & rate dishes straight from the menu. */}
      <RestaurantMenuSheet
        visible={menuOpen}
        restaurantName={selectedLabel ?? 'Restaurant'}
        menu={menuEntries}
        addedNames={items.map((it) => it.name)}
        onAdd={(name, r) => addItem(name, r)}
        onClose={() => setMenuOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  preview: { width: '100%', aspectRatio: 1.4, borderRadius: radius.lg, marginBottom: spacing.md },
  previewEmpty: { alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed' },
  previewHint: { fontSize: 13, fontWeight: '600' },
  uploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  photoBtns: { flexDirection: 'row', gap: 10, marginBottom: spacing.lg },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  photoBtnText: { fontSize: 14, fontWeight: '800' },
  fieldLabel: { fontSize: 13, fontWeight: '700', marginBottom: 10 },
  menuBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  menuBtnText: { flex: 1, fontSize: 14, fontWeight: '800' },
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
  subhint: { fontSize: 13, fontWeight: '500', lineHeight: 18, marginBottom: spacing.md },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  itemScore: { minWidth: 44, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  itemScoreText: { fontSize: 15, fontWeight: '900' },
  itemName: { fontSize: 15, fontWeight: '700' },
  bestTag: { fontSize: 12, fontWeight: '800', marginTop: 2 },
  tapTag: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  suggestWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  suggestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
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
