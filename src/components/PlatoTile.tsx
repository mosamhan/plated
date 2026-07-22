import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { RatingBadge } from '@/components/RatingBadge';
import { formatCount } from '@/components/StatPill';
import { PlatoVideo } from '@/data/platos';
import { tapLight } from '@/lib/haptics';
import { radius } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

interface Props {
  video: PlatoVideo;
  width?: number;
  /** When set, shows a bookmark that opens the Save-to picker for this plato. */
  onSave?: () => void;
  /** Drives the bookmark's filled state (collection membership). */
  savedOverride?: boolean;
}

/** Grid thumbnail for a Plato (creator video). Taps into the full-screen player. */
export function PlatoTile({ video, width, onSave, savedOverride }: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <AnimatedPressable
      onPress={() => router.push(`/plato/${video.id}`)}
      style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border, width }]}>
      <View>
        <Image
          source={{ uri: video.poster }}
          recyclingKey={video.id}
          cachePolicy="memory-disk"
          style={[styles.photo, { backgroundColor: colors.surface }]}
          contentFit="cover"
        />
        <View style={styles.playGlyph}>
          <Ionicons name="play" size={12} color="#fff" />
        </View>
        {onSave && (
          <Pressable
            onPress={() => {
              onSave();
              tapLight();
            }}
            hitSlop={8}
            style={styles.saveBtn}>
            <Ionicons
              name={savedOverride ? 'bookmark' : 'bookmark-outline'}
              size={13}
              color={savedOverride ? colors.accent : '#fff'}
            />
          </Pressable>
        )}
        <View style={styles.likes}>
          <Ionicons name="heart" size={11} color="#fff" />
          <Text style={styles.likesText}>{formatCount(video.likes)}</Text>
        </View>
        <View style={styles.badge}>
          <RatingBadge score={video.rating} size="sm" />
        </View>
      </View>
      <View style={styles.body}>
        <Text style={[styles.dish, { color: colors.text }]} numberOfLines={1}>
          {video.dishName}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {video.restaurantName}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: 3 / 4 },
  playGlyph: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    position: 'absolute',
    left: 8,
    top: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  likes: {
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
  likesText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  badge: { position: 'absolute', right: 8, bottom: 8 },
  body: { padding: 10 },
  dish: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  meta: { fontSize: 12, fontWeight: '500', marginTop: 2 },
});
