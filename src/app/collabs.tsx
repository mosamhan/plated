import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ScreenHeader } from '@/components/ScreenHeader';
import { rowDivider, SectionTable } from '@/components/SectionTable';
import { success, tapLight } from '@/lib/haptics';
import { PendingCollab, useCollabs } from '@/store/CollabsContext';
import { useData } from '@/store/DataContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * Collab invites waiting on you.
 *
 * Accepting is what makes a collaboration public — until then the invite is only
 * visible to you and whoever sent it. Nothing here moves money: the post's owner
 * keeps the creator earnings, which the copy says outright so accepting can't be
 * mistaken for agreeing to a split.
 */
export default function Collabs() {
  const { colors } = useTheme();
  const { pending } = useCollabs();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Collab invites" />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}>
        <SectionTable
          title="Waiting on you"
          count={pending.length}
          rows={pending.map((c, i) => (
            <InviteRow key={c.id} collab={c} last={i === pending.length - 1} />
          ))}
          empty={{ icon: 'people-circle-outline', text: 'No collab invites right now.' }}
        />

        <Text style={[styles.footnote, { color: colors.textMuted }]}>
          Accepting adds your name and photo to the post. Credit only — whoever posted it keeps the
          creator earnings on anything ordered from it.
        </Text>
      </ScrollView>
    </View>
  );
}

function InviteRow({ collab, last }: { collab: PendingCollab; last: boolean }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { userFor } = useData();
  const { respond } = useCollabs();
  const owner = userFor(collab.invitedBy);

  const open = () =>
    router.push(
      collab.target.type === 'plato' ? `/plato/${collab.target.id}` : `/order/${collab.target.id}`,
    );

  return (
    <View style={[styles.row, rowDivider(colors.border, last)]}>
      <Pressable style={styles.who} onPress={open}>
        {collab.photo ? (
          <Image source={{ uri: collab.photo }} style={styles.thumb} contentFit="cover" />
        ) : (
          <Avatar uri={owner.avatar} size={44} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
            {owner.name} invited you onto{' '}
            {collab.target.type === 'plato' ? 'their Plato of the' : 'their'} {collab.dishName}
          </Text>
          <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
            @{owner.handle}
          </Text>
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            success();
            respond(collab.id, 'accepted');
          }}
          hitSlop={6}
          style={[styles.accept, { backgroundColor: colors.accent }]}>
          <Text style={[styles.acceptText, { color: colors.accentText }]}>Accept</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            tapLight();
            respond(collab.id, 'declined');
          }}
          hitSlop={6}
          style={[styles.decline, { borderColor: colors.border }]}>
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 10, paddingHorizontal: 12, paddingVertical: 12 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 44, height: 44, borderRadius: radius.md },
  name: { fontSize: 14, fontWeight: '700', lineHeight: 19 },
  meta: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 56 },
  accept: { paddingHorizontal: 18, paddingVertical: 7, borderRadius: radius.pill },
  acceptText: { fontSize: 13, fontWeight: '800' },
  decline: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footnote: { fontSize: 12, fontWeight: '500', lineHeight: 17, marginTop: 4 },
});
