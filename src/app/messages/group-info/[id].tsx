import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { EditGroupInfo } from '@/components/EditGroupInfo';
import { GroupAvatar } from '@/components/GroupAvatar';
import { PlateTile } from '@/components/PlateTile';
import { PlatoTile } from '@/components/PlatoTile';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsRow, SettingsSection } from '@/components/SettingsKit';
import { UnderlineTabs } from '@/components/UnderlineTabs';
import { confirmAction } from '@/lib/dialog';
import { warn } from '@/lib/haptics';
import { useData } from '@/store/DataContext';
import { useMessages } from '@/store/MessagesContext';
import { usePlatos } from '@/store/PlatosContext';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const TABS = ['Members', 'Plates & Platos', 'Photos'] as const;
type Tab = (typeof TABS)[number];

const PADDING = spacing.lg;
const GRID_GAP = spacing.md;

/**
 * Group settings — reached from the group thread's header. Everything here
 * is groups-only; a 1:1 thread's options stay the small Mute/Report/Delete
 * swipe actions it already had. Deliberately missing, per the current
 * scope: chat bubble color, alert tones, invite link/QR, and in-thread
 * search — see the "messaging-group-settings-deferred" memory note.
 */
export default function GroupInfo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const { userFor, currentUser, orders } = useData();
  const { platos } = usePlatos();
  const {
    conversationFor,
    otherIds,
    messagesFor,
    isPinned,
    togglePin,
    isMuted,
    toggleMute,
    leaveConversation,
    renameGroup,
    setGroupPhoto,
    removeParticipant,
    startDirect,
  } = useMessages();

  const [tab, setTab] = useState<Tab>('Members');
  const [editOpen, setEditOpen] = useState(false);

  const conversation = id ? conversationFor(id) : undefined;
  const others = useMemo(() => (conversation ? otherIds(conversation) : []), [conversation, otherIds]);
  const messages = useMemo(() => (id ? messagesFor(id) : []), [id, messagesFor]);
  const isOwner = conversation?.createdBy === currentUser.id;

  if (!conversation || !id) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Group" />
      </View>
    );
  }

  const title = conversation.title || others.map((o) => userFor(o).name).join(', ');
  const memberAvatars = others.map((o) => userFor(o).avatar);
  const pinned = isPinned(id);
  const muted = isMuted(id);

  const plateMessages = messages.filter((m) => m.kind === 'plate' && m.attachmentId);
  const platoMessages = messages.filter((m) => m.kind === 'plato' && m.attachmentId);
  const imageMessages = messages.filter((m) => m.kind === 'image' && m.attachmentId);
  const tileWidth = (windowWidth - PADDING * 2 - GRID_GAP) / 2;
  const photoWidth = (windowWidth - PADDING * 2 - GRID_GAP * 2) / 3;

  const onMessageMember = async (userId: string) => {
    const conversationId = await startDirect(userId);
    if (conversationId) router.push(`/messages/${conversationId}`);
  };

  const onRemoveMember = (userId: string, name: string) => {
    confirmAction({
      title: `Remove ${name}?`,
      message: 'They’ll stop receiving messages from this group.',
      confirmLabel: 'Remove',
      destructive: true,
      onConfirm: () => removeParticipant(id, userId),
    });
  };

  const onReport = () => {
    // No generic "report a group" target exists — the real, working thing
    // to report is the person who created it.
    router.push(`/report?targetType=user&targetId=${conversation.createdBy}`);
  };

  const onLeave = () => {
    warn();
    confirmAction({
      title: 'Leave this group?',
      message: 'You’ll stop receiving messages from it.',
      confirmLabel: 'Leave',
      destructive: true,
      onConfirm: () => {
        leaveConversation(id);
        router.back();
        router.back();
      },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Group info" />

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.header}>
          <Pressable onPress={() => setEditOpen(true)}>
            <GroupAvatar avatarUrl={conversation.avatarUrl} memberAvatars={memberAvatars} size={84} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.editLink, { color: colors.accent }]} onPress={() => setEditOpen(true)}>
            Edit group info
          </Text>
        </View>

        <View style={{ paddingHorizontal: PADDING }}>
          <SettingsSection>
            <SettingsRow
              icon="person-add-outline"
              label="Add people"
              onPress={() => router.push(`/messages/add-people/${id}`)}
            />
            <SettingsRow
              icon="pin-outline"
              label="Pin to top"
              value={pinned ? 'On' : 'Off'}
              onPress={() => togglePin(id)}
            />
            <SettingsRow
              icon="notifications-outline"
              label="Notifications"
              value={muted ? 'Off' : 'All'}
              onPress={() => toggleMute(id)}
            />
            <SettingsRow icon="flag-outline" label="Report" onPress={onReport} />
            <SettingsRow icon="log-out-outline" label="Leave group" destructive onPress={onLeave} last />
          </SettingsSection>
        </View>

        <UnderlineTabs tabs={TABS} value={tab} onChange={setTab} scrollable />

        <View style={{ paddingHorizontal: PADDING, paddingTop: spacing.md }}>
          {tab === 'Members' && (
            <View style={{ gap: 4 }}>
              <Text style={[styles.memberCount, { color: colors.textMuted }]}>
                {others.length + 1} members
              </Text>
              <MemberRow
                user={currentUser}
                isSelf
                isOwner={isOwner}
                ownerLabel={conversation.createdBy === currentUser.id}
              />
              {others.map((userId) => {
                const user = userFor(userId);
                return (
                  <MemberRow
                    key={userId}
                    user={user}
                    ownerLabel={conversation.createdBy === userId}
                    onMessage={() => onMessageMember(userId)}
                    onRemove={isOwner ? () => onRemoveMember(userId, user.name) : undefined}
                  />
                );
              })}
            </View>
          )}

          {tab === 'Plates & Platos' && (
            <View style={styles.grid}>
              {plateMessages.map((m) => {
                const order = orders.find((o) => o.id === m.attachmentId);
                return order ? <PlateTile key={m.id} order={order} width={tileWidth} /> : null;
              })}
              {platoMessages.map((m) => {
                const video = platos.find((p) => p.id === m.attachmentId);
                return video ? <PlatoTile key={m.id} video={video} width={tileWidth} /> : null;
              })}
              {plateMessages.length === 0 && platoMessages.length === 0 && (
                <Text style={[styles.blank, { color: colors.textMuted }]}>
                  Nothing shared here yet.
                </Text>
              )}
            </View>
          )}

          {tab === 'Photos' && (
            <View style={styles.photoGrid}>
              {imageMessages.map((m) => (
                <Pressable key={m.id} onPress={() => router.push(`/messages/${id}`)}>
                  <Image
                    source={{ uri: m.attachmentId ?? '' }}
                    style={{ width: photoWidth, height: photoWidth, borderRadius: 6 }}
                    contentFit="cover"
                  />
                </Pressable>
              ))}
              {imageMessages.length === 0 && (
                <Text style={[styles.blank, { color: colors.textMuted }]}>No photos sent here yet.</Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      <EditGroupInfo
        visible={editOpen}
        initialName={conversation.title ?? title}
        initialAvatarUrl={conversation.avatarUrl}
        memberAvatars={memberAvatars}
        onClose={() => setEditOpen(false)}
        onSave={(name, avatarUrl) => {
          renameGroup(id, name);
          if (avatarUrl && avatarUrl !== conversation.avatarUrl) setGroupPhoto(id, avatarUrl);
        }}
      />
    </View>
  );
}

function MemberRow({
  user,
  isSelf,
  isOwner,
  ownerLabel,
  onMessage,
  onRemove,
}: {
  user: { id: string; name: string; handle: string; avatar: string; verified: boolean };
  isSelf?: boolean;
  isOwner?: boolean;
  ownerLabel?: boolean;
  onMessage?: () => void;
  onRemove?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.memberRow}>
      <Avatar uri={user.avatar} size={44} verified={user.verified} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
          {user.name}
          {isSelf ? ' (You)' : ''}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[styles.memberHandle, { color: colors.textMuted }]} numberOfLines={1}>
            @{user.handle}
          </Text>
          {ownerLabel && (
            <View style={[styles.ownerBadge, { backgroundColor: colors.surface }]}>
              <Text style={[styles.ownerBadgeText, { color: colors.textMuted }]}>Owner</Text>
            </View>
          )}
        </View>
      </View>
      {!isSelf && onMessage && (
        <Pressable
          onPress={onMessage}
          style={[styles.messageBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.messageBtnText, { color: colors.text }]}>Message</Text>
        </Pressable>
      )}
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={8} style={{ marginLeft: 6 }}>
          <Ionicons name="close-circle-outline" size={20} color={colors.ratingLow} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', paddingVertical: spacing.lg, gap: 6 },
  title: { fontSize: 18, fontWeight: '800', maxWidth: '80%' },
  editLink: { fontSize: 14, fontWeight: '700' },
  memberCount: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3, marginBottom: 4 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  memberName: { fontSize: 15, fontWeight: '700' },
  memberHandle: { fontSize: 13, fontWeight: '500', marginTop: 1 },
  ownerBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  ownerBadgeText: { fontSize: 10, fontWeight: '800' },
  messageBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  messageBtnText: { fontSize: 12, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  blank: { fontSize: 14, fontWeight: '500', textAlign: 'center', marginTop: 40, width: '100%' },
});
