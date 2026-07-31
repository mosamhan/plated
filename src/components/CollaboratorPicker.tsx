import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { User } from '@/data/types';
import { tapLight } from '@/lib/haptics';
import { useData } from '@/store/DataContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

interface Props {
  /** Selected collaborator ids, owned by the create screen. */
  value: string[];
  onChange: (ids: string[]) => void;
}

const SHOWN = 6;

/**
 * Picks co-creators for a post being written.
 *
 * States plainly that earnings don't move: a collaboration is credit, and
 * whoever posts keeps the creator earnings. Saying so at the point of invite
 * avoids anyone assuming a split that Plated never makes.
 */
export function CollaboratorPicker({ value, onChange }: Props) {
  const { colors } = useTheme();
  const { followingUsers, topCreators, currentUser } = useData();
  const [query, setQuery] = useState('');

  // People you follow first — a collab is usually with someone you know — then
  // other creators to fill the list out.
  const candidates = useMemo(() => {
    const seen = new Set<string>([currentUser.id]);
    const out: User[] = [];
    for (const u of [...followingUsers(), ...topCreators()]) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      out.push(u);
    }
    return out;
  }, [followingUsers, topCreators, currentUser.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? candidates.filter(
          (u) => u.name.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q),
        )
      : candidates;
    // Anyone already chosen stays visible even when the search excludes them,
    // so a selection can always be undone.
    const picked = candidates.filter((u) => value.includes(u.id) && !matches.includes(u));
    return [...picked, ...matches].slice(0, SHOWN);
  }, [candidates, query, value]);

  const toggle = (id: string) => {
    tapLight();
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  if (candidates.length === 0) return null;

  return (
    <View>
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        They’ll be asked to accept before their name shows. Credit only — you keep the creator
        earnings on anything ordered from this post.
      </Text>

      <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={15} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search people"
          placeholderTextColor={colors.textMuted}
          style={[styles.searchInput, { color: colors.text }]}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingVertical: 10, paddingRight: spacing.lg }}>
        {filtered.map((u) => {
          const picked = value.includes(u.id);
          return (
            <Pressable
              key={u.id}
              onPress={() => toggle(u.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: picked ? colors.accentSoft : colors.card,
                  borderColor: picked ? colors.accent : colors.border,
                },
              ]}>
              <Avatar uri={u.avatar} size={30} />
              <Text style={[styles.chipName, { color: colors.text }]} numberOfLines={1}>
                {u.name}
              </Text>
              {picked && <Ionicons name="checkmark-circle" size={16} color={colors.accent} />}
            </Pressable>
          );
        })}
        {filtered.length === 0 && (
          <Text style={[styles.hint, { color: colors.textMuted }]}>Nobody matches “{query}”.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, fontWeight: '500', lineHeight: 18, marginBottom: 10 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 6,
    paddingRight: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 190,
  },
  chipName: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
});
