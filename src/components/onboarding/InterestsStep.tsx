import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { FILTERABLE_PLACE_TYPES, PLACE_TYPE_META, PlaceGlyph } from '@/components/ExploreMap';
import type { PlaceType } from '@/lib/placeType';
import { radius, spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const MIN_PICKS = 1;

/**
 * The taste profile's front door — TikTok's own "choose your interests" step
 * (a picker of category chips gating entry to the app), reusing the same
 * closed 14-category taxonomy Discover/Ranks already filter by
 * (`PLACE_TYPE_META`) rather than inventing a second one. What's picked here
 * seeds `personalizationScore`/the Platos feed's ranking immediately (see
 * `lib/tasteProfile.ts`) and keeps building from likes, saves, reorders and
 * shares afterward — this step just gives a cold-start account something to
 * go on before any of those exist.
 */
export function InterestsStep({
  selected,
  onToggle,
  onSkip,
  onContinue,
  busy,
}: {
  selected: Set<PlaceType>;
  onToggle: (type: PlaceType) => void;
  /** Absent hides the Skip affordance — Settings' edit flow always has picks already, onboarding doesn't require it either. */
  onSkip?: () => void;
  onContinue: () => void;
  busy?: boolean;
}) {
  const { colors } = useTheme();
  const canContinue = selected.size >= MIN_PICKS;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {onSkip && (
        <View style={styles.skipRow}>
          <Pressable onPress={onSkip} hitSlop={10}>
            <Text style={[styles.skip, { color: colors.textMuted }]}>Skip</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.header}>
        <Text style={[typography.hero, { color: colors.text }]}>What do you love to eat?</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          Pick a few — we’ll use them to shape your feed and Platos.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {FILTERABLE_PLACE_TYPES.map((type) => {
          const on = selected.has(type);
          return (
            <Pressable
              key={type}
              onPress={() => onToggle(type)}
              style={[
                styles.chip,
                {
                  backgroundColor: on ? colors.accent : colors.surface,
                  borderColor: on ? colors.accent : colors.border,
                },
              ]}>
              <PlaceGlyph type={type} size={18} color={on ? colors.accentText : colors.textMuted} />
              <Text style={[styles.chipLabel, { color: on ? colors.accentText : colors.text }]}>
                {PLACE_TYPE_META[type].label}
              </Text>
              {on && <Ionicons name="checkmark" size={15} color={colors.accentText} style={{ marginLeft: 2 }} />}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Button
          label={busy ? 'Saving…' : 'Continue'}
          size="lg"
          onPress={onContinue}
          disabled={!canContinue || busy}
          loading={busy}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skipRow: { alignItems: 'flex-end', paddingHorizontal: spacing.lg, paddingTop: 4 },
  skip: { fontSize: 15, fontWeight: '700' },
  header: { paddingHorizontal: spacing.xl, marginTop: spacing.md, marginBottom: spacing.lg },
  sub: { fontSize: 15, fontWeight: '500', marginTop: 10, lineHeight: 21 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipLabel: { fontSize: 14, fontWeight: '700' },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
});
