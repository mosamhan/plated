import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { OrderProviderSheet } from '@/components/OrderProviderSheet';
import { PlatoCommentsSheet } from '@/components/PlatoCommentsSheet';
import { RatingBadge } from '@/components/RatingBadge';
import { formatCount } from '@/components/StatPill';
import { PlatoVideo } from '@/data/platos';
import { tapLight, tapMedium } from '@/lib/haptics';
import { buildPlatoShareMessage } from '@/lib/invite';
import { usePlatos } from '@/store/PlatosContext';
import { displayFont } from '@/theme/fonts';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

interface Props {
  video: PlatoVideo;
  active: boolean;
  height: number;
  bottomInset: number;
}

export function PlatoReel({ video, active, height, bottomInset }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const { isLiked, toggleLike } = usePlatos();
  const player = useVideoPlayer(video.videoUrl, (p) => {
    p.loop = true;
    p.muted = false;
  });
  const [paused, setPaused] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const liked = isLiked(video.id);

  // Only the active (visible) reel plays.
  useEffect(() => {
    if (active && !paused) player.play();
    else player.pause();
  }, [active, paused, player]);

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
        style={[styles.scrim, { height: height * 0.5 }]}
        pointerEvents="none"
      />

      {/* Right action rail */}
      <View style={[styles.rail, { bottom: bottomInset + 24 }]}>
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
        {railBtn('bag-handle', 'Order', () => {
          tapMedium();
          setSheet(true);
        })}
        {railBtn('arrow-redo', 'Share', onShare)}
      </View>

      {/* Bottom-left info */}
      <View style={[styles.info, { bottom: bottomInset + 20 }]}>
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

        <View style={styles.dishRow}>
          <Text style={[styles.dish, { fontFamily: displayFont }]} numberOfLines={1}>{video.dishName}</Text>
          <RatingBadge score={video.rating} size="sm" />
        </View>
        <Text style={styles.restaurant} numberOfLines={1}>
          <Ionicons name="location" size={12} color="#FFD98A" /> {video.restaurantName}
        </Text>
        <Text style={styles.caption} numberOfLines={2}>{video.caption}</Text>
      </View>

      <OrderProviderSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        restaurantName={video.restaurantName}
        dishName={video.dishName}
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
  restaurant: { color: '#FFD98A', fontSize: 13, fontWeight: '700', marginTop: 4 },
  caption: { color: 'rgba(255,255,255,0.92)', fontSize: 14, fontWeight: '500', marginTop: 8, lineHeight: 19 },
});
