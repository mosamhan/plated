import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { displayFont } from '@/theme/fonts';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

interface Slide {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: 'restaurant-outline',
    title: 'Rate the dish, not just the place.',
    body: 'Every plate gets its own score — so you know exactly what to order, not just where to go.',
  },
  {
    icon: 'flame-outline',
    title: 'Discover what’s actually good nearby.',
    body: 'See the highest-rated plates around you, ranked by people who’ve actually eaten them.',
  },
  {
    icon: 'play-circle-outline',
    title: 'Watch Platos.',
    body: 'Quick videos from real diners — see a dish before you order it.',
  },
  {
    icon: 'bag-handle-outline',
    title: 'Order in one tap.',
    body: 'Loved a plate? Jump straight to ordering it from your favorite delivery app.',
  },
];

// The app icon's own gradient — reused here so the carousel reads as
// unmistakably Plated, not a generic onboarding template.
const GRADIENT = ['#F4B12A', '#D9830B'] as const;

export function IntroCarousel({ onDone }: { onDone: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<PagerView>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  const next = () => {
    if (last) {
      onDone();
      return;
    }
    pagerRef.current?.setPage(index + 1);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.skipRow, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={onDone} hitSlop={10}>
          <Text style={[styles.skip, { color: colors.textMuted }]}>Skip</Text>
        </Pressable>
      </View>

      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={(e) => setIndex(e.nativeEvent.position)}>
        {SLIDES.map((slide, i) => (
          <View key={i} style={styles.slide} collapsable={false}>
            <Animated.View
              key={index === i ? `${i}-shown` : `${i}-hidden`}
              entering={index === i ? FadeIn.duration(320) : undefined}
              style={styles.slideContent}>
              <LinearGradient colors={GRADIENT} style={styles.iconWrap}>
                <Ionicons name={slide.icon} size={44} color="#F8EFD8" />
              </LinearGradient>
              <Text style={[styles.title, { color: colors.text, fontFamily: displayFont }]}>{slide.title}</Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>{slide.body}</Text>
            </Animated.View>
          </View>
        ))}
      </PagerView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, { backgroundColor: i === index ? colors.accent : colors.border }]}
            />
          ))}
        </View>
        <Button label={last ? 'Get started' : 'Next'} size="lg" onPress={next} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skipRow: { alignItems: 'flex-end', paddingHorizontal: spacing.lg },
  skip: { fontSize: 15, fontWeight: '700' },
  pager: { flex: 1 },
  slide: { flex: 1 },
  slideContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  iconWrap: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  title: { fontSize: 26, textAlign: 'center', marginBottom: 12, letterSpacing: -0.3 },
  body: { fontSize: 15, fontWeight: '500', textAlign: 'center', lineHeight: 22 },
  footer: { paddingHorizontal: spacing.xl, gap: spacing.lg },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
});
