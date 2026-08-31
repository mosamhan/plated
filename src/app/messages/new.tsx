import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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
 * Start a conversation.
 *
 * One screen for both 1:1 and group: pick one person and it's a chat, pick more
 * and it becomes a group with an optional name. A separate "new group" flow
 * would only ask the user to decide, up front, something the picker already
 * knows by the time they're done.
 *
 * People you follow lead the list — that's who you actually message.
 */
export default function NewMessage() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { followingUsers, friendUsers, suggestedUsers, currentUser, isBlocked } = useData();
  const { startDirect, createGroup } = useMessages();

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<PeopleTab>('Following');
  const [picked, setPicked] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [busy, setBusy] = useState(false);

  // Flattened + deduped across all three buckets — used for global search and
  // for looking up a picked person's name in the chip rail, regardless of
  // which tab they came from. "Friends" is a subset of "Following" (a mutual
  // follow is still a follow), so this collapses to whichever bucket saw them
  // first; that's fine here since it's not what decides tab membership.
  const people = useMemo(() => {
    const seen = new Set<string>([currentUser.id]);
    const out: User[] = [];
    const push = (users: User[]) => {
      for (const u of users) {
        if (seen.has(u.id) || isBlocked(u.id)) continue;
        seen.add(u.id);
        out.push(u);
      }
    };
    push(followingUsers());
    push(friendUsers());
    push(suggestedUsers());
    return out;
  }, [followingUsers, friendUsers, suggestedUsers, currentUser.id, isBlocked]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((u) => u.name.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q));
  }, [people, query]);

  // Tabs only make sense on the unfiltered list — a search result is one list
  // of matches across everyone, not three separate buckets.
  const tabItems = useMemo(() => {
    if (query.trim()) return filtered;
    const bucket = tab === 'Following' ? followingUsers() : tab === 'Friends' ? friendUsers() : suggestedUsers();
    return bucket.filter((u) => u.id !== currentUser.id && !isBlocked(u.id));
  }, [query, filtered, tab, followingUsers, friendUsers, suggestedUsers, currentUser.id, isBlocked]);

  const toggle = (id: string) => {
    tick();
    setPicked((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const isGroup = picked.length > 1;

  const onStart = async () => {
    if (picked.length === 0 || busy) return;
    setBusy(true);
    tapLight();
    const id = isGroup ? await createGroup(picked, groupName) : await startDirect(picked[0]);
    setBusy(false);
    if (!id) return;
    // Replace, so backing out of the thread lands on the inbox rather than
    // dropping the user into the picker they just finished with.
    router.replace(`/messages/${id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="New message" />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        {/* Selected people ride along as chips so a long scroll never loses
            track of who's already in the group. */}
        {picked.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            // Without flexGrow:0 this horizontal rail takes the column's spare
            // height and stretches each chip into a tall lozenge.
            style={styles.chipsRail}
            contentContainerStyle={styles.chips}>
            {picked.map((id) => {
              const u = people.find((p) => p.id === id);
              if (!u) return null;
              return (
                <Pressable
                  key={id}
                  onPress={() => toggle(id)}
                  style={[styles.chip, { backgroundColor: colors.accentSoft }]}>
                  <Avatar uri={u.avatar} size={20} />
                  <Text style={[styles.chipText, { color: colors.accent }]} numberOfLines={1}>
                    {u.name.split(' ')[0]}
                  </Text>
                  <Ionicons name="close" size={13} color={colors.accent} />
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {isGroup && (
          <TextInput
            value={groupName}
            onChangeText={setGroupName}
            placeholder="Group name (optional)"
            placeholderTextColor={colors.textMuted}
            maxLength={60}
            style={[
              styles.groupName,
              { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
            ]}
          />
        )}

        {!query.trim() && (
          <UnderlineTabs tabs={PEOPLE_TABS} value={tab} onChange={setTab} />
        )}

        <ScrollView
          contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
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
              {query.trim() ? `No one matches “${query}”.` : 'No one here yet.'}
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {picked.length > 0 && (
        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
          <AnimatedPressable
            pressScale={0.97}
            onPress={onStart}
            disabled={busy}
            style={[styles.startBtn, { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }]}>
            <Text style={[styles.startText, { color: colors.accentText }]}>
              {busy
                ? 'Opening…'
                : isGroup
                  ? `Create group · ${picked.length}`
                  : 'Start chat'}
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
    marginBottom: 10,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  search: { flex: 1, fontSize: 15, fontWeight: '500' },
  chipsRail: { flexGrow: 0 },
  chips: { alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg, paddingBottom: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 5,
    paddingRight: 9,
    paddingVertical: 5,
    borderRadius: radius.pill,
    maxWidth: 160,
  },
  chipText: { fontSize: 12, fontWeight: '800' },
  groupName: {
    marginHorizontal: spacing.lg,
    marginBottom: 12,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
  },
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
  startBtn: { alignItems: 'center', paddingVertical: 14, borderRadius: radius.pill },
  startText: { fontSize: 15, fontWeight: '800' },
});
