import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { OrderProviderSheet } from '@/components/OrderProviderSheet';
import { PlatoCommentsSheet } from '@/components/PlatoCommentsSheet';
import { RatingBadge } from '@/components/RatingBadge';
import { VideoScrubber } from '@/components/VideoScrubber';
import { formatCount } from '@/components/StatPill';
import { PlatoVideo } from '@/data/platos';
import { collabLabel } from '@/lib/collabs';
import { tapLight, tapMedium } from '@/lib/haptics';
import { buildPlatoShareMessage } from '@/lib/invite';
import { useCollections } from '@/store/CollectionsContext';
import { useData } from '@/store/DataContext';
import { usePlatos } from '@/store/PlatosContext';
import { displayFont } from '@/theme/fonts';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

interface Props {
  video: PlatoVideo;
  active: boolean;
  height: number;
  bottomInset: number;
  /**
   * Opens the restaurant behind the reel — the same sheet a map pin opens. Only
   * called for Platos tied to a saved row; a Foursquare-only Plato has just a
   * name, so there is nothing to open and the line stays plain text.
   */
  onRestaurantPress?: (restaurantId: string) => void;
}

export function PlatoReel({ video, active, height, bottomInset, onRestaurantPress }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const { isLiked, toggleLike, recordView } = usePlatos();
  const { userFor, restaurantFor } = useData();
  const platoRestaurant = video.restaurantId ? restaurantFor(video.restaurantId) : undefined;
  const collabs = collabLabel(video.collaborators, (id) => userFor(id).handle);
  const { openSaveSheet, isSaved } = useCollections();
  const player = useVideoPlayer(video.videoUrl, (p) => {
    p.loop = true;
    p.muted = false;
  });
  const [paused, setPaused] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  // The plates this one video covers. Swiping the label moves between them; the
  // video keeps playing. Falls back to the single dish for legacy Platos.
  const plates = video.plates?.length ? video.plates : [{ dishName: video.dishName, rating: video.rating }];
  const [plateIdx, setPlateIdx] = useState(0);
  const [labelW, setLabelW] = useState(0);
  // While scrubbing, clear the overlay chrome so the video is unobstructed —
  // like TikTok. The scrubber itself stays.
  const [scrubbing, setScrubbing] = useState(false);
  const liked = isLiked(video.id);
  const platoSaved = isSaved({ type: 'plato', id: video.id });
  const { restaurantId } = video;
  const openRestaurant =
    onRestaurantPress && restaurantId
      ? () => {
          tapLight();
          onRestaurantPress(restaurantId);
        }
      : undefined;

  // Only the active (visible) reel plays.
  useEffect(() => {
    if (active && !paused) player.play();
    else player.pause();
  }, [active, paused, player]);

  // A view is "this reel became the visible one" — recordView dedupes, so
  // swiping back and forth doesn't keep counting.
  useEffect(() => {
    if (active) recordView(video.id);
  }, [active, video.id, recordView]);

  const onShare = () => {
    tapLight();
    Share.share({
      message: buildPlatoShareMessage({
        dishName: video.dishName,
        restaurantName: video.restaurantName,
        creatorHandle: video.creatorHandle,
        rating: video.rating,
        earns: video.compensationEligible,
      }),
    }).catch(() => {});
  };

  const railBtn = (icon: keyof typeof Ionicons.glyphMap, label: string, onPress: () => void, tint?: string) => (
    <Pressable style={styles.railBtn} onPress={onPress} hitSlop={6}>
      <Ionicons name={icon} size={30} color={tint ?? '#fff'} />
      <Text style={styles.railLabel}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ height, backgroundColor: '#000' }}>
      {/* Poster shows instantly while the video buffers */}
      <Image source={{ uri: video.poster }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />

      {/* Tap to play/pause */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setPaused((p) => !p)}>
        {paused && (
          <View style={styles.pauseWrap} pointerEvents="none">
            <Ionicons name="play" size={64} color="rgba(255,255,255,0.85)" />
          </View>
        )}
      </Pressable>

      {/* Bottom scrim */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={[styles.scrim, { height: height * 0.5, opacity: scrubbing ? 0 : 1 }]}
        pointerEvents="none"
      />

      {/* Right action rail — hidden while scrubbing so the video is clear. */}
      <View style={[styles.rail, { bottom: bottomInset + 24, opacity: scrubbing ? 0 : 1 }]} pointerEvents={scrubbing ? 'none' : 'auto'}>
        {railBtn(
          liked ? 'heart' : 'heart-outline',
          formatCount(video.likes),
          () => {
            toggleLike(video.id);
            tapLight();
          },
          liked ? '#FF4D6D' : '#fff',
        )}
        {railBtn('chatbubble-ellipses', formatCount(video.comments), () => {
          tapLight();
          setCommentsOpen(true);
        })}
        {railBtn(
          platoSaved ? 'bookmark' : 'bookmark-outline',
          'Save',
          () => {
            openSaveSheet({ type: 'plato', id: video.id });
            tapLight();
          },
          platoSaved ? colors.accent : '#fff',
        )}
        {railBtn('bag-handle', 'Order', () => {
          tapMedium();
          setSheet(true);
        })}
        {railBtn('arrow-redo', 'Share', onShare)}
      </View>

      {/* Bottom-left info — cleared while scrubbing. */}
      <View style={[styles.info, { bottom: bottomInset + 20, opacity: scrubbing ? 0 : 1 }]} pointerEvents={scrubbing ? 'none' : 'auto'}>
        <Pressable style={styles.creatorRow} onPress={() => router.push(`/user/${video.creatorId}`)}>
          <Image source={{ uri: video.avatar }} style={styles.avatar} contentFit="cover" />
          <Text style={styles.creatorName}>{video.creatorName}</Text>
          {video.verified && <Ionicons name="checkmark-circle" size={15} color="#fff" />}
          {video.compensationEligible && (
            <View style={styles.commission}>
              <Text style={styles.commissionText}>Earns commission</Text>
            </View>
          )}
        </Pressable>

        {/* Plate label — one page per plate; swipe to move between the dishes
            this video covers. The video doesn't change. */}
        <View onLayout={(e) => setLabelW(e.nativeEvent.layout.width)}>
          {labelW > 0 && (
            <FlatList
              data={plates}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(_, i) => String(i)}
              onMomentumScrollEnd={(e) =>
                setPlateIdx(Math.round(e.nativeEvent.contentOffset.x / labelW))
              }
              renderItem={({ item }) => (
                <View style={[styles.dishRow, { width: labelW }]}>
                  <Text style={[styles.dish, { fontFamily: displayFont }]} numberOfLines={1}>
                    {item.dishName}
                  </Text>
                  <RatingBadge score={item.rating} size="sm" />
                </View>
              )}
            />
          )}
          {plates.length > 1 && (
            <View style={styles.plateDots}>
              {plates.map((_, i) => (
                <View key={i} style={[styles.plateDot, { opacity: i === plateIdx ? 1 : 0.4 }]} />
              ))}
            </View>
          )}
        </View>
        <Text style={styles.restaurant} numberOfLines={1}>
          {/* Nested rather than wrapped in a Pressable so the line keeps its
              inline layout and truncation, and only the restaurant reacts —
              not the collaborator suffix trailing it. */}
          <Text onPress={openRestaurant} suppressHighlighting={!openRestaurant}>
            <Ionicons name="location" size={12} color="#FFD98A" /> {video.restaurantName}
          </Text>
          {collabs ? ` · with ${collabs}` : ''}
        </Text>
        <Text style={styles.caption} numberOfLines={2}>{video.caption}</Text>
      </View>

      {/* TikTok-style seek bar, flush to the bottom of the reel. */}
      <VideoScrubber player={player} bottom={bottomInset} onScrubbingChange={setScrubbing} />

      <OrderProviderSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        restaurantName={video.restaurantName}
        restaurantLocation={platoRestaurant?.location}
        dishName={plates[plateIdx]?.dishName ?? video.dishName}
        plates={plates}
        priceLevel={platoRestaurant?.priceLevel}
        creatorHandle={video.creatorHandle}
        supportsCreator={video.compensationEligible}
      />

      <PlatoCommentsSheet
        platoId={video.id}
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pauseWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  rail: { position: 'absolute', right: 12, alignItems: 'center', gap: 20 },
  railBtn: { alignItems: 'center', gap: 3 },
  railLabel: { color: '#fff', fontSize: 11, fontWeight: '700' },
  info: { position: 'absolute', left: spacing.lg, right: 84 },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: '#fff' },
  creatorName: { color: '#fff', fontSize: 15, fontWeight: '800' },
  commission: { backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  commissionText: { color: '#FFD98A', fontSize: 10, fontWeight: '800' },
  dishRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dish: { color: '#fff', fontSize: 24, letterSpacing: -0.3, flexShrink: 1 },
  plateDots: { flexDirection: 'row', gap: 5, marginTop: 6 },
  plateDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  restaurant: { color: '#FFD98A', fontSize: 13, fontWeight: '700', marginTop: 4 },
  caption: { color: 'rgba(255,255,255,0.92)', fontSize: 14, fontWeight: '500', marginTop: 8, lineHeight: 19 },
});
