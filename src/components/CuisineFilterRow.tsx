import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FILTERABLE_PLACE_TYPES, PLACE_TYPE_META, PlaceGlyph } from '@/components/ExploreMap';
import type { PlaceType } from '@/lib/placeType';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export type CuisineFilterValue = 'overall' | PlaceType;

interface Props {
  value: CuisineFilterValue;
  onChange: (value: CuisineFilterValue) => void;
  /** Appended after the cuisine chips, in the same scrolling row — Discover's
   *  free-text "More" guesser. Ranks and My rankings don't pass one. */
  trailing?: ReactNode;
  /**
   * Ranks and My rankings lead with an explicit "Overall" chip (their own
   * long-standing reset option); Discover doesn't rank anything, so it has no
   * "Overall" — tapping the active cuisine again clears it instead.
   */
  showOverall?: boolean;
}

/**
 * The cuisine filter row shared by Discover, Ranks, and My rankings: an icon
 * circle with its label underneath, one selected at a time. One rail so the
 * three read as the same feature instead of three near-identical
 * reimplementations.
 */
export function CuisineFilterRow({ value, onChange, trailing, showOverall = true }: Props) {
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {showOverall && (
        <Chip
          label="Overall"
          icon="trophy-outline"
          on={value === 'overall'}
          onPress={() => onChange('overall')}
          colors={colors}
        />
      )}
      {FILTERABLE_PLACE_TYPES.map((type) => (
        <Chip
          key={type}
          label={PLACE_TYPE_META[type].label}
          type={type}
          on={value === type}
          onPress={() => onChange(!showOverall && value === type ? 'overall' : type)}
          colors={colors}
        />
      ))}
      {trailing}
    </ScrollView>
  );
}

function Chip({
  label,
  icon,
  type,
  on,
  onPress,
  colors,
}: {
  label: string;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  type?: PlaceType;
  on: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <Pressable onPress={onPress} style={styles.chip}>
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: on ? colors.accent : colors.surface, borderColor: on ? colors.accent : colors.border },
        ]}>
        {type ? (
          <PlaceGlyph type={type} size={20} color={on ? colors.accentText : colors.textMuted} />
        ) : (
          <MaterialCommunityIcons name={icon!} size={20} color={on ? colors.accentText : colors.textMuted} />
        )}
      </View>
      <Text style={[styles.label, { color: on ? colors.text : colors.textMuted }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.lg, gap: 16, paddingVertical: 2 },
  chip: { alignItems: 'center', width: 68 },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  // No numberOfLines cap — the full label ("Steakhouse & BBQ") wraps to a
  // second line instead of being cut down to its first word.
  label: { fontSize: 11, fontWeight: '700', marginTop: 5, textAlign: 'center' },
});
