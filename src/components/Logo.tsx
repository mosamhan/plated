import { StyleSheet, Text, View } from 'react-native';

import { PlatedMark } from '@/components/PlatedMark';
import { displayFont } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

export function Logo({ size = 22 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View
        style={[
          styles.mark,
          { backgroundColor: colors.accent, width: size * 1.3, height: size * 1.3, borderRadius: size * 0.4 },
        ]}>
        <PlatedMark size={size * 0.82} color={colors.accentText} />
      </View>
      <Text style={[styles.word, { color: colors.text, fontSize: size * 1.18, fontFamily: displayFont }]}>
        Plated
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mark: { alignItems: 'center', justifyContent: 'center' },
  word: { letterSpacing: -0.5 },
});
