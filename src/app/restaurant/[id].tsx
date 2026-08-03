import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RestaurantDetailSheet } from '@/components/RestaurantDetailSheet';
import { exploreRouteHref } from '@/lib/inAppRoute';
import { useData } from '@/store/DataContext';
import { useTheme } from '@/theme/ThemeContext';

/**
 * A restaurant opened from anywhere that isn't the map — the home feed, a
 * collection, the leaderboard, an order, a Plato.
 *
 * This renders the *same* `RestaurantDetailSheet` the Discover map opens rather
 * than a second layout of its own. It used to be a bespoke screen, and the two
 * had already drifted: this one had no plate/place switch, no menu and no top
 * raters. One component means they can't diverge again.
 *
 * Kept as a route (rather than pushing the card into every caller) so all the
 * existing `/restaurant/[id]` links and deep links keep working untouched.
 */
export default function RestaurantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { restaurantFor } = useData();
  // Local, because the switch is only offered when the sheet has somewhere to
  // put the state — the map keeps its own copy for the same reason.
  const [side, setSide] = useState<'place' | 'plate'>('place');

  const restaurant = restaurantFor(id);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {!restaurant && (
        <Text style={[styles.missing, { color: colors.textMuted }]}>Restaurant not found.</Text>
      )}
      <RestaurantDetailSheet
        restaurantId={id}
        onClose={() => router.back()}
        side={side}
        onSideChange={setSide}
        // No map behind this screen, so Directions hands the destination to
        // Explore to draw — same path the search results use.
        onRoute={(restaurantId) => {
          const r = restaurantFor(restaurantId);
          if (r?.lat == null || r?.lng == null) return;
          router.navigate(exploreRouteHref({ id: restaurantId, name: r.name, lat: r.lat, lng: r.lng }));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  missing: { fontSize: 15, fontWeight: '600' },
});
