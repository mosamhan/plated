import { useEffect } from 'react';
import { Image, ImageProps } from 'expo-image';
import { Pressable, StyleSheet } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { useMediaZoom } from '@/hooks/useMediaZoom';
import { useZoomPortal } from '@/components/ZoomPortal';

/**
 * Instagram-style pinch-to-zoom, kept to two fingers on purpose: pinch and
 * pan-while-zoomed both require exactly two pointers, so a single-finger tap
 * or swipe — the double-tap-to-like, the carousel's horizontal paging, the
 * feed's vertical scroll — never has to fight this for the gesture.
 *
 * Starting a pinch expands the photo full-screen over a dimmed backdrop
 * (via ZoomPortal) instead of zooming in place — in place, an unclipped
 * transform can bleed into whatever's next to this card.
 */
export function ZoomableImage({ uri, style, ...imageProps }: { uri: string } & Omit<ImageProps, 'source'>) {
  const { gesture, zoomed, sourceStyle, portalContentStyle, backdropStyle, requestClose } = useMediaZoom();
  const setPortalContent = useZoomPortal();

  useEffect(() => {
    if (!zoomed) {
      setPortalContent(null);
      return;
    }
    setPortalContent(
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
        pointerEvents={zoomed ? 'auto' : 'none'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} />
        <Animated.View style={[styles.portalImageWrap, portalContentStyle]} pointerEvents="none">
          <Image source={{ uri }} style={styles.portalImage} contentFit="contain" />
        </Animated.View>
      </Animated.View>,
    );
    return () => setPortalContent(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomed, uri]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[style, styles.wrap, sourceStyle]}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} {...imageProps} />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  // A dim scrim, not a solid takeover — like Instagram's feed-photo zoom,
  // where the rest of the screen stays faintly visible behind the photo.
  backdrop: { backgroundColor: 'rgba(0,0,0,0.75)' },
  portalImageWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  portalImage: { flex: 1 },
});
