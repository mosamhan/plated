import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * The three-dot "someone's typing" bubble — sized and placed like a received
 * message (left-aligned, their bubble color) so it reads as the next line of
 * the thread rather than a separate status banner.
 */
export function TypingIndicator() {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.bubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Dot delay={0} color={colors.textMuted} />
        <Dot delay={150} color={colors.textMuted} />
        <Dot delay={300} color={colors.textMuted} />
      </View>
    </View>
  );
}

function Dot({ delay, color }: { delay: number; color: string }) {
  const y = useSharedValue(0);

  useEffect(() => {
    y.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(-4, { duration: 300 }), withTiming(0, { duration: 300 })), -1, false),
    );
  }, [delay, y]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.lg, paddingTop: 4 },
  bubble: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
});
