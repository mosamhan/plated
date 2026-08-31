import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  SlideInUp,
  SlideOutUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { tapLight } from '@/lib/haptics';
import { useData } from '@/store/DataContext';
import { useMessages } from '@/store/MessagesContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/** How long a banner stays before it gets out of the way on its own. */
const DWELL_MS = 4200;
/** Past this much upward drag, release dismisses instead of springing back. */
const DISMISS_AT = 28;

/**
 * The in-app banner for a message or reaction that arrives while you're using
 * Plated.
 *
 * The OS banner is suppressed while the app is foregrounded (see lib/push), so
 * this is the only notice you get — and it can do what the OS one can't: tap it
 * and you're in the thread. It stays out of the way on the thread it's about,
 * because being told about a message you're looking at is noise.
 */
export function InAppNotice() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userFor, ensureProfiles } = useData();
  const { incoming, clearIncoming } = useMessages();
  const [shown, setShown] = useState<typeof incoming>(null);
  const offset = useSharedValue(0);

  const dismiss = useCallback(() => setShown(null), []);

  useEffect(() => {
    if (!incoming) return;
    // A message can arrive from someone who wasn't on the app at boot.
    ensureProfiles([incoming.senderId]);
    offset.value = 0;
    setShown(incoming);
    clearIncoming();
    const t = setTimeout(dismiss, DWELL_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming, clearIncoming, dismiss]);

  // Upward only. A banner you can drag *down* would cover more of the screen
  // than it already does, which is the opposite of getting out of the way.
  const swipe = Gesture.Pan()
    .onUpdate((e) => {
      offset.value = Math.min(0, e.translationY);
    })
    .onEnd((e) => {
      const goneEnough = -offset.value > DISMISS_AT || e.velocityY < -400;
      if (goneEnough) {
        offset.value = withTiming(-160, { duration: 140 }, () => runOnJS(dismiss)());
      } else {
        offset.value = withSpring(0, { damping: 18 });
      }
    });

  const drag = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  if (!shown) return null;

  const sender = userFor(shown.senderId);

  return (
    <GestureDetector gesture={swipe}>
      <Animated.View
        entering={SlideInUp.springify().damping(18)}
        exiting={SlideOutUp.duration(180)}
        style={[styles.wrap, { top: insets.top + 6 }, drag]}>
      <Pressable
        onPress={() => {
          tapLight();
          setShown(null);
          router.push(`/messages/${shown.conversationId}`);
        }}
        style={({ pressed }) => [
          styles.banner,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: colors.shadow,
            opacity: pressed ? 0.9 : 1,
          },
        ]}>
        <Avatar uri={sender.avatar} size={38} verified={sender.verified} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {sender.name}
          </Text>
          <Text style={[styles.body, { color: colors.textMuted }]} numberOfLines={1}>
            {shown.preview}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </Pressable>
      {/* A grabber, because "you can flick this away" isn't discoverable
          otherwise — the banner leaves on its own before most people try. */}
      <View style={[styles.grabber, { backgroundColor: colors.border }]} />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, zIndex: 100 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 11,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  grabber: { width: 34, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 5 },
  name: { fontSize: 14, fontWeight: '800' },
  body: { fontSize: 13, fontWeight: '500', marginTop: 1 },
});
