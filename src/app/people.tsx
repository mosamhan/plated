import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { PersonRow } from '@/components/PersonRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import { UnderlineTabs } from '@/components/UnderlineTabs';
import { User } from '@/data/types';
import { useData } from '@/store/DataContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

type Tab = 'followers' | 'following' | 'friends';

/** Tab order — the labels rendered in the tab row line up with this positionally. */
const TAB_ORDER: Tab[] = ['followers', 'following', 'friends'];

/**
 * People — followers, following, and friends, as three switchable tabs.
 *
 * Previously these were stacked tables in one long scroll and `?tab=` merely
 * scrolled to an offset, so "Following" on a profile with 400 followers meant
 * scrolling past all of them. Tabs make the counts glanceable and the switch
 * instant.
 *
 * **Friends = mutual follows** — they follow you *and* you follow them back.
 * That's the audience a story would go to, so it's worth being its own list
 * rather than something you infer by cross-referencing two others.
 *
 * Finding *new* people still lives on its own screen — see `discover-people`.
 */
export default function People() {
  const { colors } = useTheme();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const { followerUsers, followingUsers } = useData();

  const followers = followerUsers();
  const following = followingUsers();

  // Mutuals, ordered by the following list so the ordering matches what the
  // user sees on the neighbouring tab.
  const friends = useMemo(() => {
    const followerIds = new Set(followers.map((u) => u.id));
    return following.filter((u) => followerIds.has(u.id));
  }, [followers, following]);

  const initial: Tab =
    tab?.toLowerCase() === 'following' ? 'following' : tab?.toLowerCase() === 'friends' ? 'friends' : 'followers';
  const [active, setActive] = useState<Tab>(initial);
  const [query, setQuery] = useState('');

  // The tab control is label-driven, and these labels carry live counts —
  // so they're mapped back to the tab key positionally rather than parsed.
  const tabLabels = [
    `${followers.length} followers`,
    `${following.length} following`,
    `${friends.length} friends`,
  ];

  const listFor = (t: Tab) => (t === 'followers' ? followers : t === 'following' ? following : friends);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = listFor(active);
    if (!q) return list;
    return list.filter((u) => u.name.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, query, followers, following, friends]);

  const emptyFor: Record<Tab, string> = {
    followers: 'No followers yet.',
    following: 'You’re not following anyone yet.',
    friends: 'No friends yet — a friend is someone you follow who follows you back.',
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="People" />

      {/* Labels carry counts, so they're wider than a plain tab — the row
          scrolls rather than squeezing three long labels flat. */}
      <UnderlineTabs
        tabs={tabLabels}
        value={tabLabels[TAB_ORDER.indexOf(active)]}
        onChange={(label) => setActive(TAB_ORDER[tabLabels.indexOf(label)])}
        scrollable
      />

      <View style={styles.searchWrap}>
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={17} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
            style={[styles.searchInput, { color: colors.text }]}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {rows.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            {query ? 'Nobody matches that.' : emptyFor[active]}
          </Text>
        ) : (
          rows.map((u: User, i) => <PersonRow key={u.id} user={u} last={i === rows.length - 1} />)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: { paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: 4 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '500' },
  empty: { fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 40 },
});
