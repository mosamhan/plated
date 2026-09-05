import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { tick } from '@/lib/haptics';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export interface IconTabSpec<T extends string> {
  key: T;
  /** Shown when this tab isn't active. */
  icon: keyof typeof Ionicons.glyphMap;
  /**
   * Shown when active, if different from `icon` — mirrors the profile grid's
   * own outline/filled pairing (`grid-outline` → `grid`) so a conversation's
   * content tabs read as the same visual language as a person's.
   */
  activeIcon?: keyof typeof Ionicons.glyphMap;
}

/**
 * Icon-only section tabs — group-info/chat-info's Members/Plates & Platos/
 * Collections/Photos row, styled to match the profile's own grid/play-circle/
 * bookmark tab row (`ProfileView.tsx`'s `TabButton`) rather than
 * `UnderlineTabs`' text labels, since these are the same kind of content
 * (a person's or a conversation's grids/lists) and should look like it.
 */
export function IconTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly IconTabSpec<T>[];
  value: T;
  onChange: (tab: T) => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={[styles.row, { borderColor: colors.border }]}>
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <Pressable
            key={t.key}
            onPress={() => {
              if (active) return;
              tick();
              onChange(t.key);
            }}
            style={styles.tabBtn}
            hitSlop={{ top: 8, bottom: 8 }}>
            <Ionicons
              name={active ? (t.activeIcon ?? t.icon) : t.icon}
              size={23}
              color={active ? colors.accent : colors.textMuted}
            />
            <View style={[styles.underline, { backgroundColor: active ? colors.accent : 'transparent' }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginHorizontal: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { flex: 1, alignItems: 'center', paddingTop: 12 },
  underline: { height: 2, width: '100%', marginTop: 10, borderRadius: 2 },
});
