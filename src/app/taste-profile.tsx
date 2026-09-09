import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { PLACE_TYPE_META, PlaceGlyph } from '@/components/ExploreMap';
import { ScreenHeader } from '@/components/ScreenHeader';
import { tapLight } from '@/lib/haptics';
import type { PlaceType } from '@/lib/placeType';
import {
  archetypeTitle,
  buildTasteHistory,
  CategoryRank,
  rankCategories,
  TASTE_WEIGHTS,
  TasteAffinity,
} from '@/lib/tasteProfile';
import { useData } from '@/store/DataContext';
import { usePlatos } from '@/store/PlatosContext';
import { displayFont } from '@/theme/fonts';
import { radius, spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const HISTORY_WEEKS = 8;

function mergeAffinity(a: TasteAffinity, b: TasteAffinity): TasteAffinity {
  const out: TasteAffinity = { ...a };
  for (const [type, score] of Object.entries(b)) {
    out[type as PlaceType] = (out[type as PlaceType] ?? 0) + (score ?? 0);
  }
  return out;
}

/**
 * The taste profile as a dashboard, not just a one-time onboarding pick —
 * every category the algorithm (src/lib/tasteProfile.ts) has picked up from
 * plates and Platos combined, with a fun progress name per category instead
 * of a bare number, plus a way to correct it ("not really me") or add to it
 * (re-opens the same picker onboarding used) when it's gotten something
 * wrong or missed something new.
 */
export default function TasteProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { currentUser, tasteAffinity, plateTasteEvents, muteTasteCategory } = useData();
  const { platoAffinity, platoTasteEvents } = usePlatos();
  const [actionTarget, setActionTarget] = useState<CategoryRank | null>(null);

  const combinedAffinity = useMemo(() => mergeAffinity(tasteAffinity, platoAffinity), [tasteAffinity, platoAffinity]);
  const ranked = useMemo(
    () =>
      rankCategories(
        combinedAffinity,
        (currentUser.tasteCategories ?? []) as PlaceType[],
        (currentUser.tasteMuted ?? []) as PlaceType[],
      ),
    [combinedAffinity, currentUser.tasteCategories, currentUser.tasteMuted],
  );
  const muted = (currentUser.tasteMuted ?? []) as PlaceType[];

  const history = useMemo(() => {
    const events = [...plateTasteEvents(), ...platoTasteEvents()];
    const baseline = (currentUser.tasteCategories?.length ?? 0) * TASTE_WEIGHTS.onboarding;
    return buildTasteHistory(events, baseline, HISTORY_WEEKS);
  }, [plateTasteEvents, platoTasteEvents, currentUser.tasteCategories]);
  const maxHistory = Math.max(1, ...history.map((h) => h.total));

  const title = archetypeTitle(ranked, (type) => PLACE_TYPE_META[type].label);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Taste Profile"
        rightLabel="Edit"
        onRight={() => {
          tapLight();
          router.push('/taste-profile/edit');
        }}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[typography.hero, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          Built from what you&rsquo;ve liked, saved, reordered, and shared — not just what you picked once.
        </Text>

        {/* "This month" — a hand-rolled sparkline (one bar per week) rather
            than pulling in a charting library for a single combined trend. */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Your taste, over time</Text>
          <View style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.historyBars}>
              {history.map((point, i) => (
                <View key={point.weekStart} style={styles.historyBarWrap}>
                  <View
                    style={[
                      styles.historyBar,
                      {
                        height: Math.max(4, (point.total / maxHistory) * 64),
                        backgroundColor: i === history.length - 1 ? colors.accent : colors.accentSoft,
                      },
                    ]}
                  />
                </View>
              ))}
            </View>
            <View style={styles.historyLabels}>
              <Text style={[styles.historyLabel, { color: colors.textMuted }]}>{HISTORY_WEEKS} weeks ago</Text>
              <Text style={[styles.historyLabel, { color: colors.textMuted }]}>This week</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Your categories</Text>
          {ranked.length === 0 && (
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              Nothing yet — like, save, or reorder a few plates and Platos, and they&rsquo;ll show up here.
            </Text>
          )}
          {ranked.map((r) => (
            <View key={r.type} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>
                <PlaceGlyph type={r.type} size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.rowHead}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>{PLACE_TYPE_META[r.type].label}</Text>
                  <Text style={[styles.rowTier, { color: colors.accent }]}>{r.tier}</Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.round(r.progress * 100)}%`, backgroundColor: colors.accent },
                    ]}
                  />
                </View>
                {r.nextTier && (
                  <Text style={[styles.rowNext, { color: colors.textMuted }]}>
                    {Math.round((1 - r.progress) * 100) > 0 ? `Getting closer to ${r.nextTier}` : `Almost ${r.nextTier}`}
                  </Text>
                )}
              </View>
              <Pressable
                hitSlop={10}
                onPress={() => {
                  tapLight();
                  setActionTarget(r);
                }}>
                <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
        </View>

        {muted.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Not for you</Text>
            <View style={styles.mutedRow}>
              {muted.map((type) => (
                <Pressable
                  key={type}
                  onPress={() => {
                    tapLight();
                    muteTasteCategory(type, false);
                  }}
                  style={[styles.mutedChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <PlaceGlyph type={type} size={14} color={colors.textMuted} />
                  <Text style={[styles.mutedChipLabel, { color: colors.textMuted }]}>{PLACE_TYPE_META[type].label}</Text>
                  <Ionicons name="add-circle-outline" size={15} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <ActionSheet
        visible={!!actionTarget}
        onClose={() => setActionTarget(null)}
        title={actionTarget ? PLACE_TYPE_META[actionTarget.type].label : undefined}
        actions={
          actionTarget
            ? [
                {
                  label: 'Not really me',
                  icon: 'close-circle-outline',
                  destructive: true,
                  onPress: () => muteTasteCategory(actionTarget.type, true),
                },
              ]
            : []
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  sub: { fontSize: 14, fontWeight: '500', marginTop: 8, lineHeight: 20 },
  section: { marginTop: spacing.xl },
  sectionTitle: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 },
  empty: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  historyCard: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.md },
  historyBars: { flexDirection: 'row', alignItems: 'flex-end', height: 64, gap: 6 },
  historyBarWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 64 },
  historyBar: { width: '100%', borderRadius: 4 },
  historyLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  historyLabel: { fontSize: 11, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  iconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  rowLabel: { fontSize: 15, fontWeight: '700', fontFamily: displayFont },
  rowTier: { fontSize: 12, fontWeight: '800' },
  progressTrack: { height: 5, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3 },
  rowNext: { fontSize: 11, fontWeight: '600', marginTop: 6 },
  mutedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mutedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  mutedChipLabel: { fontSize: 12, fontWeight: '700' },
});
