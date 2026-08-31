import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useData } from '@/store/DataContext';
import { useSettings } from '@/store/SettingsContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/** The private list a story can be posted to instead of everyone. */
export default function CloseFriends() {
  const { colors } = useTheme();
  const { followingUsers, followerUsers, currentUser, isBlocked } = useData();
  const { closeFriends, isCloseFriend, toggleCloseFriend } = useSettings();
  const [query, setQuery] = useState('');

  const people = useMemo(() => {
    const pool = new Map<string, ReturnType<typeof followingUsers>[number]>();
    for (const u of [...followingUsers(), ...followerUsers()]) {
      if (u.id === currentUser.id || isBlocked(u.id)) continue;
      if (!pool.has(u.id)) pool.set(u.id, u);
    }
    const all = [...pool.values()];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((u) => u.name.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q));
  }, [followingUsers, followerUsers, currentUser.id, isBlocked, query]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Close friends" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={[styles.intro, { color: colors.textMuted }]}>
          We don't send a notification when you add or remove someone. {closeFriends.length} on your
          list.
        </Text>

        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={17} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={[styles.searchInput, { color: colors.text }]}
          />
        </View>

        {people.map((u) => {
          const on = isCloseFriend(u.id);
          return (
            <Pressable
              key={u.id}
              onPress={() => toggleCloseFriend(u.id)}
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
              <Avatar uri={u.avatar} size={44} verified={u.verified} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{u.name}</Text>
                <Text style={[styles.handle, { color: colors.textMuted }]} numberOfLines={1}>@{u.handle}</Text>
              </View>
              <Ionicons
                name={on ? 'checkmark-circle' : 'ellipse-outline'}
                size={23}
                color={on ? colors.success : colors.border}
              />
            </Pressable>
          );
        })}

        {people.length === 0 && (
          <Text style={[styles.blank, { color: colors.textMuted }]}>No one to show.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 13, fontWeight: '500', lineHeight: 19, paddingHorizontal: spacing.lg, paddingBottom: 12 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    marginHorizontal: spacing.lg,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.lg, paddingVertical: 9 },
  name: { fontSize: 15, fontWeight: '700' },
  handle: { fontSize: 13, fontWeight: '500', marginTop: 1 },
  blank: { textAlign: 'center', marginTop: 40, fontSize: 14, fontWeight: '500' },
});
