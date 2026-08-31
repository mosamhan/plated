import { useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const MAX_SCALE = 4;

/**
 * Instagram-style pinch-to-zoom: two fingers only, so a single-finger tap,
 * the carousel's horizontal paging, and the feed's vertical scroll never have
 * to fight this for the gesture. Starting a pinch expands the content
 * full-screen over a dimmed backdrop (rendered via ZoomPortal — see there for
 * why not a Modal); releasing under the zoom threshold springs it back into
 * place. `collapse` must stay a worklet and inlined-callable from `onEnd`
 * (a UI-thread worklet) — calling a plain JS function from there throws
 * "Tried to synchronously call a non-worklet function on the UI thread"
 * under react-native-worklets 0.8.
 *
 * `sticky` (default true) controls what happens on release: sticky content
 * (feed photos) stays zoomed once you've pinched past the threshold, like the
 * Photos app; non-sticky content (Plato video) always springs back the
 * moment fingers lift, like TikTok/Instagram's hold-to-zoom.
 */
export function useMediaZoom({ sticky = true }: { sticky?: boolean } = {}) {
  const [zoomed, setZoomed] = useState(false);
  const entrance = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const collapse = () => {
    'worklet';
    scale.value = withSpring(1);
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    entrance.value = withSpring(0, undefined, (finished) => {
      if (finished) runOnJS(setZoomed)(false);
    });
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      runOnJS(setZoomed)(true);
      entrance.value = withSpring(1);
    })
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 1), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (!sticky || scale.value <= 1.02) collapse();
    });

  const pan = Gesture.Pan()
    .minPointers(2)
    .maxPointers(2)
    .onUpdate((e) => {
      if (savedScale.value <= 1) return;
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const gesture = Gesture.Simultaneous(pinch, pan);

  // Applied to the ORIGINAL in-place content, which is faded out (not
  // unmounted, so video keeps buffering/playing) once zoomed.
  const sourceStyle = useAnimatedStyle(() => ({
    opacity: 1 - entrance.value,
  }));

  // Applied to the full-screen portal copy — a slight scale-in on entrance,
  // then the live pinch scale/pan on top of that.
  const portalContentStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value * (0.9 + entrance.value * 0.1) },
    ],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
  }));

  const requestClose = () => {
    collapse();
  };

  return { gesture, zoomed, sourceStyle, portalContentStyle, backdropStyle, requestClose };
}
