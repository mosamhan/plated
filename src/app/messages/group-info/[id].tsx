import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ChatBubbleColorSheet } from '@/components/ChatBubbleColorSheet';
import { CollectionRow } from '@/components/ProfileView';
import { EditGroupInfo } from '@/components/EditGroupInfo';
import { IconAction, IconActionRow } from '@/components/IconAction';
import { InviteLinkSheet } from '@/components/InviteLinkSheet';
import { GroupAvatar } from '@/components/GroupAvatar';
import { PlateTile } from '@/components/PlateTile';
import { PlatoTile } from '@/components/PlatoTile';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SegmentedPill } from '@/components/discover/SegmentedPill';
import { SettingsRow, SettingsSection } from '@/components/SettingsKit';
import { StreakUnlockModal } from '@/components/StreakUnlockModal';
import { UnderlineTabs } from '@/components/UnderlineTabs';
import { confirmAction } from '@/lib/dialog';
import { useConversationStreak } from '@/lib/conversationStreak';
import { warn } from '@/lib/haptics';
import { groupInviteLink } from '@/lib/invite';
import { useData } from '@/store/DataContext';
import { useMessages } from '@/store/MessagesContext';
import { usePlatos } from '@/store/PlatosContext';
import { usePublicCollections } from '@/store/usePublicCollections';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const TABS = ['Members', 'Plates & Platos', 'Collections', 'Photos'] as const;
type Tab = (typeof TABS)[number];

// No "All" — plate tiles (square, rating badge) and Plato tiles (3:4, play
// glyph, view count) look different enough side by side that mixing them
// in one grid reads as a mistake rather than a combined view.
const CONTENT_FILTERS = ['Plates', 'Platos'] as const;
type ContentFilter = (typeof CONTENT_FILTERS)[number];

const PADDING = spacing.lg;
const GRID_GAP = spacing.md;

/**
 * Group settings — reached from the group thread's header. Everything here
 * is groups-only; a 1:1 thread's options stay the small Mute/Report/Delete
 * swipe actions it already had. Deliberately missing, per the current
 * scope: alert tones — see the "messaging-group-settings-deferred" memory
 * note. Chat bubble color, the invite link/QR (owner-only), and in-thread
 * search (via the thread's own header, `messages/[id].tsx`) have since
 * been built.
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
    bubbleColorFor,
    setBubbleColor,
    leaveConversation,
    renameGroup,
    setGroupPhoto,
    removeParticipant,
    startDirect,
    getInviteCode,
  } = useMessages();

  const [tab, setTab] = useState<Tab>('Members');
  const [contentFilter, setContentFilter] = useState<ContentFilter>('Plates');
  const [editOpen, setEditOpen] = useState(false);
  const [bubbleSheetOpen, setBubbleSheetOpen] = useState(false);
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);

  const conversation = id ? conversationFor(id) : undefined;
  const others = useMemo(() => (conversation ? otherIds(conversation) : []), [conversation, otherIds]);
  const messages = useMemo(() => (id ? messagesFor(id) : []), [id, messagesFor]);
  const isOwner = conversation?.createdBy === currentUser.id;
  const { current: streakCount } = useConversationStreak(conversation ? id : undefined);

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
  const bubbleColor = bubbleColorFor(id);

  const plateMessages = messages.filter((m) => m.kind === 'plate' && m.attachmentId);
  const platoMessages = messages.filter((m) => m.kind === 'plato' && m.attachmentId);
  const visiblePlates = contentFilter === 'Platos' ? [] : plateMessages;
  const visiblePlatos = contentFilter === 'Plates' ? [] : platoMessages;
  // Flattened so an album message contributes every one of its photos to the
  // grid individually, rather than just its first (or being skipped, since
  // album messages don't carry a single `attachmentId`).
  const photoUris = messages
    .filter((m) => m.kind === 'image')
    .flatMap((m) => (m.attachmentIds?.length ? m.attachmentIds : m.attachmentId ? [m.attachmentId] : []));
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '90%' }}>
            <Text style={[styles.title, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>
              {title}
            </Text>
            {streakCount >= 3 && (
              <View style={styles.streakBadge}>
                <Text style={styles.streakBadgeText}>🔥{streakCount}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.editLink, { color: colors.accent }]} onPress={() => setEditOpen(true)}>
            Edit group info
          </Text>

          {/* Matches chat-info's own View profile/Create group row — same
              shared component, same spot under the picture, different
              actions because these two are specific to a group. Invite
              link is owner-only (0058's RPC would refuse anyone else
              anyway), so it just doesn't offer a button that would fail. */}
          <IconActionRow>
            <IconAction
              icon="person-add-outline"
              label="Add people"
              onPress={() => router.push(`/messages/add-people/${id}`)}
            />
            {isOwner && (
              <IconAction
                icon="qr-code-outline"
                label="Invite link"
                onPress={() => setInviteSheetOpen(true)}
              />
            )}
          </IconActionRow>
        </View>

        <View style={{ paddingHorizontal: PADDING }}>
          <SettingsSection>
            <SettingsRow
              icon="color-palette-outline"
              label="Chat bubble"
              onPress={() => setBubbleSheetOpen(true)}
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

        {/* A filter narrowing the grid already on screen, not a second
            level of navigation — stays a compact centered pill rather than
            the full-bleed rail above it, which otherwise stretches "Plates"
            and "Platos" to opposite edges of the screen with nothing
            between them. */}
        {tab === 'Plates & Platos' && (
          <View style={{ alignItems: 'center', paddingTop: spacing.md }}>
            <SegmentedPill
              value={contentFilter}
              onChange={setContentFilter}
              options={CONTENT_FILTERS.map((t) => ({ key: t, label: t }))}
              minWidth={0}
              fontSize={13}
              compact
            />
          </View>
        )}

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
              {visiblePlates.map((m) => {
                const order = orders.find((o) => o.id === m.attachmentId);
                return order ? <PlateTile key={m.id} order={order} width={tileWidth} /> : null;
              })}
              {visiblePlatos.map((m) => {
                const video = platos.find((p) => p.id === m.attachmentId);
                return video ? <PlatoTile key={m.id} video={video} width={tileWidth} /> : null;
              })}
              {visiblePlates.length === 0 && visiblePlatos.length === 0 && (
                <Text style={[styles.blank, { color: colors.textMuted }]}>
                  {contentFilter === 'Plates' ? 'No plates shared here yet.' : 'No Platos shared here yet.'}
                </Text>
              )}
            </View>
          )}

          {tab === 'Collections' && (
            <View style={{ gap: spacing.lg }}>
              <Text style={[styles.collectionsHint, { color: colors.textMuted }]}>
                Public collections from everyone in this group.
              </Text>
              <MemberCollections user={currentUser} />
              {others.map((userId) => (
                <MemberCollections key={userId} user={userFor(userId)} />
              ))}
            </View>
          )}

          {tab === 'Photos' && (
            <View style={styles.photoGrid}>
              {photoUris.map((uri, i) => (
                <Pressable key={`${uri}-${i}`} onPress={() => router.push(`/messages/${id}`)}>
                  <Image
                    source={{ uri }}
                    recyclingKey={uri}
                    cachePolicy="memory-disk"
                    transition={150}
                    style={{ width: photoWidth, height: photoWidth, borderRadius: 6 }}
                    contentFit="cover"
                  />
                </Pressable>
              ))}
              {photoUris.length === 0 && (
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

      <ChatBubbleColorSheet
        visible={bubbleSheetOpen}
        current={bubbleColor}
        onClose={() => setBubbleSheetOpen(false)}
        onSelect={(color) => {
          setBubbleColor(id, color);
          setBubbleSheetOpen(false);
        }}
      />

      {isOwner && (
        <InviteLinkSheet
          visible={inviteSheetOpen}
          onClose={() => setInviteSheetOpen(false)}
          getLink={async (regenerate) => {
            const code = await getInviteCode(id, regenerate);
            return code ? groupInviteLink(code) : null;
          }}
        />
      )}

      <StreakUnlockModal conversationId={id} streakCount={streakCount} />
    </View>
  );
}

/**
 * One member's shared lists, headed by who they belong to — silently renders
 * nothing while loading or once loaded empty, so a group of mostly-private
 * savers doesn't leave a wall of "Nothing here" repeated once per person.
 */
function MemberCollections({ user }: { user: { id: string; name: string; avatar: string; verified: boolean } }) {
  const { colors } = useTheme();
  const { collections, loading } = usePublicCollections(user.id);
  if (loading || collections.length === 0) return null;

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.collectionsOwnerRow}>
        <Avatar uri={user.avatar} size={22} verified={user.verified} />
        <Text style={[styles.collectionsOwnerName, { color: colors.text }]} numberOfLines={1}>
          {user.name}
        </Text>
      </View>
      {collections.map((c) => (
        <CollectionRow key={c.id} collection={c} />
      ))}
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
  streakBadge: {
    backgroundColor: 'rgba(255,140,0,0.16)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  streakBadgeText: { fontSize: 12, fontWeight: '800', color: '#FF8C00' },
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
  collectionsHint: { fontSize: 12, fontWeight: '500' },
  collectionsOwnerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  collectionsOwnerName: { fontSize: 13, fontWeight: '800' },
});
