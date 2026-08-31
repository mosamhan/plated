import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CuisineFilterRow, type CuisineFilterValue } from '@/components/CuisineFilterRow';
import { PLACE_TYPE_META } from '@/components/ExploreMap';
import { RankRow } from '@/components/RankRow';
import { distanceKm, NEAR_RADIUS_KM } from '@/lib/geo';
import { placeTypeFor, type PlaceType } from '@/lib/placeType';
import { useData } from '@/store/DataContext';
import { useLocation } from '@/store/LocationContext';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * Ranks has one filter row: Overall, then every cuisine. Restaurants vs
 * Plates is no longer one of these chips — it's the `kind` prop, set from the
 * Ranks settings sheet (defaults to restaurants) — so the remaining chips
 * narrow *within* whichever the user picked, cuisine included, instead of
 * being a second flat mode.
 */
type RankFilter = CuisineFilterValue;

export function RanksView({
  embedded,
  scope,
  nearLocation,
  kind,
  onOpenRestaurant,
  onOpenPlate,
}: {
  embedded?: boolean;
  /** Both this and `kind` are set from the Ranks settings sheet, opened via the shared header's location chip. */
  scope: 'near' | 'global';
  /** A city picked to rank near, overriding the device location — scoped to Ranks only, doesn't touch the app-wide location setting. */
  nearLocation?: { label: string; lat: number; lng: number } | null;
  /** Defaults to restaurants; changed from the Ranks settings sheet, not a chip here. */
  kind: 'restaurants' | 'plates';
  /** Opens over this page, in Discover's shared sheet — not a separate pushed screen. */
  onOpenRestaurant: (restaurantId: string) => void;
  onOpenPlate: (orderId: string, restaurantId: string) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Embedded in Explore the screen already has a header above it, so the view
  // must not claim the status-bar inset a second time.
  const topPad = embedded ? 0 : insets.top;
  const { topRestaurants, topPlates, userFor, restaurantFor } = useData();
  const { location: deviceLocation } = useLocation();
  const location = nearLocation ?? deviceLocation;
  const [filter, setFilter] = useState<RankFilter>('overall');

  const hasCoords = location.lat != null && location.lng != null;
  // "Near" only means something once we know a location (picked or device).
  const near = scope === 'near' && hasCoords;
  const origin = hasCoords ? { lat: location.lat!, lng: location.lng! } : null;

  const withinRange = (r?: { lat?: number; lng?: number }) => {
    if (!near || !origin) return true;
    if (r?.lat == null || r?.lng == null) return false;
    return distanceKm(origin, { lat: r.lat, lng: r.lng }) <= NEAR_RADIUS_KM;
  };

  const showingPlates = kind === 'plates';
  const cuisine: PlaceType | null = filter === 'overall' ? null : filter;

  // Restaurants ranked, optionally narrowed to one cuisine. Empty in plates mode.
  const restaurants = useMemo(
    () =>
      showingPlates
        ? []
        : topRestaurants().filter((r) => withinRange(r) && (cuisine == null || placeTypeFor(r.cuisine) === cuisine)),
    [topRestaurants, showingPlates, near, origin?.lat, origin?.lng, cuisine], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Plates, narrowed to one cuisine via their own restaurant's — the same
  // filter row now applies here too, rather than plates always being
  // everything with no way to narrow it.
  const plates = useMemo(
    () =>
      showingPlates
        ? topPlates().filter((o) => {
            const r = restaurantFor(o.restaurantId);
            return withinRange(r) && (cuisine == null || (r && placeTypeFor(r.cuisine) === cuisine));
          })
        : [],
    [topPlates, restaurantFor, showingPlates, near, origin?.lat, origin?.lng, cuisine], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: topPad + 8 }}>
        {scope === 'near' && !hasCoords && (
          <Pressable onPress={() => router.push('/settings/location')} style={styles.locHintRow}>
            <Text style={[styles.locHint, { color: colors.accent }]}>Set your location to rank nearby →</Text>
          </Pressable>
        )}

        <CuisineFilterRow value={filter} onChange={setFilter} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, paddingTop: 10, paddingBottom: 110 }}>
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
                  onPress={() => onOpenPlate(o.id, o.restaurantId)}
                />
              );
            })
          ) : (
            <Empty
              text={
                cuisine
                  ? `No ranked ${PLACE_TYPE_META[cuisine].label.toLowerCase()} plates in ${location.label} yet.`
                  : `No ranked plates in ${location.label} yet.`
              }
            />
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
              onPress={() => onOpenRestaurant(r.id)}
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

function Empty({ text }: { text: string }) {
  const { colors } = useTheme();
  return <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 30, fontSize: 14, fontWeight: '500' }}>{text}</Text>;
}

const styles = StyleSheet.create({
  locHintRow: { paddingHorizontal: spacing.lg, marginBottom: 12 },
  locHint: { fontSize: 13, fontWeight: '700' },
});
