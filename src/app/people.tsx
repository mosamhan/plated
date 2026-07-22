import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { FilterChips } from '@/components/FilterChips';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SuggestedFriendCard } from '@/components/SuggestedFriends';
import { User } from '@/data/types';
import { useData } from '@/store/DataContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const TABS = ['Suggested', 'Followers', 'Following'];

/**
 * People — Suggested / Followers / Following (design "PeopleScreen"). Opened
 * from the Notifications header and from a profile's follower/following counts
 * (via ?tab=). Suggested reuses the home-feed friend cards; the other two list
 * real follow relationships with an inline follow toggle.
 */
export default function People() {
  const { colors } = useTheme();
  const { tab: initialTab } = useLocalSearchParams<{ tab?: string }>();
  const { contacts, followerUsers, followingUsers, suggestedUsers } = useData();

  const normalized = initialTab
    ? TABS.find((t) => t.toLowerCase() === initialTab.toLowerCase()) ?? TABS[0]
    : TABS[0];
  const [tab, setTab] = useState(normalized);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="People" />
      <FilterChips options={TABS} value={tab} onChange={setTab} />

      {tab === 'Suggested' && (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
          <Text style={[styles.hint, { color: colors.textMuted }]}>People with taste like yours</Text>
          <View style={styles.grid}>
            {suggestedUsers().slice(0, 12).map((u) => (
              <SuggestedUserCard key={u.id} user={u} />
            ))}
            {/* Contacts not yet on Plated → invite cards (reuses home-feed card). */}
            {contacts.filter((c) => !c.onPlated).slice(0, 6).map((c) => (
              <SuggestedFriendCard key={c.id} contact={c} />
            ))}
          </View>
        </ScrollView>
      )}

      {tab === 'Followers' && <PeopleList users={followerUsers()} emptyText="No followers yet." />}
      {tab === 'Following' && <PeopleList users={followingUsers()} emptyText="You're not following anyone yet." />}
    </View>
  );
}

/** A suggested-follow card backed by a real User (vs. a phone Contact). */
function SuggestedUserCard({ user }: { user: User }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { isFollowing, toggleFollow } = useData();
  const following = isFollowing(user.id);
  return (
    <Pressable
      onPress={() => router.push(`/user/${user.id}`)}
      style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Avatar uri={user.avatar} size={58} verified={user.verified} />
      <Text style={[cardStyles.name, { color: colors.text }]} numberOfLines={1}>{user.name}</Text>
      <Text style={[cardStyles.handle, { color: colors.textMuted }]} numberOfLines={1}>@{user.handle}</Text>
      <Pressable
        onPress={() => toggleFollow(user.id)}
        style={[
          cardStyles.btn,
          following
            ? { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }
            : { backgroundColor: colors.accent },
        ]}>
        <Text style={[cardStyles.btnText, { color: following ? colors.textMuted : colors.accentText }]}>
          {following ? 'Following' : 'Follow'}
        </Text>
      </Pressable>
    </Pressable>
  );
}

function PeopleList({ users, emptyText }: { users: User[]; emptyText: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { isFollowing, toggleFollow, currentUser } = useData();

  if (users.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="people-outline" size={38} color={colors.textMuted} />
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: 10 }}>
      {users.map((u) => {
        const following = isFollowing(u.id);
        const isSelf = u.id === currentUser.id;
        return (
          <Pressable
            key={u.id}
            onPress={() => router.push(`/user/${u.id}`)}
            style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Avatar uri={u.avatar} size={48} verified={u.verified} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{u.name}</Text>
              <Text style={[styles.rowHandle, { color: colors.textMuted }]} numberOfLines={1}>@{u.handle}</Text>
            </View>
            {!isSelf && (
              <Pressable
                onPress={() => toggleFollow(u.id)}
                style={[
                  styles.followBtn,
                  following
                    ? { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }
                    : { backgroundColor: colors.accent },
                ]}>
                <Text style={[styles.followText, { color: following ? colors.textMuted : colors.accentText }]}>
                  {following ? 'Following' : 'Follow'}
                </Text>
              </Pressable>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, fontWeight: '500', marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: spacing.xl },
  emptyText: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowName: { fontSize: 15, fontWeight: '800' },
  rowHandle: { fontSize: 13, fontWeight: '600', marginTop: 1 },
  followBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: radius.pill },
  followText: { fontSize: 13, fontWeight: '800' },
});

const cardStyles = StyleSheet.create({
  card: {
    width: 130,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 10,
  },
  name: { fontSize: 14, fontWeight: '700', marginTop: 10, maxWidth: 110, textAlign: 'center' },
  handle: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  btn: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontSize: 13, fontWeight: '800' },
});
