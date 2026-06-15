import { useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { radius } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * Theme-aware skeleton block with a gentle opacity pulse.
 * Hand-rolled with Reanimated (no shimmer libs — broken on the new arch).
 */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.8, { duration: 700 }), -1, true);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        { backgroundColor: colors.border, borderRadius: radius.md },
        style,
        animatedStyle,
      ]}
    />
  );
}
