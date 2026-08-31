import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { displayFont } from '@/theme/fonts';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const GRADIENT = ['#F4B12A', '#D9830B'] as const;

export function WelcomeStep({ handle, onContinue }: { handle: string; onContinue: () => void }) {
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl }}>
      <Animated.View entering={FadeIn.duration(400)} style={{ alignItems: 'center' }}>
        <LinearGradient colors={GRADIENT} style={styles.iconWrap}>
          <Ionicons name="checkmark" size={48} color="#F8EFD8" />
        </LinearGradient>
        <Text style={[styles.title, { color: colors.text, fontFamily: displayFont }]}>You&apos;re in, @{handle}</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          Your profile&apos;s set up. Start rating the plates you already know are good.
        </Text>
        <Button label="Continue" size="lg" onPress={onContinue} style={{ marginTop: spacing.xl, alignSelf: 'stretch' }} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
