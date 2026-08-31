import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { Avatar } from '@/components/Avatar';
import { ScreenHeader } from '@/components/ScreenHeader';
import { UnderlineTabs } from '@/components/UnderlineTabs';
import { User } from '@/data/types';
import { tapLight, tick } from '@/lib/haptics';
import { useData } from '@/store/DataContext';
import { useMessages } from '@/store/MessagesContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const PEOPLE_TABS = ['Following', 'Friends', 'Suggested'] as const;
type PeopleTab = (typeof PEOPLE_TABS)[number];

/**
 * Add people to an existing group — the group-info screen's "Add people"
 * action. Same picker shape as messages/new.tsx (tabs + search), trimmed to
 * one difference: existing members are excluded from every bucket, and
 * confirming calls `addParticipants` on this conversation instead of
 * creating a new one.
 */
export default function AddPeople() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { followingUsers, friendUsers, suggestedUsers, currentUser, isBlocked } = useData();
  const { conversationFor, otherIds, addParticipants } = useMessages();

  const conversation = id ? conversationFor(id) : undefined;
  const existingMemberIds = useMemo(
    () => new Set(conversation ? otherIds(conversation).concat(currentUser.id) : [currentUser.id]),
    [conversation, otherIds, currentUser.id],
  );

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<PeopleTab>('Following');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const excluded = (u: User) => existingMemberIds.has(u.id) || isBlocked(u.id);

  const people = useMemo(() => {
    const seen = new Set<string>();
    const out: User[] = [];
    const push = (users: User[]) => {
      for (const u of users) {
        if (seen.has(u.id) || excluded(u)) continue;
        seen.add(u.id);
        out.push(u);
      }
    };
    push(followingUsers());
    push(friendUsers());
    push(suggestedUsers());
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followingUsers, friendUsers, suggestedUsers, existingMemberIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((u) => u.name.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q));
  }, [people, query]);

  const tabItems = useMemo(() => {
    if (query.trim()) return filtered;
    const bucket = tab === 'Following' ? followingUsers() : tab === 'Friends' ? friendUsers() : suggestedUsers();
    return bucket.filter((u) => !excluded(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filtered, tab, followingUsers, friendUsers, suggestedUsers, existingMemberIds]);

  const toggle = (userId: string) => {
    tick();
    setPicked((prev) => (prev.includes(userId) ? prev.filter((p) => p !== userId) : [...prev, userId]));
  };

  const onAdd = async () => {
    if (!id || picked.length === 0 || busy) return;
    setBusy(true);
    tapLight();
    const ok = await addParticipants(id, picked);
    setBusy(false);
    if (ok) router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Add people" />

      <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={17} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search people"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          style={[styles.search, { color: colors.text }]}
        />
      </View>

      {!query.trim() && <UnderlineTabs tabs={PEOPLE_TABS} value={tab} onChange={setTab} />}

      <ScrollView contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {tabItems.map((user) => {
          const on = picked.includes(user.id);
          return (
            <Pressable
              key={user.id}
              onPress={() => toggle(user.id)}
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
              <Avatar uri={user.avatar} size={44} verified={user.verified} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {user.name}
                </Text>
                <Text style={[styles.handle, { color: colors.textMuted }]} numberOfLines={1}>
                  @{user.handle}
                </Text>
              </View>
              <Ionicons
                name={on ? 'checkmark-circle' : 'ellipse-outline'}
                size={23}
                color={on ? colors.accent : colors.border}
              />
            </Pressable>
          );
        })}
        {tabItems.length === 0 && (
          <Text style={[styles.blank, { color: colors.textMuted }]}>
            {query.trim() ? `No one matches “${query}”.` : 'No one left to add here.'}
          </Text>
        )}
      </ScrollView>

      {picked.length > 0 && (
        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
          <AnimatedPressable
            pressScale={0.97}
            onPress={onAdd}
            disabled={busy}
            style={[styles.addBtn, { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }]}>
            <Text style={[styles.addText, { color: colors.accentText }]}>
              {busy ? 'Adding…' : `Add · ${picked.length}`}
            </Text>
          </AnimatedPressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  search: { flex: 1, fontSize: 15, fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.lg, paddingVertical: 9 },
  name: { fontSize: 15, fontWeight: '700' },
  handle: { fontSize: 13, fontWeight: '500', marginTop: 1 },
  blank: { textAlign: 'center', marginTop: 40, fontSize: 14, fontWeight: '500' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addBtn: { alignItems: 'center', paddingVertical: 14, borderRadius: radius.pill },
  addText: { fontSize: 15, fontWeight: '800' },
});
