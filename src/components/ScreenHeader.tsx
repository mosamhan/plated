import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { displayFont } from '@/theme/fonts';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

interface Props {
  title?: string;
  transparent?: boolean;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRight?: () => void;
  closeMode?: boolean;
}

export function ScreenHeader({ title, transparent, rightIcon, onRight, closeMode }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: insets.top + 6,
          backgroundColor: transparent ? 'transparent' : colors.background,
          borderBottomColor: transparent ? 'transparent' : colors.border,
          borderBottomWidth: transparent ? 0 : StyleSheet.hairlineWidth,
        },
      ]}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={10}
        style={[styles.iconBtn, transparent && { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
        <Ionicons
          name={closeMode ? 'close' : 'chevron-back'}
          size={24}
          color={transparent ? '#fff' : colors.text}
        />
      </Pressable>
      {title ? (
        <Text style={[styles.title, { color: colors.text, fontFamily: displayFont }]} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {rightIcon ? (
        <Pressable onPress={onRight} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name={rightIcon} size={22} color={transparent ? '#fff' : colors.text} />
        </Pressable>
      ) : (
        <View style={styles.iconBtn} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: 10,
    gap: spacing.sm,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, textAlign: 'center', fontSize: 18, letterSpacing: -0.3 },
});
