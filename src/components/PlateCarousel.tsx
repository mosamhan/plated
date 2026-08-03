import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, FlatList, NativeScrollEvent, NativeSyntheticEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import { RatingBadge } from '@/components/RatingBadge';
import { formatCount } from '@/components/StatPill';
import { foodPlaceholder } from '@/data/images';
import type { PostMedia } from '@/data/types';
import { displayFont } from '@/theme/fonts';

/**
 * A post's plates as a swipeable carousel — one page per dish, each carrying
 * its own name and rating in the bottom scrim.
 *
 * Top-right shows a position pill (`2/3`) that flashes on every swipe, so the
 * count is always legible without cluttering a single-photo post (it and the
 * dots only appear when there's more than one plate).
 */
export function PlateCarousel({
  media,
  onPress,
  reorders = 0,
  colorSurface,
}: {
  media: PostMedia[];
  /** Tap on a page — same handler for every page (open post / double-tap like). */
  onPress: () => void;
  /** Post-level reorder count, shown under the dish name when > 0. */
  reorders?: number;
  colorSurface: string;
}) {
  // Page width is measured rather than derived from feed padding, so the
  // carousel is correct wherever it's dropped in.
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const flash = useRef(new Animated.Value(1)).current;

  const clamped = Math.min(index, media.length - 1);
  const current = media[clamped] ?? media[0];
  const multi = media.length > 1;

  // Flash the counter on each page change: snap bright + slightly enlarged,
  // then settle. Reads as a blink drawing the eye to "you moved a page".
  useEffect(() => {
    flash.setValue(0);
    Animated.timing(flash, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [clamped, flash]);

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <FlatList
          data={media}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => String(i)}
          onMomentumScrollEnd={onEnd}
          renderItem={({ item }) => (
            <Pressable onPress={onPress}>
              <Image
                source={{ uri: item.uri }}
                placeholder={foodPlaceholder(item.uri)}
                placeholderContentFit="cover"
                transition={{ duration: 250, effect: 'cross-dissolve', timing: 'ease-out' }}
                cachePolicy="memory-disk"
                style={[styles.photo, { width, backgroundColor: colorSurface }]}
                contentFit="cover"
              />
            </Pressable>
          )}
        />
      ) : (
        // Before the first layout pass, render page one so there's no blank flash.
        <Pressable onPress={onPress}>
          <Image
            source={{ uri: media[0].uri }}
            placeholder={foodPlaceholder(media[0].uri)}
            placeholderContentFit="cover"
            style={[styles.photo, { width: '100%', backgroundColor: colorSurface }]}
            contentFit="cover"
          />
        </Pressable>
      )}

      {/* Per-plate label — changes as you swipe. */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.38)', 'rgba(0,0,0,0.78)']}
        locations={[0, 0.5, 1]}
        style={styles.scrim}
        pointerEvents="none"
      />
      <View style={styles.scrimContent} pointerEvents="none">
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={[styles.dish, { fontFamily: displayFont }]} numberOfLines={2}>
            {current.dishName}
          </Text>
          {reorders > 0 && (
            <View style={styles.reorderRow}>
              <Ionicons name="repeat" size={13} color="#FFD98A" />
              <Text style={styles.reorderText}>{formatCount(reorders)} reordered this plate</Text>
            </View>
          )}
        </View>
        <RatingBadge score={current.rating} size="md" />
      </View>

      {multi && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.counter,
            {
              opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
              transform: [{ scale: flash.interpolate({ inputRange: [0, 1], outputRange: [1.25, 1] }) }],
            },
          ]}>
          <Text style={styles.counterText}>
            {clamped + 1}/{media.length}
          </Text>
        </Animated.View>
      )}

      {multi && (
        <View style={styles.dots} pointerEvents="none">
          {media.map((_, i) => (
            <View key={i} style={[styles.dot, { opacity: i === clamped ? 1 : 0.4 }]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  photo: { aspectRatio: 0.92 },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '58%' },
  scrimContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  dish: { color: '#fff', fontSize: 22, lineHeight: 26 },
  reorderRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  reorderText: { color: '#FFD98A', fontSize: 12, fontWeight: '700' },
  counter: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  counterText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  dots: {
    position: 'absolute',
    top: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
});
