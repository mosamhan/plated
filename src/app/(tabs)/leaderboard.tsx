import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilterChips } from '@/components/FilterChips';
import { RankRow } from '@/components/RankRow';
import { formatCount } from '@/components/StatPill';
import { useData } from '@/store/DataContext';
import { spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const TABS = ['Best Restaurants', 'Best Plates', 'Top Creators'];

export default function Leaderboard() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { topRestaurants, topPlates, topCreators, userFor, restaurantFor } = useData();
  const [tab, setTab] = useState(TABS[0]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8 }}>
        <Text style={[typography.title, { color: colors.text, paddingHorizontal: spacing.lg }]}>
          Leaderboard
        </Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          NYC&apos;s best, ranked by the Plated community
        </Text>
        <FilterChips options={TABS} value={tab} onChange={setTab} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 110 }}>
        {tab === 'Best Restaurants' &&
          topRestaurants().map((r, i) => (
            <RankRow
              key={r.id}
              rank={i + 1}
              image={r.image}
              title={r.name}
              subtitle={`${r.cuisine} · ${r.orderCount} plates rated`}
              score={r.platedRating}
              onPress={() => router.push(`/restaurant/${r.id}`)}
            />
          ))}

        {tab === 'Best Plates' &&
          topPlates().map((o, i) => {
            const r = restaurantFor(o.restaurantId);
            const u = userFor(o.userId);
            // FTC: monetized endorsements are disclosed wherever they appear.
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
          })}

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

const styles = StyleSheet.create({
  sub: {
    fontSize: 14,
    fontWeight: '500',
    paddingHorizontal: spacing.lg,
    marginTop: 4,
    marginBottom: 16,
  },
});
