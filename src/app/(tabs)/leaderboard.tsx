import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FILTERABLE_PLACE_TYPES, PLACE_TYPE_META } from '@/components/ExploreMap';
import { RankRow } from '@/components/RankRow';
import { distanceKm, NEAR_RADIUS_KM } from '@/lib/geo';
import { placeTypeFor, type PlaceType } from '@/lib/placeType';
import { useData } from '@/store/DataContext';
import { useLocation } from '@/store/LocationContext';
import { radius, spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * Ranks has one filter row, not two. The old Best Plates / Restaurants / Cafés
 * tabs are folded into the cuisine filters as leading entries:
 *   - `overall` ranks every restaurant (any cuisine) — the old Best Restaurants
 *   - `plates`  ranks every plate — the old Best Plates
 *   - `cafe` (a cuisine) already covers the old Best Cafés
 * Every other entry is a cuisine, ranking restaurants of that type. Single
 * select, since it's a mode, not a set.
 */
type RankFilter = 'overall' | 'plates' | PlaceType;
const LEAD: { key: RankFilter; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { key: 'overall', label: 'Overall', icon: 'trophy-outline' },
  { key: 'plates', label: 'Overall plate', icon: 'silverware-fork-knife' },
];

export default function Leaderboard() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { topRestaurants, topPlates, userFor, restaurantFor } = useData();
  const { location } = useLocation();
  const [filter, setFilter] = useState<RankFilter>('overall');

  const hasCoords = location.lat != null && location.lng != null;
  const [scope, setScope] = useState<'near' | 'global'>('global');
  // "Near" only means something once we know the user's coordinates.
  const near = scope === 'near' && hasCoords;
  const origin = hasCoords ? { lat: location.lat!, lng: location.lng! } : null;

  const withinRange = (r?: { lat?: number; lng?: number }) => {
    if (!near || !origin) return true;
    if (r?.lat == null || r?.lng == null) return false;
    return distanceKm(origin, { lat: r.lat, lng: r.lng }) <= NEAR_RADIUS_KM;
  };

  const showingPlates = filter === 'plates';
  // A cuisine is selected when the filter isn't one of the two "overall" modes.
  const cuisine: PlaceType | null = filter === 'overall' || filter === 'plates' ? null : filter;

  // Restaurants ranked, optionally narrowed to one cuisine. Empty in plates mode.
  const restaurants = useMemo(
    () =>
      showingPlates
        ? []
        : topRestaurants().filter((r) => withinRange(r) && (cuisine == null || placeTypeFor(r.cuisine) === cuisine)),
    [topRestaurants, near, origin?.lat, origin?.lng, filter], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const plates = useMemo(
    () => (showingPlates ? topPlates().filter((o) => withinRange(restaurantFor(o.restaurantId))) : []),
    [topPlates, restaurantFor, near, origin?.lat, origin?.lng, filter], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const subtitle = near
    ? `The best-rated in ${location.label}, by the community`
    : 'The best-rated across Plated, by the community';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8 }}>
        <Text style={[typography.title, { color: colors.text, paddingHorizontal: spacing.lg }]}>Ranks</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>{subtitle}</Text>

        <View style={styles.scopeRow}>
          <ScopeChip label={hasCoords ? `Near ${location.label}` : 'Near me'} active={scope === 'near'} onPress={() => setScope('near')} icon="location" />
          <ScopeChip label="Global" active={scope === 'global'} onPress={() => setScope('global')} icon="earth" />
        </View>
        {scope === 'near' && !hasCoords && (
          <Pressable onPress={() => router.push('/settings/location')} style={styles.locHintRow}>
            <Text style={[styles.locHint, { color: colors.accent }]}>Set your location to rank nearby →</Text>
          </Pressable>
        )}

        {/* One filter row: the two "overall" modes lead, then every cuisine.
            Scrolls horizontally — there are 16 and they'd wrap into a wall. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cuisineRow}>
          {[
            ...LEAD.map((l) => ({ key: l.key, label: l.label, icon: l.icon })),
            ...FILTERABLE_PLACE_TYPES.map((t) => ({ key: t, label: PLACE_TYPE_META[t].label, icon: PLACE_TYPE_META[t].icon })),
          ].map((f) => {
            const on = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key as RankFilter)}
                style={[
                  styles.cuisineChip,
                  { borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : 'transparent' },
                ]}>
                <MaterialCommunityIcons name={f.icon} size={14} color={on ? colors.accent : colors.textMuted} />
                <Text style={[styles.cuisineText, { color: on ? colors.text : colors.textMuted }]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 110 }}>
        {showingPlates ? (
          plates.length ? (
            plates.map((o, i) => {
              const r = restaurantFor(o.restaurantId);
              const u = userFor(o.userId);
              const disclosure = u.compensationEligible ? ' · earns commission' : '';
              return (
                <RankRow
                  key={o.id}
                  rank={i + 1}
                  image={o.photo}
                  title={o.dishName}
                  subtitle={`${r?.name} · @${u.handle}${disclosure}`}
                  score={o.rating}
                  onPress={() => router.push(`/order/${o.id}`)}
                />
              );
            })
          ) : (
            <Empty text={`No ranked plates in ${location.label} yet.`} />
          )
        ) : restaurants.length ? (
          restaurants.map((r, i) => (
            <RankRow
              key={r.id}
              rank={i + 1}
              image={r.image}
              title={r.name}
              subtitle={`${r.cuisine} · ${r.orderCount} ${r.orderCount === 1 ? 'item' : 'items'} rated`}
              score={r.platedRating}
              onPress={() => router.push(`/restaurant/${r.id}`)}
            />
          ))
        ) : (
          <Empty
            text={
              cuisine
                ? `No ranked ${PLACE_TYPE_META[cuisine].label.toLowerCase()} in ${location.label} yet.`
                : `No ranked restaurants in ${location.label} yet.`
            }
          />
        )}
      </ScrollView>
    </View>
  );
}

function ScopeChip({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.scopeChip,
        { backgroundColor: active ? colors.accent : colors.surface, borderColor: active ? colors.accent : colors.border },
      ]}>
      <Ionicons name={icon} size={13} color={active ? colors.accentText : colors.textMuted} />
      <Text style={{ color: active ? colors.accentText : colors.textMuted, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Empty({ text }: { text: string }) {
  const { colors } = useTheme();
  return <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 30, fontSize: 14, fontWeight: '500' }}>{text}</Text>;
}

const styles = StyleSheet.create({
  sub: { fontSize: 14, fontWeight: '500', paddingHorizontal: spacing.lg, marginTop: 4, marginBottom: 12 },
  cuisineRow: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, paddingTop: 10, paddingBottom: 2 },
  cuisineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cuisineText: { fontSize: 13, fontWeight: '700' },
  scopeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, marginBottom: 12 },
  scopeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 220,
  },
  locHintRow: { paddingHorizontal: spacing.lg, marginBottom: 12 },
  locHint: { fontSize: 13, fontWeight: '700' },
});
