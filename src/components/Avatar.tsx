import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { tapMedium } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeContext';

interface Props {
  uri: string;
  size?: number;
  verified?: boolean;
  ring?: boolean;
  /**
   * Draws the same padded story ring StoriesRail uses (accent while unseen,
   * a plain hairline once watched) and makes the whole avatar tappable.
   * Omitted entirely when the person has no visible story right now, so
   * every other caller's layout is untouched.
   */
  storyRing?: 'unseen' | 'seen';
  onPress?: () => void;
  /** Holding the picture down — opens the full-screen photo preview. */
  onLongPress?: () => void;
}

const RING_WIDTH = 2.5;
const RING_PADDING = 2;

export function Avatar({ uri, size = 44, verified, ring, storyRing, onPress, onLongPress }: Props) {
  const { colors } = useTheme();
  // The story ring replaces the flush accent ring rather than stacking with
  // it — both use the same accent color, so drawing both at once just reads
  // as one ring with an odd double edge.
  const content = (
    <View>
      <Image
        source={{ uri }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ring && !storyRing ? 2 : 0,
          borderColor: colors.accent,
          backgroundColor: colors.surface,
        }}
        contentFit="cover"
        transition={200}
      />
      {verified && (
        <View
          style={[
            styles.verified,
            {
              backgroundColor: colors.accent,
              borderColor: colors.card,
              width: size * 0.38,
              height: size * 0.38,
              borderRadius: size * 0.19,
            },
          ]}>
          <Ionicons name="checkmark" size={size * 0.22} color={colors.accentText} />
        </View>
      )}
    </View>
  );

  // A long press means "hold to preview" everywhere it's wired — the haptic
  // belongs here, once, rather than repeated at every call site.
  const handleLongPress = onLongPress
    ? () => {
        tapMedium();
        onLongPress();
      }
    : undefined;

  if (!storyRing) {
    return onPress || onLongPress ? (
      <AnimatedPressable onPress={onPress} onLongPress={handleLongPress} pressScale={0.94}>
        {content}
      </AnimatedPressable>
    ) : (
      content
    );
  }

  const outer = size + (RING_WIDTH + RING_PADDING) * 2;
  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={handleLongPress}
      pressScale={0.94}
      style={{
        width: outer,
        height: outer,
        borderRadius: outer / 2,
        borderWidth: RING_WIDTH,
        borderColor: storyRing === 'unseen' ? colors.accent : colors.border,
        padding: RING_PADDING,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {content}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  verified: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
});
