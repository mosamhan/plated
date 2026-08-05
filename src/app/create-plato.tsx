import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as ImagePicker from 'expo-image-picker';
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
import { CollaboratorPicker } from '@/components/CollaboratorPicker';
import { RatingInput } from '@/components/RatingInput';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { showAlert } from '@/lib/dialog';
import { success } from '@/lib/haptics';
import { isPlacesConfigured, PlaceResult, searchPlaces } from '@/lib/places';
import { pickVideo, uploadVideo } from '@/lib/upload';
import { useAuth } from '@/store/AuthContext';
import { useData } from '@/store/DataContext';
import { useLocation } from '@/store/LocationContext';
import { useCollabs } from '@/store/CollabsContext';
import { usePlatos } from '@/store/PlatosContext';
import { radius, spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export default function CreatePlato() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { restaurants, restaurantFor } = useData();
  const { addPlato } = usePlatos();
  const { invite } = useCollabs();
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const { userId } = useAuth();
  const { placeQuery } = useLocation();

  const [video, setVideo] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [restaurantId, setRestaurantId] = useState<string | undefined>();
  const [place, setPlace] = useState<PlaceResult | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [caption, setCaption] = useState('');
  // A Plato can cover several plates from one visit; the reel swipes between
  // them. At least one is required. Each carries its own name + rating.
  const [plates, setPlates] = useState<{ dishName: string; rating: number }[]>([{ dishName: '', rating: 9 }]);
  const [posting, setPosting] = useState(false);

  const updatePlate = (i: number, patch: Partial<{ dishName: string; rating: number }>) =>
    setPlates((p) => p.map((pl, idx) => (idx === i ? { ...pl, ...patch } : pl)));
  const addPlate = () => setPlates((p) => [...p, { dishName: '', rating: 9 }]);
  const removePlate = (i: number) => setPlates((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));
  const namedPlates = plates.filter((p) => p.dishName.trim());

  // Muted, looping preview of the picked clip.
  const player = useVideoPlayer(video?.uri ?? null, (p) => {
    p.loop = true;
    p.muted = true;
  });
  useEffect(() => {
    if (video?.uri) player.play();
  }, [video?.uri, player]);

  const pick = async (camera: boolean) => {
    const asset = await pickVideo({ camera });
    if (asset) setVideo(asset);
  };

  const selectedRestaurant = restaurantId ? restaurantFor(restaurantId) : undefined;
  const restaurantName = selectedRestaurant?.name ?? place?.name;
  const canPost = !!video && !!restaurantName && namedPlates.length > 0 && namedPlates.length === plates.length && !posting;

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
    if (!canPost || !video || !restaurantName) return;
    setPosting(true);

    // Upload the clip to Storage when signed in; fall back to the local uri so
    // the post still works before the 'platos' bucket exists.
    let videoUrl = video.uri;
    if (userId) {
      const url = await uploadVideo(userId, video);
      if (url) videoUrl = url;
    }

    // Headline mirrors the highest-rated plate; the full list rides on `plates`.
    const trimmed = namedPlates.map((p) => ({ dishName: p.dishName.trim(), rating: p.rating }));
    const headline = [...trimmed].sort((a, b) => b.rating - a.rating)[0];
    const plato = await addPlato({
      videoUrl,
      dishName: headline.dishName,
      restaurantName,
      restaurantId,
      rating: headline.rating,
      caption: caption.trim(),
      plates: trimmed,
    });
    // Invites need the post's id, so they go out once it exists. A failure here
    // isn't worth blocking the post — the Plato is already up.
    if (plato && collaborators.length) {
      await invite({ type: 'plato', id: plato.id }, collaborators);
    }
    setPosting(false);
    if (plato) {
      success();
      router.back();
    } else {
      showAlert('Could not post', 'Something went wrong posting your Plato — please try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="New Plato" closeMode />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 100 }}
        keyboardShouldPersistTaps="handled">
        {/* Video */}
        <View style={[styles.preview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {video ? (
            <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
          ) : (
            <View style={styles.previewEmpty}>
              <Ionicons name="videocam" size={34} color={colors.textMuted} />
              <Text style={[styles.previewHint, { color: colors.textMuted }]}>
                Record or upload a short vertical clip of the plate
              </Text>
            </View>
          )}
        </View>
        <View style={styles.videoBtns}>
          <Pressable onPress={() => pick(true)} style={[styles.videoBtn, { backgroundColor: colors.accent }]}>
            <Ionicons name="videocam" size={17} color={colors.accentText} />
            <Text style={[styles.videoBtnText, { color: colors.accentText }]}>Record</Text>
          </Pressable>
          <Pressable
            onPress={() => pick(false)}
            style={[styles.videoBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }]}>
            <Ionicons name="film" size={17} color={colors.text} />
            <Text style={[styles.videoBtnText, { color: colors.text }]}>Library</Text>
          </Pressable>
        </View>

        {/* Restaurant */}
        <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: spacing.xl }]}>Restaurant</Text>
        {restaurantName ? (
          <View style={[styles.selectedCard, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="location" size={18} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.selName, { color: colors.text }]} numberOfLines={1}>{restaurantName}</Text>
              {(selectedRestaurant?.cuisine || place?.cuisine) && (
                <Text style={[styles.selMeta, { color: colors.textMuted }]} numberOfLines={1}>
                  {selectedRestaurant?.cuisine ?? place?.cuisine}
                  {place?.location ? ` · ${place.location}` : ''}
                </Text>
              )}
            </View>
            <Pressable onPress={clearSelection} hitSlop={8}>
              <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 13 }}>Change</Text>
            </Pressable>
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

        {/* Plates — one video, but it can cover several dishes. Each becomes a
            page the reel swipes through, with its own name + rating. */}
        <Text style={[typography.heading, { color: colors.text, marginTop: spacing.xl, marginBottom: 4 }]}>
          What&apos;s in this Plato?
        </Text>
        <Text style={[styles.subhint, { color: colors.textMuted }]}>
          Add every plate this video shows. Viewers swipe between them; the highest-rated one
          headlines the reel.
        </Text>
        {plates.map((pl, i) => (
          <View key={i} style={[styles.plateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.plateHead}>
              <Text style={[styles.plateNum, { color: colors.text }]}>Plate {i + 1}</Text>
              {plates.length > 1 && (
                <Pressable onPress={() => removePlate(i)} hitSlop={6}>
                  <Ionicons name="trash-outline" size={18} color={colors.orderCta} />
                </Pressable>
              )}
            </View>
            <TextField
              label="Dish or drink"
              value={pl.dishName}
              onChangeText={(t) => updatePlate(i, { dishName: t })}
              placeholder="e.g. Pepperoni Pie"
            />
            <View style={{ marginTop: spacing.sm }}>
              <RatingInput value={pl.rating} onChange={(r) => updatePlate(i, { rating: r })} />
            </View>
          </View>
        ))}
        <Button label="Add another plate" variant="secondary" icon="add" style={{ marginTop: spacing.md }} onPress={addPlate} />

        {/* Caption */}
        <View style={{ marginTop: spacing.xl }}>
          <TextField
            label="Caption"
            value={caption}
            onChangeText={setCaption}
            placeholder="What makes this worth watching?"
            multiline
            style={{ minHeight: 70, textAlignVertical: 'top' }}
          />
        </View>

        {/* Collaborators */}
        <Text style={[typography.heading, { color: colors.text, marginTop: spacing.lg, marginBottom: spacing.md }]}>
          Collaborating with
        </Text>
        <CollaboratorPicker value={collaborators} onChange={setCollaborators} />
      </ScrollView>

      {/* Post CTA */}
      <View style={[styles.cta, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        <Button label={posting ? 'Posting…' : 'Post Plato'} size="lg" icon="play-circle" onPress={onPost} disabled={!canPost} loading={posting} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  preview: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: spacing.lg },
  previewHint: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  videoBtns: { flexDirection: 'row', gap: 10 },
  videoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  videoBtnText: { fontSize: 14, fontWeight: '800' },
  fieldLabel: { fontSize: 13, fontWeight: '700', marginBottom: 10 },
  selectedCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.md },
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
  subhint: { fontSize: 13, fontWeight: '500', marginBottom: spacing.md },
  plateCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.md,
  },
  plateHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  plateNum: { fontSize: 15, fontWeight: '800' },
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
