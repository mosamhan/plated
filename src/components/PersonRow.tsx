import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { rowDivider } from '@/components/SectionTable';
import { User } from '@/data/types';
import { useData } from '@/store/DataContext';
import { radius } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

interface Props {
  user: User;
  last: boolean;
  /**
   * Why this person is on screen ("Also rated Lou Malnati's"). Replaces the
   * handle, which says nothing a suggestion list can act on.
   */
  reason?: string;
}

/** One person in a {@link SectionTable}: avatar, who they are, follow toggle. */
export function PersonRow({ user, last, reason }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const { isFollowing, toggleFollow, currentUser } = useData();
  const following = isFollowing(user.id);
  const isSelf = user.id === currentUser.id;

  return (
    <Pressable
      onPress={() => router.push(`/user/${user.id}`)}
      style={({ pressed }) => [styles.row, rowDivider(colors.border, last), { opacity: pressed ? 0.7 : 1 }]}>
      <Avatar uri={user.avatar} size={44} verified={user.verified} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {user.name}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {reason ?? `@${user.handle}`}
        </Text>
      </View>
      {!isSelf && (
        <Pressable
          onPress={() => toggleFollow(user.id)}
          hitSlop={6}
          style={[
            styles.followBtn,
            following
              ? {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: StyleSheet.hairlineWidth,
                }
              : { backgroundColor: colors.accent },
          ]}>
          <Text style={[styles.followText, { color: following ? colors.textMuted : colors.accentText }]}>
            {following ? 'Following' : 'Follow'}
          </Text>
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 11 },
  name: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 13, fontWeight: '600', marginTop: 1 },
  followBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: radius.pill },
  followText: { fontSize: 13, fontWeight: '800' },
});
