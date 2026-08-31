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
  /**
   * A second icon action, drawn immediately to the *left* of `rightIcon`. For
   * screens that need both a share and a save without one displacing the other.
   */
  secondaryIcon?: keyof typeof Ionicons.glyphMap;
  onSecondary?: () => void;
  /** Text action instead of an icon — for verbs an icon can't carry ("Manage"). */
  rightLabel?: string;
  onRight?: () => void;
  closeMode?: boolean;
  /** For screens reached without anything to go back to (e.g. the Profile tab's own header) — leaves the same width so the title still centers correctly. */
  hideBack?: boolean;
  /** Makes the title tappable (a trailing caret is drawn to signal it) — the profile tab's account switcher uses this. */
  onTitlePress?: () => void;
}

export function ScreenHeader({ title, transparent, rightIcon, rightLabel, onRight, closeMode, secondaryIcon, onSecondary, hideBack, onTitlePress }: Props) {
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
      {hideBack ? (
        <View style={styles.iconBtn} />
      ) : (
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
      )}
      {title ? (
        onTitlePress ? (
          <Pressable onPress={onTitlePress} style={styles.titleRow} hitSlop={6}>
            <Text style={[styles.title, styles.titleInRow, { color: colors.text, fontFamily: displayFont }]} numberOfLines={1}>
              {title}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
          </Pressable>
        ) : (
          <Text style={[styles.title, { color: colors.text, fontFamily: displayFont }]} numberOfLines={1}>
            {title}
          </Text>
        )
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {secondaryIcon && (
        <Pressable
          onPress={onSecondary}
          hitSlop={10}
          style={[styles.iconBtn, transparent && { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
          <Ionicons name={secondaryIcon} size={21} color={transparent ? '#fff' : colors.text} />
        </Pressable>
      )}
      {rightLabel ? (
        <Pressable onPress={onRight} hitSlop={10} style={styles.labelBtn}>
          <Text style={[styles.labelText, { color: transparent ? '#fff' : colors.accent }]}>
            {rightLabel}
          </Text>
        </Pressable>
      ) : rightIcon ? (
        <Pressable
          onPress={onRight}
          hitSlop={10}
          style={[styles.iconBtn, transparent && { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
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
  labelBtn: { height: 38, minWidth: 38, paddingHorizontal: 6, justifyContent: 'center', alignItems: 'flex-end' },
  labelText: { fontSize: 15, fontWeight: '800' },
  title: { flex: 1, textAlign: 'center', fontSize: 18, letterSpacing: -0.3 },
  titleRow: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 },
  titleInRow: { flex: 0 },
});
