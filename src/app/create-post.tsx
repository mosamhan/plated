import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { CollaboratorPicker } from '@/components/CollaboratorPicker';
import { RatingBadge } from '@/components/RatingBadge';
import { RatingInput } from '@/components/RatingInput';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import type { PostMedia } from '@/data/types';
import { showAlert } from '@/lib/dialog';
import { success } from '@/lib/haptics';
import { isPlacesConfigured, PlaceResult, searchPlaces } from '@/lib/places';
import { MAX_POST_MEDIA } from '@/lib/post';
import { pickImages, uploadAsset } from '@/lib/upload';
import { useAuth } from '@/store/AuthContext';
import { useCollabs } from '@/store/CollabsContext';
import { useData } from '@/store/DataContext';
import { useLocation } from '@/store/LocationContext';
import { displayFont } from '@/theme/fonts';
import { radius, spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/** A picked plate before it's posted: its local/remote uri + name + rating. */
interface Draft {
  uri: string;
  dishName: string;
  rating: number;
  uploading: boolean;
}

/**
 * Multi-plate post creation. Pick several photos (OS multi-select, up to 20),
 * each becomes a plate with its own dish name + rating; the restaurant's
 * suggested average is offered but the poster's own ratings drive the post.
 * Restaurant, collaborators, caption, and more-options (comments/likes) round
 * it out. Posts via addOrder with the media carousel.
 */
export default function CreatePost() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const { restaurants, restaurantFor, restaurantWithRating, restaurantMenu, addOrder } = useData();
  const { placeQuery } = useLocation();
  const { invite } = useCollabs();

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [active, setActive] = useState(0); // which plate the editor targets
  const [caption, setCaption] = useState('');
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);

  // Restaurant: an existing id or a searched Foursquare place.
  const [restaurantId, setRestaurantId] = useState<string | undefined>();
  const [place, setPlace] = useState<PlaceResult | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);

  // More options.
  const [commentsDisabled, setCommentsDisabled] = useState(false);
  const [hideLikeCount, setHideLikeCount] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const selectedRestaurant = restaurantId ? restaurantFor(restaurantId) : undefined;
  const selectedLabel = selectedRestaurant?.name ?? place?.name;

  // Suggested rating = the restaurant's current Plated average, so the poster
  // has a starting point that matches the crowd rather than a blank slate —
  // used until a dish name is entered, at which point the per-dish average
  // below (when one exists) takes over as the more specific default.
  const suggested = restaurantId ? restaurantWithRating(restaurantId)?.platedRating ?? 0 : 0;

  // The crowd average for the active draft's exact dish name, when this
  // restaurant already has ratings for it.
  const activeDishMatch = (() => {
    const name = drafts[active]?.dishName.trim().toLowerCase();
    if (!restaurantId || !name) return null;
    return restaurantMenu(restaurantId).find((e) => e.count > 0 && e.name.toLowerCase() === name) ?? null;
  })();

  const addPhotos = async () => {
    const room = MAX_POST_MEDIA - drafts.length;
    if (room <= 0) return;
    const assets = await pickImages(room);
    if (!assets.length) return;
    const added: Draft[] = assets.map((a) => ({
      uri: a.uri,
      dishName: '',
      rating: suggested > 0 ? suggested : 8,
      uploading: !!userId,
    }));
    const base = drafts.length;
    setDrafts((p) => [...p, ...added]);

    // Upload each in the background; swap the local uri for the hosted one as
    // each finishes. Without a backend, the local uri is the post's image.
    if (userId) {
      assets.forEach(async (a, i) => {
        const url = await uploadAsset('plates', userId, a);
        setDrafts((p) => {
          const next = [...p];
          const idx = base + i;
          if (next[idx]) next[idx] = { ...next[idx], uri: url ?? next[idx].uri, uploading: false };
          return next;
        });
      });
    }
  };

  const updateDraft = (i: number, patch: Partial<Draft>) =>
    setDrafts((p) => p.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  // Switches the active draft's rating to the per-dish average the moment
  // its name matches one — keyed on the name (not the match object, which is
  // recomputed every render), so a rating the user adjusts afterward for a
  // still-matching name is never overwritten again.
  useEffect(() => {
    if (activeDishMatch) updateDraft(active, { rating: activeDishMatch.rating });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, drafts[active]?.dishName, restaurantId]);

  const removeDraft = (i: number) => {
    setDrafts((p) => p.filter((_, idx) => idx !== i));
    setActive((a) => Math.max(0, a >= i ? a - 1 : a));
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= drafts.length) return;
    setDrafts((p) => {
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setActive(j);
  };

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResults(await searchPlaces(query.trim(), placeQuery));
    setSearching(false);
  };

  const uploading = drafts.some((d) => d.uploading);
  const named = drafts.filter((d) => d.dishName.trim());
  const canPost =
    drafts.length > 0 && named.length === drafts.length && (!!restaurantId || !!place) && !posting && !uploading;

  const onPost = async () => {
    if (!canPost) return;
    setPosting(true);
    const media: PostMedia[] = drafts.map((d) => ({
      uri: d.uri,
      type: 'image',
      dishName: d.dishName.trim(),
      rating: d.rating,
    }));
    const headline = [...media].sort((a, b) => b.rating - a.rating)[0];
    const order = await addOrder({
      restaurantId,
      place: place ?? undefined,
      dishName: headline.dishName,
      rating: headline.rating,
      photo: headline.uri,
      media,
      description: caption.trim() || 'No notes yet.',
      tags: ['Nearby'],
      commentsDisabled,
      hideLikeCount,
    });
    if (order && collaborators.length) {
      await invite({ type: 'plate', id: order.id }, collaborators);
    }
    setPosting(false);
    if (order) {
      success();
      router.back();
    } else {
      showAlert('Could not post', 'Something went wrong posting your plates — please try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="New post"
        closeMode
        rightLabel={posting ? undefined : 'Share'}
        onRight={canPost ? onPost : undefined}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 60 }}
        keyboardShouldPersistTaps="handled">
        {/* Photo strip */}
        {drafts.length === 0 ? (
          <Pressable
            onPress={addPhotos}
            style={[styles.emptyPick, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="images-outline" size={34} color={colors.textMuted} />
            <Text style={[styles.emptyPickText, { color: colors.text }]}>Add plates</Text>
            <Text style={[styles.emptyPickHint, { color: colors.textMuted }]}>
              Pick up to {MAX_POST_MEDIA} photos — one per dish or drink
            </Text>
          </Pressable>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
              {drafts.map((d, i) => (
                <Pressable key={i} onPress={() => setActive(i)} style={styles.thumbWrap}>
                  <Image
                    source={{ uri: d.uri }}
                    style={[
                      styles.thumb,
                      { borderColor: i === active ? colors.accent : 'transparent', backgroundColor: colors.surface },
                    ]}
                    contentFit="cover"
                  />
                  {d.uploading && (
                    <View style={styles.thumbOverlay}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  )}
                  <View style={[styles.thumbIndex, { backgroundColor: colors.accent }]}>
                    <Text style={styles.thumbIndexText}>{i + 1}</Text>
                  </View>
                </Pressable>
              ))}
              {drafts.length < MAX_POST_MEDIA && (
                <Pressable onPress={addPhotos} style={[styles.thumbAdd, { borderColor: colors.border }]}>
                  <Ionicons name="add" size={28} color={colors.textMuted} />
                </Pressable>
              )}
            </ScrollView>

            {/* Editor for the active plate — dish name + rating, reorder, remove. */}
            {drafts[active] && (
              <View style={[styles.editor, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.editorHead}>
                  <Text style={[styles.editorTitle, { color: colors.text }]}>Plate {active + 1}</Text>
                  <View style={styles.editorTools}>
                    <Pressable onPress={() => move(active, -1)} disabled={active === 0} hitSlop={6}>
                      <Ionicons name="arrow-back" size={18} color={active === 0 ? colors.border : colors.text} />
                    </Pressable>
                    <Pressable onPress={() => move(active, 1)} disabled={active === drafts.length - 1} hitSlop={6}>
                      <Ionicons
                        name="arrow-forward"
                        size={18}
                        color={active === drafts.length - 1 ? colors.border : colors.text}
                      />
                    </Pressable>
                    <Pressable onPress={() => removeDraft(active)} hitSlop={6}>
                      <Ionicons name="trash-outline" size={18} color={colors.orderCta} />
                    </Pressable>
                  </View>
                </View>
                <TextField
                  label="Dish or drink"
                  value={drafts[active].dishName}
                  onChangeText={(t) => updateDraft(active, { dishName: t })}
                  placeholder="e.g. Truffle Smash Burger"
                />
                {activeDishMatch && (
                  <Text style={[styles.avgLabel, { color: colors.textMuted, marginTop: spacing.sm }]}>
                    Starting at the crowd average ({activeDishMatch.rating.toFixed(1)}, {activeDishMatch.count}{' '}
                    {activeDishMatch.count === 1 ? 'rating' : 'ratings'}) — rate it however you actually feel.
                  </Text>
                )}
                <View style={{ marginTop: spacing.sm }}>
                  <RatingInput value={drafts[active].rating} onChange={(r) => updateDraft(active, { rating: r })} />
                </View>
              </View>
            )}
          </>
        )}

        {/* Suggested restaurant average */}
        {suggested > 0 && (
          <View style={styles.avgRow}>
            <Text style={[styles.avgLabel, { color: colors.textMuted }]}>Plated&apos;s average here</Text>
            <RatingBadge score={suggested} size="sm" />
          </View>
        )}

        {/* Restaurant */}
        <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: spacing.xl }]}>Restaurant</Text>
        {selectedLabel ? (
          <View style={[styles.selectedCard, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="location" size={18} color={colors.accent} />
            <Text style={[styles.selName, { color: colors.text, flex: 1 }]} numberOfLines={1}>
              {selectedLabel}
            </Text>
            <Pressable
              onPress={() => {
                setRestaurantId(undefined);
                setPlace(null);
                setResults([]);
              }}
              hitSlop={8}>
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
                placeholder="Search restaurants & cafés"
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
          </View>
        ) : (
          <View style={styles.pillWrap}>
            {restaurants.map((r) => {
              const on = r.id === restaurantId;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => setRestaurantId(r.id)}
                  style={[styles.pill, { backgroundColor: on ? colors.accent : colors.surface, borderColor: on ? colors.accent : colors.border }]}>
                  <Text style={{ color: on ? colors.accentText : colors.text, fontWeight: '700', fontSize: 13 }}>{r.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Caption */}
        <View style={{ marginTop: spacing.xl }}>
          <TextField
            label="Caption"
            value={caption}
            onChangeText={setCaption}
            placeholder="What made this spread worth posting?"
            multiline
            style={{ minHeight: 76, textAlignVertical: 'top' }}
          />
        </View>

        {/* Collaborators */}
        <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: spacing.xl }]}>Collaborating with</Text>
        <CollaboratorPicker value={collaborators} onChange={setCollaborators} />

        {/* More options */}
        <Pressable
          onPress={() => setMoreOpen((o) => !o)}
          style={[styles.moreToggle, { borderColor: colors.border }]}>
          <Ionicons name="options-outline" size={18} color={colors.text} />
          <Text style={[styles.moreLabel, { color: colors.text }]}>More options</Text>
          <Ionicons name={moreOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        </Pressable>
        {moreOpen && (
          <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
            <View style={styles.optRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optName, { color: colors.text }]}>Turn off commenting</Text>
                <Text style={[styles.optHint, { color: colors.textMuted }]}>Nobody can comment on this post.</Text>
              </View>
              <Switch
                value={commentsDisabled}
                onValueChange={setCommentsDisabled}
                trackColor={{ true: colors.accent, false: colors.border }}
                thumbColor="#fff"
              />
            </View>
            <View style={styles.optRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optName, { color: colors.text }]}>Hide like count</Text>
                <Text style={[styles.optHint, { color: colors.textMuted }]}>Only you see the total likes.</Text>
              </View>
              <Switch
                value={hideLikeCount}
                onValueChange={setHideLikeCount}
                trackColor={{ true: colors.accent, false: colors.border }}
                thumbColor="#fff"
              />
            </View>
          </View>
        )}

        <Button
          label={posting ? 'Posting…' : uploading ? 'Uploading photos…' : `Share ${drafts.length || ''} ${drafts.length === 1 ? 'plate' : 'plates'}`.trim()}
          icon="checkmark"
          style={{ marginTop: spacing.xl }}
          disabled={!canPost}
          onPress={onPost}
        />
        {drafts.length > 0 && named.length < drafts.length && (
          <Text style={[styles.warn, { color: colors.textMuted }]}>Name every plate to post.</Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  emptyPick: {
    height: 180,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyPickText: { fontSize: 16, fontWeight: '800' },
  emptyPickHint: { fontSize: 13, fontWeight: '500' },
  strip: { gap: 10, paddingVertical: 4 },
  thumbWrap: { position: 'relative' },
  thumb: { width: 84, height: 84, borderRadius: radius.md, borderWidth: 2 },
  thumbOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.md,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbIndex: {
    position: 'absolute',
    top: 4,
    left: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  thumbIndexText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  thumbAdd: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editor: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  editorHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  editorTitle: { fontSize: 15, fontWeight: '800' },
  editorTools: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avgRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  avgLabel: { fontSize: 13, fontWeight: '700' },
  fieldLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8 },
  selectedCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.lg },
  selName: { fontSize: 15, fontWeight: '800' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 44, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1, fontSize: 15 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  resName: { fontSize: 14, fontWeight: '700' },
  resMeta: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  moreToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: spacing.xl,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  moreLabel: { flex: 1, fontSize: 15, fontWeight: '700' },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  optName: { fontSize: 14, fontWeight: '700' },
  optHint: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  warn: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: spacing.sm },
});
