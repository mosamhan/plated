import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';

import { OrderProviderSheet } from '@/components/OrderProviderSheet';
import { PlatoCommentsSheet } from '@/components/PlatoCommentsSheet';
import { PlatoControlsSheet } from '@/components/PlatoControlsSheet';
import { RatingBadge } from '@/components/RatingBadge';
import { SendToSheet } from '@/components/SendToSheet';
import { VideoScrubber } from '@/components/VideoScrubber';
import { formatCount } from '@/components/StatPill';
import { PlatoVideo } from '@/data/platos';
import { collabLabel } from '@/lib/collabs';
import { showAlert } from '@/lib/dialog';
import { success, tapLight, tapMedium, warn } from '@/lib/haptics';
import { buildPlatoShareMessage, platoLink } from '@/lib/invite';
import { usePlatoPlaybackSettings } from '@/lib/platoPlaybackSettings';
import { useCollections } from '@/store/CollectionsContext';
import { useData } from '@/store/DataContext';
import { usePlatos } from '@/store/PlatosContext';
import { displayFont } from '@/theme/fonts';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const DOUBLE_TAP_MS = 220;

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
  /** Auto-scroll (from the long-press controls sheet) reached the end of this reel. */
  onEnded?: () => void;
}

export function PlatoReel({ video, active, height, bottomInset, onRestaurantPress, onEnded }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const { isLiked, toggleLike, recordView, excludePlato } = usePlatos();
  const { userFor, restaurantFor } = useData();
  const platoRestaurant = video.restaurantId ? restaurantFor(video.restaurantId) : undefined;
  const collabs = collabLabel(video.collaborators, (id) => userFor(id).handle);
  const { openSaveSheet, isSaved } = useCollections();
  const { speed, autoScroll } = usePlatoPlaybackSettings();
  const player = useVideoPlayer(video.videoUrl, (p) => {
    p.loop = true;
    p.muted = false;
  });
  const [paused, setPaused] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // "Clear display" from the long-press sheet — stays hidden until the next
  // single tap on the video, the same way TikTok's own clear-display works.
  const [manualClear, setManualClear] = useState(false);
  // The plates this one video covers. Swiping the label moves between them; the
  // video keeps playing. Falls back to the single dish for legacy Platos.
  const plates = video.plates?.length ? video.plates : [{ dishName: video.dishName, rating: video.rating }];
  const [plateIdx, setPlateIdx] = useState(0);
  const [labelW, setLabelW] = useState(0);
  // While scrubbing, clear the overlay chrome so the video is unobstructed —
  // like TikTok. The scrubber itself stays.
  const [scrubbing, setScrubbing] = useState(false);
  // Holding a two-finger pinch clears everything, including the scrubber —
  // unlike scrubbing, there's nothing left to interact with while zoomed.
  const [zooming, setZooming] = useState(false);
  const chromeHidden = scrubbing || zooming || manualClear;
  const [burst, setBurst] = useState(false);
  const lastTap = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Double-tap anywhere on the video likes the Plato (with a heart burst),
  // like Instagram/TikTok; a single tap still play/pauses. The rail buttons
  // stay single-tap. A short timer disambiguates the two.
  const onTapVideo = () => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      lastTap.current = 0;
      if (!liked) toggleLike(video.id); // double-tap only ever likes, never un-likes
      tapLight();
      setBurst(true);
      setTimeout(() => setBurst(false), 650);
    } else {
      lastTap.current = now;
      singleTapTimer.current = setTimeout(() => {
        singleTapTimer.current = null;
        lastTap.current = 0;
        setPaused((p) => !p);
        // A tap after "Clear display" brings the chrome back, same as TikTok.
        setManualClear(false);
      }, DOUBLE_TAP_MS);
    }
  };

  // Two-finger hold-to-zoom, TikTok/Instagram-style: scale and pan follow the
  // pinch while it's held, chrome hides, playback never pauses — and it all
  // springs back the moment the fingers lift. Stays in place (rather than a
  // full-screen portal like the photo viewer) since a reel already fills the
  // screen — swapping contentFit to show the whole frame during a takeover
  // just made the crop/resolution jump oddly.
  const zoomScale = useSharedValue(1);
  const zoomX = useSharedValue(0);
  const zoomY = useSharedValue(0);
  const savedZoomX = useSharedValue(0);
  const savedZoomY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onStart(() => runOnJS(setZooming)(true))
    .onUpdate((e) => {
      zoomScale.value = Math.min(Math.max(e.scale, 1), 4);
    })
    .onEnd(() => {
      zoomScale.value = withSpring(1);
      zoomX.value = withSpring(0);
      zoomY.value = withSpring(0);
      savedZoomX.value = 0;
      savedZoomY.value = 0;
      runOnJS(setZooming)(false);
    });

  const zoomPan = Gesture.Pan()
    .minPointers(2)
    .maxPointers(2)
    .onUpdate((e) => {
      if (zoomScale.value <= 1) return;
      zoomX.value = savedZoomX.value + e.translationX;
      zoomY.value = savedZoomY.value + e.translationY;
    })
    .onEnd(() => {
      savedZoomX.value = zoomX.value;
      savedZoomY.value = zoomY.value;
    });

  const zoomGesture = Gesture.Simultaneous(pinch, zoomPan);

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: zoomX.value }, { translateY: zoomY.value }, { scale: zoomScale.value }],
  }));

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

  // Speed and auto-scroll are global preferences (the controls sheet's own
  // Speed/Auto scroll rows), applied to whichever reel is mounted. `player`
  // is expo-video's own imperative handle — setting its properties directly
  // is the documented way to control it, not React state the immutability
  // rule can see through.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    player.playbackRate = speed;
  }, [player, speed]);

  // With auto-scroll on, the reel should hand off to the next one instead of
  // looping — `loop` has to come off for `playToEnd` to mean "really done"
  // rather than "about to silently restart".
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    player.loop = !autoScroll;
  }, [player, autoScroll]);

  // Guards against advancing on whatever position happened to be left when
  // Auto scroll was turned on mid-loop — flipping `loop` off right then
  // makes the *very next* natural end fire `playToEnd`, which could be only
  // a few seconds away if the video was already most of the way through its
  // current pass. "Auto scroll" should mean the reel played all the way
  // through, not "whatever was left of an already-in-progress loop", so a
  // `playToEnd` is only honored once playback has actually passed through
  // the start since auto-scroll became active for this reel.
  const seenStart = useRef(player.currentTime < 0.5);
  useEffect(() => {
    if (autoScroll) seenStart.current = player.currentTime < 0.5;
  }, [autoScroll, player]);
  useEffect(() => {
    const subscription = player.addListener('timeUpdate', ({ currentTime }) => {
      if (currentTime < 0.5) seenStart.current = true;
    });
    return () => subscription.remove();
  }, [player]);

  useEffect(() => {
    const subscription = player.addListener('playToEnd', () => {
      // `loop` is off whenever autoScroll is on, so nothing restarts this on
      // its own — if this end doesn't count yet (the partial-remainder
      // case above), replay it from the top ourselves rather than leaving
      // the reel frozen on its last frame with no advance and no loop.
      if (!autoScroll) return;
      if (seenStart.current) {
        onEnded?.();
        seenStart.current = false;
      } else {
        player.currentTime = 0;
        player.play();
        seenStart.current = true;
      }
    });
    return () => subscription.remove();
  }, [player, autoScroll, onEnded]);

  // Send-to first — a Plato is the most "you have to watch this" thing in the
  // app. The system share sheet is one tap inside it.
  const onShare = () => {
    tapLight();
    setSendOpen(true);
  };
  const platoShareMessage = buildPlatoShareMessage({
    platoId: video.id,
    dishName: video.dishName,
    restaurantName: video.restaurantName,
    creatorHandle: video.creatorHandle,
    rating: video.rating,
    earns: video.monetizable,
  });

  // Long-press controls sheet actions.
  const onAddToStoryFromControls = () => {
    tapLight();
    router.push({ pathname: '/create-story', params: { platoId: video.id } });
  };

  const onDownloadVideo = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        showAlert(
          'Photo library access needed',
          "Plated can't save this video without permission — enable it in Settings and try again.",
        );
        return;
      }
      const target = `${FileSystem.cacheDirectory}${Date.now()}.mp4`;
      const { uri: localUri } = await FileSystem.downloadAsync(video.videoUrl, target);
      await MediaLibrary.saveToLibraryAsync(localUri);
      success();
    } catch (e) {
      if (__DEV__) console.warn('[Plated] plato download failed', e);
      showAlert('Couldn’t save that video', 'Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const onExcludeFromTasteProfile = () => {
    tapLight();
    excludePlato(video.id);
  };

  const onReportPlato = () => {
    warn();
    router.push(`/report?targetType=plato&targetId=${video.id}`);
  };

  const railBtn = (icon: keyof typeof Ionicons.glyphMap, label: string, onPress: () => void, tint?: string) => (
    <Pressable style={styles.railBtn} onPress={onPress} hitSlop={6}>
      <Ionicons name={icon} size={30} color={tint ?? '#fff'} />
      <Text style={styles.railLabel}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ height, backgroundColor: '#000', overflow: 'hidden' }}>
      {/* Poster shows instantly while the video buffers */}
      <Image source={{ uri: video.poster }} style={StyleSheet.absoluteFill} contentFit="cover" />

      {/* Single tap → play/pause; double tap → like (with heart burst); a
          two-finger pinch held anywhere on the video zooms it in place; a
          long press opens the controls sheet (speed, auto scroll, report,
          download, …) — TikTok's own long-press-to-open-menu gesture. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onTapVideo}
        onLongPress={() => {
          tapMedium();
          setControlsOpen(true);
        }}>
        <GestureDetector gesture={zoomGesture}>
          <Animated.View style={[StyleSheet.absoluteFill, zoomStyle]}>
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              nativeControls={false}
            />
          </Animated.View>
        </GestureDetector>
        {paused && (
          <View style={styles.pauseWrap} pointerEvents="none">
            <Ionicons name="play" size={64} color="rgba(255,255,255,0.85)" />
          </View>
        )}
      </Pressable>

      {/* Bottom scrim */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={[styles.scrim, { height: height * 0.5, opacity: chromeHidden ? 0 : 1 }]}
        pointerEvents="none"
      />

      {/* Right action rail — hidden while scrubbing or zoomed so the video is clear. */}
      <View style={[styles.rail, { bottom: bottomInset + 24, opacity: chromeHidden ? 0 : 1 }]} pointerEvents={chromeHidden ? 'none' : 'auto'}>
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

      {/* Bottom-left info — cleared while scrubbing or zoomed. */}
      <View style={[styles.info, { bottom: bottomInset + 20, opacity: chromeHidden ? 0 : 1 }]} pointerEvents={chromeHidden ? 'none' : 'auto'}>
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

      {/* Double-tap like burst — above the video, below the rail's reach. */}
      {burst && (
        <View style={styles.burstWrap} pointerEvents="none">
          <Animated.View entering={ZoomIn.springify().damping(10)} exiting={ZoomOut.duration(250)}>
            <Ionicons name="heart" size={96} color="#fff" style={styles.burstHeart} />
          </Animated.View>
        </View>
      )}

      {/* TikTok-style seek bar, flush to the bottom of the reel — hidden
          entirely while zoomed, unlike scrubbing, since there's nothing to
          drag while both hands are busy pinching. */}
      {!zooming && (
        <VideoScrubber player={player} bottom={bottomInset} onScrubbingChange={setScrubbing} />
      )}

      <OrderProviderSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        restaurantName={video.restaurantName}
        restaurantLocation={platoRestaurant?.location}
        dishName={plates[plateIdx]?.dishName ?? video.dishName}
        plates={plates}
        priceLevel={platoRestaurant?.priceLevel}
        orderMode={platoRestaurant?.orderMode}
        reservationPlatform={platoRestaurant?.reservationPlatform}
        reservationUrl={platoRestaurant?.reservationUrl}
        externalOrderUrl={platoRestaurant?.externalOrderUrl}
        doordashStoreUrl={platoRestaurant?.doordashStoreUrl}
        ubereatsStoreUrl={platoRestaurant?.ubereatsStoreUrl}
        creatorHandle={video.creatorHandle}
        supportsCreator={video.compensationEligible}
        restaurantId={platoRestaurant?.id}
        creatorId={video.creatorId}
      />

      <PlatoCommentsSheet
        platoId={video.id}
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
      />

      <SendToSheet
        visible={sendOpen}
        onClose={() => setSendOpen(false)}
        payload={{
          kind: 'plato',
          attachmentId: video.id,
          shareMessage: platoShareMessage,
          link: platoLink(video.id),
          label: `@${video.creatorHandle}’s Plato`,
        }}
      />

      <PlatoControlsSheet
        visible={controlsOpen}
        onClose={() => setControlsOpen(false)}
        onAddToStory={onAddToStoryFromControls}
        onDownload={onDownloadVideo}
        onExclude={onExcludeFromTasteProfile}
        onReport={onReportPlato}
        onClearDisplay={() => setManualClear(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pauseWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  burstWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  burstHeart: { textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 2 } },
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
