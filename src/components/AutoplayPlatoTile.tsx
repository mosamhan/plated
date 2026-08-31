import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';

import { HighlightTag } from '@/components/HighlightTag';
import { RatingBadge } from '@/components/RatingBadge';
import { formatCount } from '@/components/StatPill';
import type { PlatoVideo } from '@/data/platos';
import type { PlateHighlight } from '@/lib/highlights';
import { radius } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/** Media pane is 4:5; the body block underneath sizes to its own text. */
const MEDIA_ASPECT = 4 / 5;

/**
 * A Discover grid tile for a Plato: a live, muted, looping video with the
 * dish and restaurant in a card body beneath it.
 *
 * No play button — the video is already playing, so a play affordance would
 * be a lie. `registerTick` subscribes the tile to the section's scroll
 * heartbeat; each tick it measures its own position and starts or stops
 * itself. Coming back into view restarts from 0 rather than resuming, so a
 * clip glimpsed on the way past plays from the top when you scroll back.
 */
export function AutoplayPlatoTile({
  video,
  title,
  rating,
  width,
  highlight,
  registerTick,
}: {
  video: PlatoVideo;
  title: string;
  rating: number;
  width: number;
  highlight?: PlateHighlight;
  registerTick: (check: () => void) => () => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const viewRef = useRef<View>(null);
  const wasVisible = useRef(false);
  const player = useVideoPlayer(video.videoUrl, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    // `measureInWindow`'s callback is an async bridge round-trip — if the tile
    // unmounts while one is in flight it can still land afterward and reach
    // for a player whose native side is already torn down, which throws.
    let alive = true;
    const check = () => {
      viewRef.current?.measureInWindow((_x, y, _width, height) => {
        if (!alive || height === 0) return;
        const windowHeight = Dimensions.get('window').height;
        // Generous margins: starts a beat before it's fully on screen and
        // stops a beat after it's fully off, rather than flickering at the edge.
        const visible = y < windowHeight * 0.85 && y + height > windowHeight * 0.15;
        if (visible === wasVisible.current) return;
        wasVisible.current = visible;
        if (visible) {
          player.currentTime = 0;
          player.play();
        } else {
          player.pause();
        }
      });
    };
    const unregister = registerTick(check);
    check();
    return () => {
      alive = false;
      unregister();
    };
  }, [registerTick, player]);

  return (
    <View ref={viewRef} style={[styles.card, { width, backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable onPress={() => router.push(`/plato/${video.id}`)}>
        <View style={[styles.media, { height: width / MEDIA_ASPECT }]}>
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
          {highlight && (
            <View style={styles.highlight}>
              <HighlightTag highlight={highlight} />
            </View>
          )}
          <View style={styles.views}>
            <Ionicons name="eye" size={11} color="#fff" />
            <Text style={styles.viewsText}>{formatCount(video.views)}</Text>
          </View>
          <View style={styles.rating}>
            <RatingBadge score={rating} size="sm" />
          </View>
        </View>
        <View style={styles.body}>
          <Text style={[styles.dish, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.place, { color: colors.textMuted }]} numberOfLines={1}>
            {video.restaurantName}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  media: { width: '100%', backgroundColor: '#000' },
  highlight: { position: 'absolute', left: 8, top: 8 },
  views: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  viewsText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  rating: { position: 'absolute', right: 8, bottom: 8 },
  body: { padding: 10 },
  dish: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  place: { fontSize: 12, fontWeight: '500', marginTop: 2 },
});
