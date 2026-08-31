import { StyleSheet, Text } from 'react-native';

import { displayFont } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

export function Logo({ size = 22 }: { size?: number }) {
  const { colors } = useTheme();

  return (
    <Text style={[styles.word, { color: colors.text, fontSize: size * 1.18, fontFamily: displayFont }]}>
      Plated
    </Text>
  );
}

const styles = StyleSheet.create({
  word: { letterSpacing: -0.5 },
});
