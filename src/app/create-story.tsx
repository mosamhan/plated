import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useState } from 'react';
import {
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
import { ScreenHeader } from '@/components/ScreenHeader';
import { postMedia } from '@/lib/post';
import { success, tick } from '@/lib/haptics';
import { pickImage, pickVideo, uploadAsset, uploadVideo } from '@/lib/upload';
import { useAuth } from '@/store/AuthContext';
import { useData } from '@/store/DataContext';
import { usePlatos } from '@/store/PlatosContext';
import { useStories } from '@/store/StoriesContext';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

type Audience = 'public' | 'friends';

/**
 * Post a story.
 *
 * Deliberately a short form: media, a caption, optionally the place. A story
 * that takes as long to file as a rated plate isn't a story — the whole appeal
 * is that it costs nothing to post because it costs nothing to lose.
 */
export default function CreateStory() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const { restaurants, orders } = useData();
  const { platos } = usePlatos();
  const { addStory } = useStories();

  // Arriving from a share sheet's "Add to story": the plate/Plato is already
  // chosen, so the picker is skipped and its media (and place) come prefilled.
  const { orderId, plate: plateParam, platoId } = useLocalSearchParams<{
    orderId?: string;
    plate?: string;
    platoId?: string;
  }>();
  const seeded = useMemo(() => {
    if (orderId) {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return null;
      const plates = postMedia(order);
      const picked = plates[Math.min(Number(plateParam ?? 0) || 0, plates.length - 1)] ?? plates[0];
      return { uri: picked.uri, restaurantId: order.restaurantId, caption: picked.dishName };
    }
    if (platoId) {
      const p = platos.find((v) => v.id === platoId);
      if (!p) return null;
      return { uri: p.poster, restaurantId: p.restaurantId, caption: p.dishName };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, plateParam, platoId]);

  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  // Media already hosted somewhere (a plate photo, a Plato poster) — nothing to
  // upload, just a URL to reuse. Kept separate from `asset`, which is a local
  // file that still has to be pushed to Storage.
  const [remoteUri, setRemoteUri] = useState<string | null>(seeded?.uri ?? null);
  const [isClip, setIsClip] = useState(false);
  const [caption, setCaption] = useState(seeded?.caption ?? '');
  const [restaurantId, setRestaurantId] = useState<string | undefined>(seeded?.restaurantId);
  const [audience, setAudience] = useState<Audience>('public');
  const [posting, setPosting] = useState(false);

  const previewUri = asset?.uri ?? remoteUri;

  const player = useVideoPlayer(isClip ? (asset?.uri ?? null) : null, (p) => {
    p.loop = true;
    p.muted = true;
  });
  useEffect(() => {
    if (isClip && asset?.uri) player.play();
  }, [isClip, asset?.uri, player]);

  const pickPhoto = async (camera: boolean) => {
    const picked = await pickImage({ camera });
    if (picked) {
      setAsset(picked);
      setRemoteUri(null);
      setIsClip(false);
    }
  };

  const pickClip = async (camera: boolean) => {
    // Stories are glances — a minute of video isn't one.
    const picked = await pickVideo({ camera, maxSeconds: 15 });
    if (picked) {
      setAsset(picked);
      setRemoteUri(null);
      setIsClip(true);
    }
  };

  const onPost = async () => {
    if (!previewUri || posting) return;
    setPosting(true);

    // A seeded plate photo is already a public URL — only a freshly picked local
    // file needs uploading. Falls back to the local uri so posting still works
    // in demo mode / before the bucket exists.
    let mediaUrl = previewUri;
    if (asset && userId) {
      const url = isClip
        ? await uploadVideo(userId, asset, 'stories')
        : await uploadAsset('stories', userId, asset);
      if (url) mediaUrl = url;
    }

    const story = await addStory({
      mediaUrl,
      mediaType: isClip ? 'clip' : 'image',
      caption: caption.trim(),
      restaurantId,
      visibility: audience,
    });
    setPosting(false);
    if (!story) return;
    success();
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="New story" closeMode />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {previewUri ? (
            <View style={[styles.preview, { borderColor: colors.border }]}>
              {isClip ? (
                <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
              ) : (
                <Image source={{ uri: previewUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              )}
              <Pressable
                onPress={() => {
                  setAsset(null);
                  setRemoteUri(null);
                }}
                hitSlop={8}
                style={styles.clearMedia}>
                <Ionicons name="close" size={17} color="#fff" />
              </Pressable>
              <View style={styles.expiryTag}>
                <Ionicons name="time-outline" size={12} color="#fff" />
                <Text style={styles.expiryText}>Disappears in 24 hours</Text>
              </View>
            </View>
          ) : (
            <View style={[styles.pickBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Ionicons name="camera-outline" size={30} color={colors.textMuted} />
              <Text style={[styles.pickTitle, { color: colors.text, fontFamily: displayFont }]}>
                What are you eating?
              </Text>
              <View style={styles.pickActions}>
                <PickButton icon="camera" label="Camera" onPress={() => pickPhoto(true)} />
                <PickButton icon="image-outline" label="Photo" onPress={() => pickPhoto(false)} />
                <PickButton icon="videocam-outline" label="Clip" onPress={() => pickClip(false)} />
              </View>
            </View>
          )}

          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Say something (optional)"
            placeholderTextColor={colors.textMuted}
            maxLength={140}
            multiline
            style={[
              styles.caption,
              { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
            ]}
          />

          <Text style={[styles.label, { color: colors.textMuted }]}>TAG A PLACE (OPTIONAL)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.places}>
            {restaurants.slice(0, 15).map((r) => {
              const on = restaurantId === r.id;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => {
                    tick();
                    setRestaurantId(on ? undefined : r.id);
                  }}
                  style={[
                    styles.placeChip,
                    on
                      ? { backgroundColor: colors.accent, borderColor: colors.accent }
                      : { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}>
                  <Ionicons name="location" size={12} color={on ? colors.accentText : colors.textMuted} />
                  <Text
                    style={[styles.placeChipText, { color: on ? colors.accentText : colors.text }]}
                    numberOfLines={1}>
                    {r.name}
                  </Text>
                </Pressable>
              );
            })}
            {restaurants.length === 0 && (
              <Text style={[styles.noPlaces, { color: colors.textMuted }]}>
                Places appear here once you’ve rated somewhere.
              </Text>
            )}
          </ScrollView>

          <Text style={[styles.label, { color: colors.textMuted }]}>WHO CAN SEE IT</Text>
          <View style={[styles.segments, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(['public', 'friends'] as Audience[]).map((a) => {
              const on = audience === a;
              return (
                <Pressable
                  key={a}
                  onPress={() => {
                    tick();
                    setAudience(a);
                  }}
                  style={[styles.segment, on && { backgroundColor: colors.accent }]}>
                  <Text style={[styles.segmentText, { color: on ? colors.accentText : colors.textMuted }]}>
                    {a === 'public' ? 'Everyone' : 'Friends only'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
          <Button
            label={posting ? 'Posting…' : 'Share story'}
            size="lg"
            disabled={!previewUri || posting}
            onPress={onPost}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function PickButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pickBtn,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Ionicons name={icon} size={17} color={colors.accent} />
      <Text style={[styles.pickBtnText, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  preview: {
    width: '100%',
    aspectRatio: 0.7,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  clearMedia: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expiryTag: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  expiryText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  pickBox: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 36,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  pickTitle: { fontSize: 18 },
  pickActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pickBtnText: { fontSize: 13, fontWeight: '800' },
  caption: {
    marginTop: spacing.lg,
    minHeight: 64,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 13,
    fontSize: 15,
    fontWeight: '500',
  },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginTop: spacing.xl, marginBottom: 8 },
  places: { gap: 8, paddingRight: 4 },
  placeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 190,
  },
  placeChipText: { fontSize: 12, fontWeight: '700' },
  noPlaces: { fontSize: 13, fontWeight: '500' },
  segments: { flexDirection: 'row', padding: 3, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.pill },
  segmentText: { fontSize: 13, fontWeight: '800' },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
