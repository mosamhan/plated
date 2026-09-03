import { useState } from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { ZoomableImage } from '@/components/ZoomableImage';

/**
 * A multi-photo message bubble — same swipeable-page + dot-indicator pattern
 * as `PlateCarousel.tsx` (a multi-plate post's carousel), just without the
 * dish-name/rating scrim a chat photo has no use for. Each page keeps its own
 * pinch-zoom via `ZoomableImage`, same as a single-photo message already had.
 */
export function PhotoAlbumCarousel({
  uris,
  style,
  onIndexChange,
}: {
  uris: string[];
  style?: StyleProp<ViewStyle>;
  /** Which page is on screen — so a tap-to-open-full-screen opens on that page. */
  onIndexChange?: (index: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width === 0) return;
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(next);
    onIndexChange?.(next);
  };

  return (
    <View style={[styles.wrap, style]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <FlatList
          data={uris}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(uri, i) => `${uri}-${i}`}
          onMomentumScrollEnd={onEnd}
          renderItem={({ item }) => (
            <ZoomableImage uri={item} style={{ width, height: '100%' }} contentFit="cover" />
          )}
        />
      )}

      <View style={styles.counter} pointerEvents="none">
        <Text style={styles.counterText}>
          {index + 1}/{uris.length}
        </Text>
      </View>

      <View style={styles.dots} pointerEvents="none">
        {uris.map((_, i) => (
          <View key={i} style={[styles.dot, { opacity: i === index ? 1 : 0.4 }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', overflow: 'hidden' },
  counter: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  counterText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  dots: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#fff' },
});
