import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { PostOptionsSheet } from '@/components/PostOptionsSheet';
import { RatingBadge } from '@/components/RatingBadge';
import { formatCount } from '@/components/StatPill';
import { PlatoVideo } from '@/data/platos';
import { useData } from '@/store/DataContext';
import { usePlatos } from '@/store/PlatosContext';
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
  /** Show the "⋯" manage menu (own profile only): audience / archive / delete. */
  manageable?: boolean;
  /**
   * A specific plate from this Plato to front instead of the headline dish —
   * for a multi-plate Plato expanded into one tile per plate (see
   * `expandPlatoPlates`), so a tile titled "Lobster Roll" still opens the one
   * video, just with that dish (and its own rating) as the title shown.
   */
  titleOverride?: string;
  ratingOverride?: number;
}

/** Grid thumbnail for a Plato (creator video). Taps into the full-screen player. */
export function PlatoTile({ video, width, onSave, savedOverride, manageable, titleOverride, ratingOverride }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const { currentUser } = useData();
  const { deletePlato, setPlatoVisibility, setPlatoArchived } = usePlatos();
  const [optionsOpen, setOptionsOpen] = useState(false);

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
          <Ionicons name="play" size={16} color="#fff" />
        </View>
        {manageable && (
          <Pressable onPress={() => setOptionsOpen(true)} hitSlop={8} style={styles.manageBtn}>
            <Ionicons name="ellipsis-horizontal" size={15} color="#fff" />
          </Pressable>
        )}
        {video.archived && (
          <View style={styles.archived}>
            <Ionicons name="archive" size={9} color="#fff" />
            <Text style={styles.archivedText}>Archived</Text>
          </View>
        )}
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
        {/* Views rather than likes: on a creator's grid, reach is the number that
            says how a Plato did — and the reel already shows likes on its rail. */}
        <View style={styles.views}>
          <Ionicons name="eye" size={11} color="#fff" />
          <Text style={styles.viewsText}>{formatCount(video.views)}</Text>
        </View>
        <View style={styles.badge}>
          <RatingBadge score={ratingOverride ?? video.rating} size="sm" />
        </View>
      </View>
      <View style={styles.body}>
        <Text style={[styles.dish, { color: colors.text }]} numberOfLines={1}>
          {titleOverride ?? video.dishName}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {video.restaurantName}
        </Text>
      </View>
      {manageable && (
        <PostOptionsSheet
          visible={optionsOpen}
          onClose={() => setOptionsOpen(false)}
          isOwner={video.creatorId === currentUser.id}
          visibility={video.visibility ?? 'public'}
          archived={!!video.archived}
          reportTarget={`/report?targetType=plato&targetId=${video.id}`}
          onSetVisibility={(v) => setPlatoVisibility(video.id, v)}
          onSetArchived={(a) => setPlatoArchived(video.id, a)}
          onDelete={() => deletePlato(video.id)}
        />
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: 3 / 4 },
  playGlyph: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageBtn: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  archived: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.62)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  archivedText: { color: '#fff', fontSize: 9, fontWeight: '800' },
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
  badge: { position: 'absolute', right: 8, bottom: 8 },
  body: { padding: 10 },
  dish: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  meta: { fontSize: 12, fontWeight: '500', marginTop: 2 },
});
