import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Socials } from '@/data/types';
import { useTheme } from '@/theme/ThemeContext';
import { radius } from '@/theme/palettes';

const ICONS: { key: keyof Socials; icon: keyof typeof Ionicons.glyphMap; url: (h: string) => string }[] = [
  { key: 'instagram', icon: 'logo-instagram', url: (h) => `https://instagram.com/${h}` },
  { key: 'tiktok', icon: 'logo-tiktok', url: (h) => `https://tiktok.com/@${h}` },
  { key: 'youtube', icon: 'logo-youtube', url: (h) => `https://youtube.com/@${h}` },
];

export function SocialLinks({ socials }: { socials: Socials }) {
  const { colors } = useTheme();
  const present = ICONS.filter((i) => socials[i.key]);
  if (present.length === 0) return null;
  return (
    <View style={styles.row}>
      {present.map((i) => (
        <Pressable
          key={i.key}
          onPress={() => Linking.openURL(i.url(socials[i.key]!)).catch(() => {})}
          style={[styles.btn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name={i.icon} size={18} color={colors.text} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  btn: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
