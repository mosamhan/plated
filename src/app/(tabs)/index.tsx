import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/Logo';
import { PlateCard } from '@/components/PlateCard';
import { SectionHeader } from '@/components/SectionHeader';
import { Skeleton } from '@/components/Skeleton';
import { SuggestedFriendCard } from '@/components/SuggestedFriends';
import { useData } from '@/store/DataContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

function FeedSkeleton() {
  return (
    <View style={{ paddingHorizontal: spacing.md, gap: spacing.lg }}>
      {[0, 1].map((i) => (
        <View key={i} style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Skeleton style={{ width: 42, height: 42, borderRadius: 21 }} />
            <View style={{ gap: 6 }}>
              <Skeleton style={{ width: 140, height: 12 }} />
              <Skeleton style={{ width: 90, height: 10 }} />
            </View>
          </View>
          <Skeleton style={{ width: '100%', aspectRatio: 0.92, borderRadius: radius.lg }} />
        </View>
      ))}
    </View>
  );
}

export default function Home() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { feedOrders, contacts, unreadCount } = useData();
  const [booting, setBooting] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const orders = feedOrders();

  // Brief skeleton on first mount sells the loading experience (mock data is instant).
  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 450);
    return () => clearTimeout(t);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 900);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Fixed header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Logo size={22} />
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push('/search')} hitSlop={8}>
            <Ionicons name="search" size={23} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => router.push('/notifications')} hitSlop={8}>
            <Ionicons name="notifications-outline" size={23} color={colors.text} />
            {unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.orderCta, borderColor: colors.background }]}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {booting ? (
        <View style={{ paddingTop: spacing.lg }}>
          <FeedSkeleton />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => <PlateCard order={item} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: 110 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
              progressBackgroundColor={colors.card}
            />
          }
          ListHeaderComponent={
            <View style={{ marginBottom: spacing.sm }}>
              <SectionHeader
                title="Suggested for you"
                subtitle="Friends from your contacts on Plated"
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 12, paddingBottom: 4 }}>
                {contacts.map((c) => (
                  <SuggestedFriendCard key={c.id} contact={c} />
                ))}
              </ScrollView>

              <View style={{ height: spacing.xl }} />
              <SectionHeader title="Your feed" subtitle="Fresh plates from people you follow" />
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
