import { ReactNode } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

interface Props extends Omit<PressableProps, 'style'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scale when pressed (default 0.97). */
  pressScale?: number;
}

/**
 * Pressable with a spring scale-down on press — the standard premium-feel
 * micro-interaction. Use for cards, tiles, buttons.
 */
export function AnimatedPressable({ children, style, pressScale = 0.97, ...rest }: Props) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressableBase
      {...rest}
      style={[style, animatedStyle]}
      onPressIn={(e) => {
        scale.value = withSpring(pressScale, { damping: 15, stiffness: 300 });
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 15, stiffness: 300 });
        rest.onPressOut?.(e);
      }}>
      {children}
    </AnimatedPressableBase>
  );
}
