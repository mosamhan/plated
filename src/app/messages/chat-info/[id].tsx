import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ChatBubbleColorSheet } from '@/components/ChatBubbleColorSheet';
import { IconAction, IconActionRow } from '@/components/IconAction';
import { IconTabs } from '@/components/IconTabs';
import { PlateTile } from '@/components/PlateTile';
import { PlatoTile } from '@/components/PlatoTile';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SegmentedPill } from '@/components/discover/SegmentedPill';
import { SettingsRow, SettingsSection } from '@/components/SettingsKit';
import { SharedCollectionSection } from '@/components/SharedCollectionSection';
import { StreakUnlockModal } from '@/components/StreakUnlockModal';
import { confirmAction } from '@/lib/dialog';
import { useConversationStreak } from '@/lib/conversationStreak';
import { warn } from '@/lib/haptics';
import { useData } from '@/store/DataContext';
import { useMessages } from '@/store/MessagesContext';
import { usePlatos } from '@/store/PlatosContext';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

type Tab = 'Plates & Platos' | 'Collections' | 'Photos';

// Icon-only, matching group-info's own tab row and the profile's grid glyph.
// "Collections" here is purely the shared-collection between these two
// people (SharedCollectionSection) — a 1:1 has no "members' public
// collections" concept to also list, unlike group-info's own tab.
const ICON_TABS: { key: Tab; icon: keyof typeof Ionicons.glyphMap; activeIcon?: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'Plates & Platos', icon: 'grid-outline', activeIcon: 'grid' },
  { key: 'Collections', icon: 'bookmark-outline', activeIcon: 'bookmark' },
  { key: 'Photos', icon: 'images-outline', activeIcon: 'images' },
];

// No "All" — a plate tile (square, rating badge) and a Plato tile (3:4, play
// glyph, view count) look different enough side by side that mixing them in
// one grid reads as a mistake rather than a combined view. Matches
// group-info/[id].tsx's own Plates & Platos filter.
const CONTENT_FILTERS = ['Plates', 'Platos'] as const;
type ContentFilter = (typeof CONTENT_FILTERS)[number];

const PADDING = spacing.lg;
const GRID_GAP = spacing.md;

/**
 * 1:1 chat settings — the "..." menu's full destination, matching what
 * groups already get in `group-info/[id].tsx`. Members/add-people don't
 * apply to a 1:1, so the icon row leads with View profile/Create group
 * instead, and "Chat bubble" fills the row alert tones would otherwise sit
 * next to — alert tones itself stays deferred (no bundled audio to choose
 * from yet). A "Search" entry used to live in the icon row too, replacing
 * this screen with the thread carrying `?search=1` — removed once the
 * thread's own header grew a search icon (`SearchOverlay` in
 * `messages/[id].tsx`), the same destination this button was jumping
 * through screens to reach.
 */
export default function ChatInfo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const { userFor, orders } = useData();
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
  } = useMessages();

  const [tab, setTab] = useState<Tab>('Plates & Platos');
  const [contentFilter, setContentFilter] = useState<ContentFilter>('Plates');
  const [bubbleSheetOpen, setBubbleSheetOpen] = useState(false);

  const conversation = id ? conversationFor(id) : undefined;
  const other = conversation ? otherIds(conversation)[0] : undefined;
  const messages = id ? messagesFor(id) : [];
  const { current: streakCount } = useConversationStreak(conversation ? id : undefined);

  if (!conversation || !id || !other) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Chat info" />
      </View>
    );
  }

  const user = userFor(other);
  const pinned = isPinned(id);
  const muted = isMuted(id);
  const bubbleColor = bubbleColorFor(id);

  const plateMessages = messages.filter((m) => m.kind === 'plate' && m.attachmentId);
  const platoMessages = messages.filter((m) => m.kind === 'plato' && m.attachmentId);
  const visiblePlates = contentFilter === 'Platos' ? [] : plateMessages;
  const visiblePlatos = contentFilter === 'Plates' ? [] : platoMessages;
  const photoUris = messages
    .filter((m) => m.kind === 'image')
    .flatMap((m) => (m.attachmentIds?.length ? m.attachmentIds : m.attachmentId ? [m.attachmentId] : []));
  const tileWidth = (windowWidth - PADDING * 2 - GRID_GAP) / 2;
  const photoWidth = (windowWidth - PADDING * 2 - GRID_GAP * 2) / 3;

  const onReport = () => {
    router.push(`/report?targetType=user&targetId=${other}`);
  };

  const onDelete = () => {
    warn();
    confirmAction({
      title: 'Delete this conversation?',
      message: 'You’ll stop receiving messages from it.',
      confirmLabel: 'Delete',
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
      <ScreenHeader title="Chat info" />

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.header}>
          <Avatar uri={user.avatar} size={84} verified={user.verified} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '90%' }}>
            <Text style={[styles.title, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>
              {user.name}
            </Text>
            {streakCount >= 3 && (
              <View style={styles.streakBadge}>
                <Text style={styles.streakBadgeText}>🔥{streakCount}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.handle, { color: colors.textMuted }]}>@{user.handle}</Text>

          <IconActionRow>
            <IconAction
              icon="person-outline"
              label="View profile"
              onPress={() => router.push(`/user/${other}`)}
            />
            <IconAction
              icon="people-outline"
              label="Create group"
              onPress={() => router.push('/messages/new')}
            />
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
            <SettingsRow
              icon="trash-outline"
              label="Delete conversation"
              destructive
              onPress={onDelete}
              last
            />
          </SettingsSection>
        </View>

        <IconTabs tabs={ICON_TABS} value={tab} onChange={setTab} />

        {/* A filter narrowing the grid already on screen, not a second level
            of navigation — stays a compact centered pill rather than the
            full-bleed rail above it. */}
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

          {tab === 'Collections' && <SharedCollectionSection conversationId={id} isGroup={false} />}

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

      <ChatBubbleColorSheet
        visible={bubbleSheetOpen}
        current={bubbleColor}
        onClose={() => setBubbleSheetOpen(false)}
        onSelect={(color) => {
          setBubbleColor(id, color);
          setBubbleSheetOpen(false);
        }}
      />

      <StreakUnlockModal conversationId={id} streakCount={streakCount} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', paddingVertical: spacing.lg, gap: 6 },
  title: { fontSize: 18, fontWeight: '800' },
  handle: { fontSize: 13, fontWeight: '600' },
  streakBadge: {
    backgroundColor: 'rgba(255,140,0,0.16)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  streakBadgeText: { fontSize: 12, fontWeight: '800', color: '#FF8C00' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  blank: { fontSize: 14, fontWeight: '500', textAlign: 'center', marginTop: 40, width: '100%' },
});
