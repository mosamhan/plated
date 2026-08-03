import { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder } from 'react-native';

/**
 * Drag-down-to-dismiss for a bottom sheet.
 *
 * The sheets already draw a grabber pill at the top, which reads as "drag me" —
 * this makes that true rather than decorative, so the X isn't the only way out.
 *
 * Attach `panHandlers` to the sheet's header area (the hero/grabber), never to
 * the whole sheet: the body scrolls, and a responder over it would fight the
 * ScrollView for vertical drags.
 *
 * Plain Animated + PanResponder rather than Reanimated/gesture-handler — this
 * lives inside a `Modal`, where gesture-handler needs its own provider inside
 * the modal tree to receive touches, and the interaction is a single axis.
 */
export function useSheetDismiss(onClose: () => void, visible: boolean) {
  const translateY = useRef(new Animated.Value(0)).current;

  // Reopening reuses the same component, so a sheet dismissed by drag would
  // otherwise come back still translated off-screen.
  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [visible, translateY]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Claimed on touch-START, not on move. The sheet body is wrapped in a
        // Pressable (it has to be, or taps on inert areas fall through to the
        // backdrop and close it), and that Pressable becomes the responder the
        // moment a finger lands. React Native does not re-negotiate the
        // responder on subsequent moves, so a move-based claim here was never
        // consulted and the drag silently did nothing.
        //
        // Safe to grab eagerly because these handlers are attached only to the
        // grey bar, which has nothing tappable in it: a press that never moves
        // just releases below the threshold and springs back.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_, g) => {
          // Downward only: dragging up shouldn't lift the sheet past its top.
          if (g.dy > 0) translateY.setValue(g.dy);
        },
        onPanResponderRelease: (_, g) => {
          // Either a decisive distance or a flick — a slow short drag springs
          // back rather than closing something the user was only peeking under.
          if (g.dy > 120 || g.vy > 0.8) {
            Animated.timing(translateY, {
              toValue: 900,
              duration: 160,
              useNativeDriver: true,
            }).start(() => onClose());
          } else {
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
              bounciness: 0,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        },
      }),
    [onClose, translateY],
  );

  return {
    panHandlers: responder.panHandlers,
    style: { transform: [{ translateY }] },
  };
}
