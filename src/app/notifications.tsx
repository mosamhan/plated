import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Avatar } from '@/components/Avatar';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AppNotification, NotificationKind } from '@/data/types';
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
};

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
  const { notifications, markAllNotificationsRead, userFor } = useData();

  // Snapshot what was unread when the screen opened: the badge clears right
  // away, but the row highlights persist while the user scans the list.
  const unreadAtOpen = useRef<Set<string>>(
    new Set(notifications.filter((n) => !n.read).map((n) => n.id)),
  );

  useEffect(() => {
    markAllNotificationsRead();
  }, [markAllNotificationsRead]);

  const open = (n: AppNotification) => {
    if (n.orderId) router.push(`/order/${n.orderId}`);
    else if (n.userId) router.push(`/user/${n.userId}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Activity" />
      <FlatList
        data={notifications}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        renderItem={({ item, index }) => {
          const actor = item.userId ? userFor(item.userId) : undefined;
          return (
            <Animated.View entering={FadeInDown.delay(Math.min(index * 40, 240)).duration(250)}>
              <Pressable
                onPress={() => open(item)}
                style={[
                  styles.row,
                  {
                    backgroundColor: unreadAtOpen.current.has(item.id)
                      ? colors.accentSoft
                      : colors.card,
                    borderColor: colors.border,
                  },
                ]}>
                {actor ? (
                  <Avatar uri={actor.avatar} size={42} verified={actor.verified} />
                ) : (
                  <View style={[styles.kindBubble, { backgroundColor: colors.accent }]}>
                    <Ionicons name={KIND_ICON[item.kind]} size={18} color={colors.accentText} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.text, { color: colors.text }]}>{item.text}</Text>
                  <Text style={[styles.time, { color: colors.textMuted }]}>
                    {timeAgo(item.createdAt)} ago
                  </Text>
                </View>
                <Ionicons name={KIND_ICON[item.kind]} size={16} color={colors.textMuted} />
              </Pressable>
            </Animated.View>
          );
        }}
        ListEmptyComponent={
          <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>
            Nothing yet — post a plate to get the party started.
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
  kindBubble: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 14, fontWeight: '600', lineHeight: 19 },
  time: { fontSize: 12, fontWeight: '500', marginTop: 2 },
});
