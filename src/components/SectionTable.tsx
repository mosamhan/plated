import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { formatCount } from '@/components/StatPill';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

interface Props {
  title: string;
  /** Shown beside the title. Omit where a count means nothing. */
  count?: number;
  subtitle?: string;
  /**
   * Shown in place of the table when there are no rows. Omit and the whole
   * section disappears instead — right for sections that only exist when
   * there's something in them.
   */
  empty?: { icon: keyof typeof Ionicons.glyphMap; text: string };
  /** Each row draws its own bottom hairline via `rowDivider`. */
  rows: React.ReactNode[];
}

/**
 * A titled group of rows in one bordered card, hairline-separated. Shared so
 * People, Discover people and Notifications all read as the same kind of list
 * instead of each inventing its own filter chips and card stacks.
 */
export function SectionTable({ title, count, subtitle, empty, rows }: Props) {
  const { colors } = useTheme();

  if (rows.length === 0 && !empty) return null;

  return (
    <View style={{ marginBottom: spacing.xl }}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {count !== undefined && (
          <Text style={[styles.count, { color: colors.textMuted }]}>{formatCount(count)}</Text>
        )}
      </View>
      {subtitle && <Text style={[styles.sub, { color: colors.textMuted }]}>{subtitle}</Text>}

      {rows.length === 0 && empty ? (
        <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name={empty.icon} size={26} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>{empty.text}</Text>
        </View>
      ) : (
        <View style={[styles.table, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {rows}
        </View>
      )}
    </View>
  );
}

/** Separator for every row but the last, so tables line up across screens. */
export const rowDivider = (borderColor: string, last: boolean) =>
  last ? null : { borderBottomColor: borderColor, borderBottomWidth: StyleSheet.hairlineWidth };

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  title: { fontSize: 17, fontWeight: '800' },
  count: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 13, fontWeight: '500', marginBottom: 10 },
  table: {
    marginTop: 6,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  empty: {
    marginTop: 6,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyText: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
});
