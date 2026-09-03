import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { Avatar } from '@/components/Avatar';
import { ChatQuickActions, RowAnchor } from '@/components/ChatQuickActions';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Skeleton } from '@/components/Skeleton';
import { Conversation, Message } from '@/data/messages';
import { User } from '@/data/types';
import { activityLabel, isActiveNow } from '@/lib/activity';
import { conversationTitle, messagePreview, shortTime } from '@/lib/conversation';
import { confirmAction } from '@/lib/dialog';
import { tapLight, tapMedium, tick, warn } from '@/lib/haptics';
import { useActivity } from '@/store/ActivityContext';
import { useData } from '@/store/DataContext';
import { useMessages } from '@/store/MessagesContext';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

type Tab = 'chats' | 'requests';

/**
 * The inbox.
 *
 * Requests live behind their own tab rather than mixed into the list: a thread
 * from someone you don't know is a decision, and letting it sit at the top of
 * your chats is exactly the pressure the friends-only setting exists to remove.
 * The tab only appears when something's waiting.
 */
export function InboxView() {
  const { colors } = useTheme();
  const router = useRouter();
  const { conversations, requests, loading, otherIds, messagesFor } = useMessages();
  const { refresh } = useActivity();
  const { ensureProfiles, userFor, currentUser } = useData();
  const [tab, setTab] = useState<Tab>('chats');
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  const peopleKey = conversations.map((c) => c.id).join(',');
  useEffect(() => {
    const people = conversations.flatMap(otherIds);
    ensureProfiles(people);
    refresh(conversations.filter((c) => !c.isGroup).flatMap(otherIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleKey]);

  const list = tab === 'chats' ? conversations : requests;
  const showTabs = requests.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Pushed from Home now (like Notifications), not a tab root — there's
          somewhere to go back to, so this gets the standard back chevron. */}
      <ScreenHeader
        title="Messages"
        secondaryIcon="search-outline"
        onSecondary={() => {
          tapLight();
          setGlobalSearchOpen(true);
        }}
        rightIcon="create-outline"
        onRight={() => {
          tapLight();
          router.push('/messages/new');
        }}
      />

      {globalSearchOpen && (
        <GlobalSearchOverlay
          conversations={conversations}
          otherIds={otherIds}
          userFor={userFor}
          messagesFor={messagesFor}
          currentUserId={currentUser.id}
          onClose={() => setGlobalSearchOpen(false)}
        />
      )}

      {showTabs && (
        <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
          {(['chats', 'requests'] as Tab[]).map((t) => {
            const on = tab === t;
            const count = t === 'chats' ? conversations.length : requests.length;
            return (
              <Pressable
                key={t}
                onPress={() => {
                  tick();
                  setTab(t);
                }}
                style={[styles.tab, on && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}>
                <Text style={[styles.tabText, { color: on ? colors.text : colors.textMuted }]}>
                  {t === 'chats' ? 'Chats' : 'Requests'}
                  {count > 0 ? ` ${count}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {loading ? (
        <View style={{ padding: spacing.lg, gap: spacing.lg }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Skeleton style={{ width: 52, height: 52, borderRadius: 26 }} />
              <View style={{ gap: 7, flex: 1 }}>
                <Skeleton style={{ width: '45%', height: 12 }} />
                <Skeleton style={{ width: '75%', height: 10 }} />
              </View>
            </View>
          ))}
        </View>
      ) : list.length === 0 ? (
        <Empty tab={tab} onStart={() => router.push('/messages/new')} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingVertical: spacing.sm, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}>
          {tab === 'requests' && (
            <Text style={[styles.requestsNote, { color: colors.textMuted }]}>
              These people aren’t following you back. They can’t tell you’ve seen this until you
              accept.
            </Text>
          )}
          {list.map((c) => (
            <ConversationRow key={c.id} conversation={c} request={tab === 'requests'} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function Empty({ tab, onStart }: { tab: Tab; onStart: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <Ionicons
        name={tab === 'chats' ? 'chatbubbles-outline' : 'mail-open-outline'}
        size={40}
        color={colors.textMuted}
      />
      <Text style={[styles.emptyTitle, { color: colors.text, fontFamily: displayFont }]}>
        {tab === 'chats' ? 'No messages yet' : 'No requests'}
      </Text>
      <Text style={[styles.emptyText, { color: colors.textMuted }]}>
        {tab === 'chats'
          ? 'Send someone a plate they have to try.'
          : 'Threads from people you don’t follow back will land here.'}
      </Text>
      {tab === 'chats' && (
        <AnimatedPressable
          onPress={onStart}
          pressScale={0.96}
          style={[styles.emptyBtn, { backgroundColor: colors.accent }]}>
          <Ionicons name="create-outline" size={16} color={colors.accentText} />
          <Text style={[styles.emptyBtnText, { color: colors.accentText }]}>New message</Text>
        </AnimatedPressable>
      )}
    </View>
  );
}

/**
 * Swiping a row exposes the three things you actually want to do with a thread
 * you're not going to open: silence it, get rid of it, or report it. Keeping
 * them behind a swipe rather than an ellipsis means managing a busy inbox is
 * one gesture per row instead of two taps and a sheet.
 */
function ConversationRow({ conversation, request }: { conversation: Conversation; request?: boolean }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { userFor, currentUser } = useData();
  const {
    otherIds,
    lastMessageFor,
    unreadFor,
    seenBy,
    isMuted,
    toggleMute,
    isPinned,
    togglePin,
    markUnread,
    leaveConversation,
  } = useMessages();
  const { lastActiveFor } = useActivity();
  const swipeRef = useRef<Swipeable>(null);
  const rowRef = useRef<View>(null);
  const [quickActionsAnchor, setQuickActionsAnchor] = useState<RowAnchor | null>(null);

  const muted = isMuted(conversation.id);
  const pinned = isPinned(conversation.id);

  const others = otherIds(conversation);
  const title = conversationTitle(conversation, others, (id) => userFor(id).name);
  const last = lastMessageFor(conversation.id);
  const unread = request ? 0 : unreadFor(conversation.id);
  const mine = last?.senderId === currentUser.id;
  const preview = messagePreview(last, {
    mine,
    senderName: last ? userFor(last.senderId).name : undefined,
    isGroup: conversation.isGroup,
    unreadCount: unread,
    seen: mine && !!last && seenBy(conversation.id, last.createdAt).length > 0,
  });
  const lead = others[0] ? userFor(others[0]) : currentUser;
  // Only for 1:1 threads — "active now" about a group of five means nothing.
  const leadActive = !conversation.isGroup && others[0] ? lastActiveFor(others[0]) : undefined;
  const online = isActiveNow(leadActive);

  const actions = () => (
    <View style={styles.actions}>
      <SwipeAction
        label={muted ? 'Unmute' : 'Mute'}
        icon={muted ? 'notifications' : 'notifications-off'}
        background={colors.textMuted}
        onPress={() => {
          swipeRef.current?.close();
          tapLight();
          toggleMute(conversation.id);
        }}
      />
      <SwipeAction
        label="Report"
        icon="flag"
        background={colors.ratingMid}
        onPress={() => {
          swipeRef.current?.close();
          router.push(`/report?targetType=user&targetId=${others[0] ?? conversation.id}`);
        }}
      />
      <SwipeAction
        label="Delete"
        icon="trash"
        background={colors.ratingLow}
        onPress={() => {
          warn();
          confirmAction({
            title: conversation.isGroup ? 'Leave this group?' : 'Delete this conversation?',
            message: conversation.isGroup
              ? 'You’ll stop receiving messages from it.'
              : 'It’s removed from your inbox. The other person keeps their copy.',
            confirmLabel: conversation.isGroup ? 'Leave' : 'Delete',
            destructive: true,
            onConfirm: () => leaveConversation(conversation.id),
          });
          swipeRef.current?.close();
        }}
      />
    </View>
  );

  const openQuickActions = () => {
    tapMedium();
    // Measured at press time, not on layout — the list scrolls, so a frame
    // captured earlier would place the menu against where the row used to be.
    rowRef.current?.measureInWindow((x, y, width, height) => {
      setQuickActionsAnchor({ x, y, width, height });
    });
  };

  return (
    <>
    <Swipeable ref={swipeRef} renderRightActions={actions} overshootRight={false} friction={1.6}>
    <View ref={rowRef}>
    <AnimatedPressable
      pressScale={0.985}
      onPress={() => router.push(`/messages/${conversation.id}`)}
      onLongPress={request ? undefined : openQuickActions}
      style={[styles.row, { backgroundColor: colors.background }]}>
      {/* Groups stack two avatars so the row reads as "several people" before
          you've read a word of it. */}
      {conversation.isGroup && others.length > 1 ? (
        <View style={styles.stack}>
          <Avatar uri={userFor(others[1]).avatar} size={36} />
          <View style={[styles.stackFront, { borderColor: colors.background }]}>
            <Avatar uri={lead.avatar} size={36} />
          </View>
        </View>
      ) : (
        <View>
          <Avatar uri={lead.avatar} size={52} verified={lead.verified} />
          {online && (
            <View style={[styles.onlineDot, { backgroundColor: colors.success, borderColor: colors.background }]} />
          )}
        </View>
      )}

      <View style={{ flex: 1 }}>
        <View style={styles.titleRow}>
          <Text
            style={[styles.title, { color: colors.text, fontWeight: unread > 0 ? '800' : '700' }]}
            numberOfLines={1}>
            {title}
          </Text>
          {last && (
            <Text style={[styles.time, { color: colors.textMuted }]}>{shortTime(last.createdAt)}</Text>
          )}
        </View>
        <Text
          style={[styles.preview, { color: unread > 0 ? colors.text : colors.textMuted }]}
          numberOfLines={1}>
          {preview}
          {activityLabel(leadActive) ? ` · ${activityLabel(leadActive)}` : ''}
        </Text>
      </View>

      {pinned && <Ionicons name="pin" size={14} color={colors.textMuted} />}
      {muted && <Ionicons name="notifications-off" size={15} color={colors.textMuted} />}
      {unread > 0 && (
        <View
          style={[
            styles.badge,
            // A muted thread still counts, quietly — the number is there if you
            // look, but it doesn't wear the accent demanding attention.
            { backgroundColor: muted ? colors.border : colors.accent },
          ]}>
          <Text style={[styles.badgeText, { color: muted ? colors.textMuted : colors.accentText }]}>
            {unread > 9 ? '9+' : unread}
          </Text>
        </View>
      )}
    </AnimatedPressable>
    </View>
    </Swipeable>

    {!request && (
      <ChatQuickActions
        visible={!!quickActionsAnchor}
        anchor={quickActionsAnchor}
        unread={unread > 0}
        pinned={pinned}
        muted={muted}
        onClose={() => setQuickActionsAnchor(null)}
        onMarkUnread={() => {
          setQuickActionsAnchor(null);
          markUnread(conversation.id);
        }}
        onTogglePin={() => {
          setQuickActionsAnchor(null);
          togglePin(conversation.id);
        }}
        onToggleMute={() => {
          setQuickActionsAnchor(null);
          toggleMute(conversation.id);
        }}
        onDelete={() => {
          setQuickActionsAnchor(null);
          warn();
          confirmAction({
            title: conversation.isGroup ? 'Leave this group?' : 'Delete this conversation?',
            message: conversation.isGroup
              ? 'You’ll stop receiving messages from it.'
              : 'It’s removed from your inbox. The other person keeps their copy.',
            confirmLabel: conversation.isGroup ? 'Leave' : 'Delete',
            destructive: true,
            onConfirm: () => leaveConversation(conversation.id),
          });
        }}
      />
    )}
    </>
  );
}

function SwipeAction({
  label,
  icon,
  background,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  background: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.action, { backgroundColor: background }]}>
      <Ionicons name={icon} size={19} color="#fff" />
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

interface GlobalMatch {
  conversationId: string;
  title: string;
  avatarUri: string;
  isGroup: boolean;
  kind: 'conversation' | 'message';
  snippet?: string;
  /** Set when kind is 'message' — which one, so tapping it jumps straight there. */
  messageId?: string;
}

/**
 * Global inbox search — conversations/groups by name, and every accepted
 * thread's own messages by content, in one query. A message match jumps
 * straight to that message (`messages/[id].tsx` scrolls + highlights it via
 * `?messageId=...`) rather than landing you back in a search box — you
 * already searched once to get here, re-showing the same query as a
 * tappable result would just read as the app not having found anything yet.
 */
function GlobalSearchOverlay({
  conversations,
  otherIds,
  userFor,
  messagesFor,
  currentUserId,
  onClose,
}: {
  conversations: Conversation[];
  otherIds: (c: Conversation) => string[];
  userFor: (userId: string) => User;
  messagesFor: (conversationId: string) => Message[];
  currentUserId: string;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: GlobalMatch[] = [];

    for (const c of conversations) {
      const others = otherIds(c);
      const title = conversationTitle(c, others, (uid) => userFor(uid).name);
      const lead = others[0] ? userFor(others[0]) : userFor(currentUserId);
      const avatarUri = c.isGroup ? (c.avatarUrl ?? lead.avatar) : lead.avatar;

      const nameMatch =
        title.toLowerCase().includes(q) ||
        others.some((uid) => {
          const u = userFor(uid);
          return u.name.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q);
        });
      if (nameMatch) {
        out.push({ conversationId: c.id, title, avatarUri, isGroup: c.isGroup, kind: 'conversation' });
      }

      // One message hit per conversation is enough to say "search inside
      // this thread" — the thread's own search shows every match once
      // you're there.
      const messages = messagesFor(c.id);
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.text.toLowerCase().includes(q)) {
          const who = m.senderId === currentUserId ? 'You' : userFor(m.senderId).name.split(' ')[0];
          out.push({
            conversationId: c.id,
            title,
            avatarUri,
            isGroup: c.isGroup,
            kind: 'message',
            snippet: `${who}: ${m.text}`,
            messageId: m.id,
          });
          break;
        }
      }
    }
    return out;
  }, [query, conversations, otherIds, userFor, messagesFor, currentUserId]);

  const onSelect = (match: GlobalMatch) => {
    tapLight();
    onClose();
    router.push(
      match.messageId
        ? `/messages/${match.conversationId}?messageId=${encodeURIComponent(match.messageId)}`
        : `/messages/${match.conversationId}`,
    );
  };

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, zIndex: 10, elevation: 10 }]}>
      <View style={[searchStyles.bar, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <View style={[searchStyles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search conversations and messages"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            style={[searchStyles.input, { color: colors.text }]}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={[searchStyles.cancel, { color: colors.accent }]}>Cancel</Text>
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        {query.trim().length === 0 ? (
          <Text style={[searchStyles.hint, { color: colors.textMuted }]}>
            Search conversations, groups, and messages.
          </Text>
        ) : results.length === 0 ? (
          <Text style={[searchStyles.hint, { color: colors.textMuted }]}>No matches.</Text>
        ) : (
          results.map((r, i) => (
            <Pressable
              key={`${r.conversationId}-${r.kind}-${i}`}
              onPress={() => onSelect(r)}
              style={({ pressed }) => [
                searchStyles.row,
                { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}>
              <Avatar uri={r.avatarUri} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={[searchStyles.title, { color: colors.text }]} numberOfLines={1}>
                  {r.title}
                </Text>
                <Text style={[searchStyles.snippet, { color: colors.textMuted }]} numberOfLines={1}>
                  {r.kind === 'message' ? r.snippet : r.isGroup ? 'Group' : 'Conversation'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const searchStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontSize: 14, fontWeight: '500' },
  cancel: { fontSize: 14, fontWeight: '700' },
  hint: { textAlign: 'center', marginTop: 40, fontSize: 14, fontWeight: '500', paddingHorizontal: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 15, fontWeight: '700' },
  snippet: { fontSize: 13, fontWeight: '500', marginTop: 2 },
});

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', paddingHorizontal: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { paddingVertical: 11, marginRight: spacing.xl, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  tabText: { fontSize: 14, fontWeight: '800' },
  requestsNote: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
    paddingHorizontal: spacing.lg,
    paddingTop: 8,
    paddingBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
  },
  stack: { width: 52, height: 52, justifyContent: 'center' },
  stackFront: { position: 'absolute', left: 14, top: 14, borderRadius: 20, borderWidth: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title: { flex: 1, fontSize: 15, letterSpacing: -0.2 },
  time: { fontSize: 12, fontWeight: '600' },
  preview: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { fontSize: 11, fontWeight: '800' },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  actions: { flexDirection: 'row' },
  // Narrow enough that the row's avatar and name stay visible behind the
  // panel — you should never act on a thread you can no longer identify.
  action: { width: 66, alignItems: 'center', justifyContent: 'center', gap: 5 },
  actionLabel: { color: '#fff', fontSize: 11, fontWeight: '800' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: spacing.xl },
  emptyTitle: { fontSize: 19, marginTop: 4 },
  emptyText: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: radius.pill,
  },
  emptyBtnText: { fontSize: 14, fontWeight: '800' },
});
