import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilterChips } from '@/components/FilterChips';
import { RankRow } from '@/components/RankRow';
import { formatCount } from '@/components/StatPill';
import { distanceKm, NEAR_RADIUS_KM } from '@/lib/geo';
import { useData } from '@/store/DataContext';
import { useLocation } from '@/store/LocationContext';
import { radius, spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const TABS = ['Best Restaurants', 'Best Plates', 'Top Creators'];

export default function Leaderboard() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { topRestaurants, topPlates, topCreators, userFor, restaurantFor } = useData();
  const { location } = useLocation();
  const [tab, setTab] = useState(TABS[0]);

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

  const restaurants = useMemo(
    () => topRestaurants().filter((r) => withinRange(r)),
    [topRestaurants, near, origin?.lat, origin?.lng], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const plates = useMemo(
    () => topPlates().filter((o) => withinRange(restaurantFor(o.restaurantId))),
    [topPlates, restaurantFor, near, origin?.lat, origin?.lng], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const creatorsTab = tab === 'Top Creators';
  const subtitle = creatorsTab
    ? 'Top creators across Plated, ranked by followers'
    : near
      ? `The best-rated in ${location.label}, by the community`
      : 'The best-rated across Plated, by the community';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8 }}>
        <Text style={[typography.title, { color: colors.text, paddingHorizontal: spacing.lg }]}>Leaderboard</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>{subtitle}</Text>

        {/* Location scope — hidden on the (global-by-nature) creators tab */}
        {!creatorsTab && (
          <View style={styles.scopeRow}>
            <ScopeChip label={hasCoords ? `Near ${location.label}` : 'Near me'} active={scope === 'near'} onPress={() => setScope('near')} icon="location" />
            <ScopeChip label="Global" active={scope === 'global'} onPress={() => setScope('global')} icon="earth" />
          </View>
        )}
        {!creatorsTab && scope === 'near' && !hasCoords && (
          <Pressable onPress={() => router.push('/settings/location')} style={styles.locHintRow}>
            <Text style={[styles.locHint, { color: colors.accent }]}>Set your location to rank nearby →</Text>
          </Pressable>
        )}

        <FilterChips options={TABS} value={tab} onChange={setTab} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 110 }}>
        {tab === 'Best Restaurants' &&
          (restaurants.length ? (
            restaurants.map((r, i) => (
              <RankRow
                key={r.id}
                rank={i + 1}
                image={r.image}
                title={r.name}
                subtitle={`${r.cuisine} · ${r.orderCount} plates rated`}
                score={r.platedRating}
                onPress={() => router.push(`/restaurant/${r.id}`)}
              />
            ))
          ) : (
            <Empty text={`No ranked restaurants in ${location.label} yet.`} />
          ))}

        {tab === 'Best Plates' &&
          (plates.length ? (
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
          ))}

        {tab === 'Top Creators' &&
          topCreators().map((u, i) => (
            <RankRow
              key={u.id}
              rank={i + 1}
              image={u.avatar}
              rounded
              title={u.name}
              subtitle={`@${u.handle}${u.compensationEligible ? ' · earns commission' : ''}`}
              trailing={`${formatCount(u.followers)} followers`}
              onPress={() => router.push(`/user/${u.id}`)}
            />
          ))}
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
