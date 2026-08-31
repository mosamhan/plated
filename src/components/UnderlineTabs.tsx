import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { tick } from '@/lib/haptics';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * The app's one content-tab control: a label with an accent underline beneath
 * the active one.
 *
 * "Content tabs" means anything that switches *which list you're looking at* —
 * search results, a collection's sections, a profile's grids. Filters and
 * settings toggles deliberately stay pills: those narrow or configure the
 * list you're already on, and giving them the same shape as navigation would
 * blur what's a view switch and what's a setting.
 */
export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  scrollable,
}: {
  tabs: readonly T[];
  value: T;
  onChange: (tab: T) => void;
  /**
   * Lets the row scroll instead of dividing the width evenly. For more tabs
   * than comfortably fit — five short labels fit, but longer sets would
   * squeeze until they clip.
   */
  scrollable?: boolean;
}) {
  const { colors } = useTheme();

  const items = tabs.map((t) => {
    const on = value === t;
    return (
      <Pressable
        key={t}
        onPress={() => {
          if (on) return;
          tick();
          onChange(t);
        }}
        style={[styles.item, !scrollable && styles.itemEven]}
        hitSlop={{ top: 8, bottom: 8 }}>
        <Text style={[styles.label, { color: on ? colors.text : colors.textMuted }]} numberOfLines={1}>
          {t}
        </Text>
        <View style={[styles.underline, { backgroundColor: on ? colors.accent : 'transparent' }]} />
      </Pressable>
    );
  });

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.scrollRow}>
        {items}
      </ScrollView>
    );
  }
  return <View style={styles.row}>{items}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  // A horizontal ScrollView otherwise stretches to fill a flex-column parent.
  scroll: { flexGrow: 0 },
  scrollRow: { flexDirection: 'row', gap: spacing.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  item: { alignItems: 'center' },
  itemEven: { flexShrink: 1 },
  label: { fontSize: 13, fontWeight: '800' },
  underline: { height: 2.5, borderRadius: 2, marginTop: 6, width: '100%', minWidth: 24 },
});
