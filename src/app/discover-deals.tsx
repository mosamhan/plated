import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { RestaurantOffer } from '@/data/types';
import { type DiscoverScope, useNearFilter } from '@/hooks/useNearFilter';
import { useData } from '@/store/DataContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * "See all" for Discover's Exclusive Deals rail — every live offer (still
 * respecting whatever near/global scope Discover was in when this opened,
 * passed through as route params rather than a shared context, since
 * Discover's scope is otherwise just local component state), plus a search
 * box so someone can look up a specific restaurant to check for a deal
 * before heading over.
 */
export default function DiscoverDeals() {
  const { colors } = useTheme();
  const router = useRouter();
  const { scope, lat, lng } = useLocalSearchParams<{ scope?: string; lat?: string; lng?: string }>();
  const { activeOffers, restaurantFor } = useData();
  const [query, setQuery] = useState('');

  const effectiveScope: DiscoverScope = scope === 'near' ? 'near' : 'global';
  const origin = lat && lng ? { lat: Number(lat), lng: Number(lng) } : null;
  const isNear = useNearFilter(effectiveScope, origin);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activeOffers()
      .map((offer) => ({ offer, restaurant: restaurantFor(offer.restaurantId) }))
      .filter((x): x is { offer: RestaurantOffer; restaurant: NonNullable<ReturnType<typeof restaurantFor>> } => !!x.restaurant)
      .filter(({ restaurant }) => isNear(restaurant))
      .filter(({ restaurant }) => !q || restaurant.name.toLowerCase().includes(q));
  }, [activeOffers, restaurantFor, isNear, query]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Exclusive Deals" />

      <View style={styles.searchWrap}>
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={17} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search restaurants for a deal"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 4 }} showsVerticalScrollIndicator={false}>
        {items.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            {query ? `No deals match “${query}”.` : 'No deals right now — check back soon.'}
          </Text>
        ) : (
          items.map(({ offer, restaurant }) => (
            <Pressable
              key={offer.id}
              onPress={() => router.push(`/restaurant/${restaurant.id}`)}
              style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Image source={{ uri: restaurant.image }} style={styles.img} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="pricetag" size={10} color={colors.accent} />
                  <Text style={[styles.badgeText, { color: colors.accent }]}>
                    {offer.offerType === 'plated_exclusive' ? 'Plated exclusive' : 'Promo code'}
                  </Text>
                </View>
                <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                  {offer.title}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                  {restaurant.name}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: { paddingHorizontal: spacing.lg, paddingTop: 4, paddingBottom: 8 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14, fontWeight: '500' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  img: { width: 54, height: 54, borderRadius: radius.md },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    marginBottom: 3,
  },
  badgeText: { fontSize: 10, fontWeight: '800' },
  title: { fontSize: 14, fontWeight: '800', lineHeight: 18 },
  meta: { fontSize: 12, fontWeight: '500', marginTop: 2 },
});
