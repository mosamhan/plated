import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { rowDivider, SectionTable } from '@/components/SectionTable';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AppNotification, NotificationKind } from '@/data/types';
import { useCollabs } from '@/store/CollabsContext';
import { useData } from '@/store/DataContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const KIND_ICON: Record<NotificationKind, keyof typeof Ionicons.glyphMap> = {
  like: 'heart',
  comment: 'chatbubble',
  follow: 'person-add',
  reorder: 'repeat',
  earnings: 'cash',
  milestone: 'trophy',
  collab: 'people-circle',
};

/**
 * Sections replace what used to be filter chips: every category is on screen at
 * once with its own count, so nothing is hidden behind a tap and the shape
 * matches the People screen. Empty categories drop out entirely.
 */
const SECTIONS: { title: string; kinds: NotificationKind[] }[] = [
  { title: 'Likes', kinds: ['like'] },
  { title: 'Comments', kinds: ['comment'] },
  { title: 'Follows', kinds: ['follow'] },
  { title: 'Reorders', kinds: ['reorder'] },
  { title: 'Collabs', kinds: ['collab'] },
  { title: 'Earnings & milestones', kinds: ['earnings', 'milestone'] },
];

const byDate = (a: AppNotification, b: AppNotification) =>
  +new Date(b.createdAt) - +new Date(a.createdAt);

function timeAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - +new Date(iso)) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export default function Notifications() {
  const { colors } = useTheme();
  const router = useRouter();
  const { notifications, markAllNotificationsRead } = useData();
  const { pending } = useCollabs();

  // Marked read on the way *out*, not on arrival. Clearing on arrival meant
  // reading `read` was useless here, and snapshotting instead couldn't work
  // either — the list arrives from the server after first render, so the
  // snapshot was always empty. Leaving it until unmount keeps rows in "New"
  // while they're being read and still clears the badge as soon as you leave.
  useEffect(() => () => markAllNotificationsRead(), [markAllNotificationsRead]);

  // Unread goes up top regardless of kind — that's what you came to read. The
  // categories below hold only the rest, so nothing appears twice.
  const fresh = useMemo(() => notifications.filter((n) => !n.read).sort(byDate), [notifications]);

  const grouped = useMemo(
    () =>
      SECTIONS.map((s) => ({
        ...s,
        items: notifications.filter((n) => s.kinds.includes(n.kind) && n.read).sort(byDate),
      })),
    [notifications],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Notifications" />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}>
        {/* An invite needs an answer, so it gets its own way in rather than
            sitting in the list hoping to be tapped. */}
        {pending.length > 0 && (
          <Pressable
            onPress={() => router.push('/collabs')}
            style={({ pressed }) => [
              styles.collabBanner,
              { backgroundColor: colors.accentSoft, borderColor: colors.accent, opacity: pressed ? 0.8 : 1 },
            ]}>
            <Ionicons name="people-circle" size={22} color={colors.accent} />
            <Text style={[styles.collabText, { color: colors.text }]}>
              {pending.length === 1
                ? '1 collab invite waiting on you'
                : `${pending.length} collab invites waiting on you`}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        )}

        <SectionTable
          title="New"
          count={fresh.length}
          rows={fresh.map((n, i) => (
            <NotificationRow key={n.id} notification={n} unread last={i === fresh.length - 1} />
          ))}
        />

        {grouped.map((s) => (
          <SectionTable
            key={s.title}
            title={s.title}
            count={s.items.length}
            rows={s.items.map((n, i) => (
              <NotificationRow key={n.id} notification={n} last={i === s.items.length - 1} />
            ))}
          />
        ))}

        {notifications.length === 0 && (
          <Text style={[styles.blank, { color: colors.textMuted }]}>
            Nothing yet — post a plate to get the party started.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

function NotificationRow({
  notification: n,
  unread,
  last,
}: {
  notification: AppNotification;
  /** Tints the row — only the "New" group passes it. */
  unread?: boolean;
  last: boolean;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const { userFor } = useData();
  const { pending } = useCollabs();
  const actor = n.userId ? userFor(n.userId) : undefined;
  // Only unanswered invites go to the invite screen; an accepted one is history.
  const pendingCollab = pending.some(
    (c) => c.target.id === (n.platoId ?? n.orderId),
  );

  const open = () => {
    // A collab notification is a question, not a link — route to where it can
    // be answered rather than to the post itself.
    if (n.kind === 'collab' && pendingCollab) router.push('/collabs');
    else if (n.platoId) router.push(`/plato/${n.platoId}`);
    else if (n.orderId) router.push(`/order/${n.orderId}`);
    else if (n.userId) router.push(`/user/${n.userId}`);
  };

  return (
    <Pressable
      onPress={open}
      style={({ pressed }) => [
        styles.row,
        rowDivider(colors.border, last),
        // Unread keeps its tint inside the table instead of becoming a separate
        // card, so the group still reads as one list.
        unread && { backgroundColor: colors.accentSoft },
        { opacity: pressed ? 0.7 : 1 },
      ]}>
      {actor ? (
        <Avatar uri={actor.avatar} size={42} verified={actor.verified} />
      ) : (
        <View style={[styles.kindBubble, { backgroundColor: colors.accent }]}>
          <Ionicons name={KIND_ICON[n.kind]} size={18} color={colors.accentText} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.text, { color: colors.text }]}>{n.text}</Text>
        <Text style={[styles.time, { color: colors.textMuted }]}>{timeAgo(n.createdAt)} ago</Text>
      </View>
      <Ionicons name={KIND_ICON[n.kind]} size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 11 },
  kindBubble: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 14, fontWeight: '600', lineHeight: 19 },
  time: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  blank: { textAlign: 'center', marginTop: 40, fontSize: 14, fontWeight: '500' },
  collabBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    marginBottom: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  collabText: { flex: 1, fontSize: 14, fontWeight: '800' },
});
