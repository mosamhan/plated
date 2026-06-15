import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useData } from '@/store/DataContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export default function BlockedUsers() {
  const { colors } = useTheme();
  const { blockedUsers, unblockUser } = useData();
  const blocked = blockedUsers();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Blocked users" />
      <FlatList
        data={blocked}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ padding: spacing.lg }}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Avatar uri={item.avatar} size={42} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
              <Text style={[styles.handle, { color: colors.textMuted }]}>@{item.handle}</Text>
            </View>
            <Pressable
              onPress={() => unblockUser(item.id)}
              style={[styles.unblock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.unblockText, { color: colors.text }]}>Unblock</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 14 }}>
            You haven&apos;t blocked anyone. Blocked users can&apos;t see your plates and their
            content disappears from your feeds.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  name: { fontSize: 15, fontWeight: '700' },
  handle: { fontSize: 13, fontWeight: '500', marginTop: 1 },
  unblock: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  unblockText: { fontSize: 13, fontWeight: '800' },
});
