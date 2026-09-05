import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GifPickerModal } from '@/components/GifPickerSheet';
import { GifSuggestionRail } from '@/components/GifSuggestionRail';
import { MessageActionsSheet } from '@/components/MessageActionsSheet';
import { PhotoPickerSheet } from '@/components/PhotoPickerSheet';
import { PhotoViewerSheet } from '@/components/PhotoViewerSheet';
import { VideoViewerSheet } from '@/components/VideoViewerSheet';
import { StreakUnlockModal } from '@/components/StreakUnlockModal';
import { SendToSheet } from '@/components/SendToSheet';
import { VoiceComposer } from '@/components/VoiceComposer';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { Avatar } from '@/components/Avatar';
import { UnderlineTabs } from '@/components/UnderlineTabs';
import { MessageBubble, type MessageAnchor } from '@/components/MessageBubble';
import { RatingBadge } from '@/components/RatingBadge';
import { TypingIndicator } from '@/components/TypingIndicator';
import { Message } from '@/data/messages';
import { PlatoVideo } from '@/data/platos';
import { Order } from '@/data/types';
import { activityLabel } from '@/lib/activity';
import { conversationTitle, dayLabel, sameRun } from '@/lib/conversation';
import { useConversationStreak } from '@/lib/conversationStreak';
import { confirmAction } from '@/lib/dialog';
import { tapLight, warn } from '@/lib/haptics';
import { postMedia } from '@/lib/post';
import { resolveQuote } from '@/lib/quotePreview';
import { useTypingPresence } from '@/lib/typingPresence';
import { useMessagePins } from '@/lib/useMessagePins';
import { useActivity } from '@/store/ActivityContext';
import { SavedItemType, useCollections } from '@/store/CollectionsContext';
import { RestaurantWithRating, useData } from '@/store/DataContext';
import { useMessages } from '@/store/MessagesContext';
import { usePlatos } from '@/store/PlatosContext';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

type Row =
  | { type: 'day'; key: string; label: string }
  | { type: 'unread-divider'; key: string }
  | { type: 'message'; key: string; message: Message; showAuthor: boolean };

/**
 * One conversation.
 *
 * Marked read on arrival and again whenever a new message lands while you're
 * looking at it — a thread that's open in front of you is, by definition, read.
 *
 * A pending request shows the opening message but replaces the composer with
 * Accept / Delete: the whole point of a request is that you haven't agreed to
 * this conversation yet, so the app shouldn't let you drift into having one.
 */
export default function Thread() {
  // `messageId` arrives from the inbox's global search — a message match
  // there jumps straight to that message once you're in the right thread,
  // rather than reopening this thread's own search over again.
  const { id, messageId } = useLocalSearchParams<{ id: string; messageId?: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userFor, currentUser, orders, restaurantFor } = useData();
  const { platos } = usePlatos();
  const { lastActiveFor, refresh: refreshActivity } = useActivity();
  const {
    conversationFor,
    messagesFor,
    loadOlderMessages,
    hasMoreOlderMessages,
    loadingOlderMessages,
    otherIds,
    markRead,
    sendMessage,
    retryMessage,
    acceptRequest,
    leaveConversation,
    myReaction,
    react,
    hideMessage,
    unsendMessage,
    editMessage,
    leaveThread,
    seenBy,
    messageById,
  } = useMessages();

  const [draft, setDraft] = useState('');
  const [attachOpen, setAttachOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  // The message the long-press menu is acting on, and the one being replied to.
  const [actionTarget, setActionTarget] = useState<Message | null>(null);
  const [actionAnchor, setActionAnchor] = useState<MessageAnchor | null>(null);
  // Which album page actionTarget/replyTo was showing when long-pressed —
  // what a Reply from here should point at, not just the message as a whole.
  const [actionPhotoIndex, setActionPhotoIndex] = useState<number | undefined>(undefined);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [replyPhotoIndex, setReplyPhotoIndex] = useState<number | undefined>(undefined);
  // Non-null while the composer is fixing a sent message's text instead of
  // writing a new one — draft is seeded with the current text on entry.
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  // Measured, not assumed — the composer's real on-screen height (it grows
  // with a reply banner, a multiline draft, the safe-area inset baked into
  // its own padding) is what the long-press action sheet needs to actually
  // clear, not just the home-indicator inset alone.
  const [composerHeight, setComposerHeight] = useState(0);
  // Shown once the thread is scrolled far enough from the newest message
  // that it's no longer obvious how to get back — a long thread otherwise
  // has no way back to the bottom except manually dragging all the way down.
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  // The composer's own bottom padding clears the home indicator when the
  // keyboard is hidden — with it up, KeyboardAvoidingView has already
  // shifted everything above the keyboard itself, so that same padding has
  // nothing left to clear and just sits there as a dead gap between the
  // composer and the keyboard's top edge.
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<Message | null>(null);
  const [viewingPhotoIndex, setViewingPhotoIndex] = useState(0);
  const [viewingVideo, setViewingVideo] = useState<Message | null>(null);
  // Briefly flashed on the message a reply-quote tap just scrolled back to —
  // the scroll alone can land you among several visually similar bubbles.
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const listRef = useRef<FlatList<Row>>(null);

  const conversation = conversationFor(id);
  const messages = useMemo(() => (id ? messagesFor(id) : []), [id, messagesFor]);
  const others = useMemo(() => (conversation ? otherIds(conversation) : []), [conversation, otherIds]);
  const { pinnedMessageId, pin, unpin } = useMessagePins(id);
  const pinnedMessage = pinnedMessageId ? messageById(pinnedMessageId) : undefined;
  const pinnedPreview = pinnedMessage
    ? resolveQuote(pinnedMessage, undefined, orders, platos, restaurantFor)
    : undefined;
  const isRequest = conversation?.participants.find((p) => p.userId === currentUser.id)?.state === 'request';
  const title = conversation
    ? conversationTitle(conversation, others, (u) => userFor(u).name)
    : 'Conversation';

  // An `@` still being typed at the very end of the draft — only the
  // trailing position is supported (not one mid-sentence), the same
  // simplification most composers make since that's where you're actually
  // typing.
  const mentionQuery = draft.match(/(?:^|\s)@([a-zA-Z0-9_.]{0,30})$/)?.[1] ?? null;
  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return others.map(userFor).filter((u) => u.handle.toLowerCase().startsWith(q)).slice(0, 5);
  }, [mentionQuery, others, userFor]);
  const insertMention = (handle: string) => {
    tapLight();
    setDraft((d) => d.replace(/(?:^|\s)@([a-zA-Z0-9_.]{0,30})$/, (m) => `${m.startsWith(' ') ? ' ' : ''}@${handle} `));
  };

  // Captured once, at mount, before `markRead` below has a chance to stamp
  // it forward to "now" — this is the cursor the unread divider needs to
  // know where "new" started, and it would evaporate immediately if read
  // fresh on every render instead of snapshotted like a lazy-init ref.
  const [readCursor] = useState(
    () => conversation?.participants.find((p) => p.userId === currentUser.id)?.lastReadAt ?? null,
  );

  const { typingUserIds, notifyTyping, notifyStopped } = useTypingPresence(id, currentUser.id);

  // Read receipt for the very last thing you sent — irrelevant unless it was
  // yours, since nobody needs to be told they've read their own message.
  const lastMessage = messages[messages.length - 1];
  const seenIds =
    lastMessage && lastMessage.senderId === currentUser.id ? seenBy(id, lastMessage.createdAt) : [];
  const seenLabel =
    seenIds.length === 0
      ? undefined
      : conversation?.isGroup
        ? `Seen by ${seenIds.map((uid) => userFor(uid).name.split(' ')[0]).join(', ')}`
        : 'Seen';

  // Read on arrival, and again as messages arrive while the thread is open.
  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (id && conversation && !isRequest) markRead(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, lastId, isRequest]);

  // Leaving the thread re-enables banners for it.
  useEffect(() => () => leaveThread(), [leaveThread]);

  // Only plain text has anything to match against — a shared plate/Plato/
  // photo/voice note's caption is the closest thing it has, and those
  // already surface via their own message.text when present.
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return messages.filter((m) => m.text.toLowerCase().includes(q)).reverse();
  }, [messages, searchQuery]);

  const othersKey = others.join(',');
  useEffect(() => {
    if (others.length > 0) refreshActivity(others);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [othersKey]);

  // Skips a divider on a conversation that's never been opened before
  // (`lastReadAt` still at its DB-default epoch) — pointing out that
  // *everything* is new the very first time you open a thread is noise,
  // not a useful cursor.
  const readCursorMs = readCursor ? +new Date(readCursor) : NaN;
  const showUnreadDivider = Number.isFinite(readCursorMs) && readCursorMs > 0;

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let currentDay = '';
    let dividerPlaced = !showUnreadDivider;
    messages.forEach((m, i) => {
      const label = dayLabel(m.createdAt);
      if (label !== currentDay) {
        currentDay = label;
        out.push({ type: 'day', key: `day-${label}-${m.id}`, label });
      }
      if (!dividerPlaced && m.senderId !== currentUser.id && +new Date(m.createdAt) > readCursorMs) {
        dividerPlaced = true;
        out.push({ type: 'unread-divider', key: `unread-${m.id}` });
      }
      out.push({
        type: 'message',
        key: m.id,
        message: m,
        // The avatar + name lead a run, not every line in it — a day label
        // or the unread divider both break a run the same way a real gap would.
        showAuthor: !sameRun(messages[i - 1], m) || out[out.length - 1]?.type !== 'message',
      });
    });
    return out;
  }, [messages, showUnreadDivider, readCursorMs, currentUser.id]);

  const scrollToEnd = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  // Scrolling up to reveal older messages grows the list's content height
  // exactly like a new message arriving does — the difference is where the
  // growth lands (the top, not the bottom), and a jump-to-bottom on every
  // content-size change would otherwise yank the view back down the instant
  // the older page prepends. These two refs let onContentSizeChange tell the
  // two cases apart: `preservingScroll` marks that the *next* size change is
  // from a prepend, and `anchorOffset`/`prevContentHeight` are what it needs
  // to re-anchor the viewport on the same message instead of scrolling to end.
  const preservingScroll = useRef(false);
  const anchorOffset = useRef(0);
  const prevContentHeight = useRef(0);

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      if (preservingScroll.current) {
        preservingScroll.current = false;
        const delta = height - prevContentHeight.current;
        if (delta > 0) listRef.current?.scrollToOffset({ offset: anchorOffset.current + delta, animated: false });
      } else {
        scrollToEnd();
      }
      prevContentHeight.current = height;
    },
    [scrollToEnd],
  );

  // Cleared on unmount so a delayed flash never fires into a screen that's
  // moved on to a different thread.
  useEffect(() => () => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
  }, []);

  const scrollToMessage = useCallback(
    (messageId: string) => {
      const index = rows.findIndex((r) => r.type === 'message' && r.message.id === messageId);
      if (index === -1) return;
      tapLight();
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.4 });
      setHighlightedId(messageId);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightedId(null), 1200);
    },
    [rows],
  );

  const onJumpToPinned = useCallback(() => {
    if (pinnedMessage) scrollToMessage(pinnedMessage.id);
  }, [pinnedMessage, scrollToMessage]);

  // Jump straight to the message a global inbox search matched on, once —
  // depending only on `messageId` (not `scrollToMessage`, which changes
  // identity with every new `rows`) so this fires on arrival and doesn't
  // re-fire and re-scroll every time a new message comes in afterward.
  useEffect(() => {
    // scrollToMessage's setHighlightedId only runs once messages/rows exist
    // to scroll to — an external-system (FlatList) trigger, not derived
    // render state — the rule just can't see past the function call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (messageId) scrollToMessage(messageId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId]);

  // Rows are variable height (photos, voice bars, day labels), so FlatList
  // can't always resolve a target that's outside what it's measured yet —
  // this is the documented fallback: jump near it by estimate, then retry
  // the precise scroll once that's rendered.
  const onScrollToIndexFailed = useCallback((info: { index: number; averageItemLength: number }) => {
    listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
    setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.4 }), 50);
  }, []);

  // Inverted-free FlatList: content grows downward like any normal list, so
  // "near the bottom" means the remaining scrollable distance below the
  // viewport is small, not that contentOffset itself is near zero. Symmetrically,
  // "near the top" — where scrolling up should fetch older history — really is
  // contentOffset.y itself being small, since the top of the content is index 0.
  const JUMP_THRESHOLD = 400;
  const LOAD_OLDER_THRESHOLD = 300;
  const onListScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
      setShowJumpToLatest(distanceFromBottom > JUMP_THRESHOLD);
      if (id && contentOffset.y < LOAD_OLDER_THRESHOLD && hasMoreOlderMessages(id) && !loadingOlderMessages(id)) {
        anchorOffset.current = contentOffset.y;
        preservingScroll.current = true;
        loadOlderMessages(id);
      }
    },
    [id, hasMoreOlderMessages, loadingOlderMessages, loadOlderMessages],
  );

  const onSend = () => {
    if (!id || !draft.trim()) return;
    tapLight();
    const text = draft;
    if (editingMessage) {
      editMessage(editingMessage.id, text);
      setDraft('');
      setEditingMessage(null);
      return;
    }
    const answering = replyTo?.id;
    const answeringIndex = replyPhotoIndex;
    setDraft('');
    setReplyTo(null);
    setReplyPhotoIndex(undefined);
    notifyStopped();
    sendMessage(id, { text, replyTo: answering, replyToIndex: answeringIndex }).catch(() => {});
  };

  const onVoice = (uri: string, durationMs: number) => {
    if (!id) return;
    const answering = replyTo?.id;
    const answeringIndex = replyPhotoIndex;
    setReplyTo(null);
    setReplyPhotoIndex(undefined);
    // The uploaded URL rides in `attachmentId` — it's the only pointer a voice
    // note needs, and it keeps the schema to one polymorphic column.
    sendMessage(id, { kind: 'voice', attachmentId: uri, durationMs, replyTo: answering, replyToIndex: answeringIndex }).catch(() => {});
  };

  // Captured when the picker opens (mirroring every other composer action
  // here) rather than read fresh inside `onPhotosSelected`, since the reply
  // strip is cleared the moment the sheet opens and would otherwise be gone
  // by the time the user actually picks photos and taps Send.
  const [photoReplyTo, setPhotoReplyTo] = useState<string | undefined>(undefined);
  const [photoReplyToIndex, setPhotoReplyToIndex] = useState<number | undefined>(undefined);

  const onOpenPhotoPicker = () => {
    if (!id) return;
    tapLight();
    setPhotoReplyTo(replyTo?.id);
    setPhotoReplyToIndex(replyPhotoIndex);
    setReplyTo(null);
    setReplyPhotoIndex(undefined);
    setPhotoPickerOpen(true);
  };

  const onPhotosSelected = (urls: string[]) => {
    if (!id) return;
    sendMessage(id, { kind: 'image', attachmentIds: urls, replyTo: photoReplyTo, replyToIndex: photoReplyToIndex }).catch(() => {});
  };

  // A video is its own message the moment it's picked — one clip, no album,
  // same "picking it sends it" pattern as a GIF.
  const onVideoSelected = (url: string) => {
    if (!id) return;
    sendMessage(id, { kind: 'video', attachmentId: url, replyTo: photoReplyTo, replyToIndex: photoReplyToIndex }).catch(() => {});
  };

  // Plates, Platos and restaurants all share this shape once picked — the
  // attach sheet only needs to say which kind and which id.
  const onShareAttachment = (kind: 'plate' | 'plato' | 'restaurant', attachmentId: string) => {
    if (!id) return;
    setAttachOpen(false);
    tapLight();
    sendMessage(id, { kind, attachmentId, text: draft.trim() }).catch(() => {});
    setDraft('');
  };

  // A GIF/sticker sends as an ordinary image message — Giphy already hosts
  // the asset, so unlike a photo picked from the library there's no upload
  // step, just the URL straight through.
  const onPickGif = (url: string) => {
    if (!id) return;
    setGifOpen(false);
    tapLight();
    sendMessage(id, { kind: 'image', attachmentIds: [url] }).catch(() => {});
  };

  const { current: streakCount } = useConversationStreak(conversation ? id : undefined);

  if (!conversation) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ThreadHeader title="Conversation" onBack={() => router.back()} />
        <View style={styles.gone}>
          <Ionicons name="chatbubble-outline" size={34} color={colors.textMuted} />
          <Text style={[styles.goneText, { color: colors.textMuted }]}>
            This conversation is no longer available.
          </Text>
        </View>
      </View>
    );
  }

  const lead = others[0] ? userFor(others[0]) : currentUser;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ThreadHeader
        title={title}
        subtitle={
          conversation.isGroup
            ? `${conversation.participants.length} people`
            : // Presence when we have it, the handle when we don't — the header
              // should always say something about who you're talking to.
              (activityLabel(lastActiveFor(lead.id)) ?? `@${lead.handle}`)
        }
        avatar={conversation.isGroup ? conversation.avatarUrl ?? lead.avatar : lead.avatar}
        verified={!conversation.isGroup && lead.verified}
        streak={streakCount}
        onBack={() => router.back()}
        onTitlePress={() =>
          conversation.isGroup ? router.push(`/messages/group-info/${id}`) : router.push(`/user/${lead.id}`)
        }
        onSearch={() => setSearchOpen(true)}
        onOptions={() =>
          router.push(conversation.isGroup ? `/messages/group-info/${id}` : `/messages/chat-info/${id}`)
        }
      />

      {pinnedMessage && pinnedPreview && (
        <Pressable
          onPress={onJumpToPinned}
          style={[styles.pinBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="pin" size={14} color={colors.accent} />
          <Text style={[styles.pinBannerText, { color: colors.text }]} numberOfLines={1}>
            {pinnedPreview.text}
          </Text>
          <Pressable onPress={unpin} hitSlop={8}>
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </Pressable>
        </Pressable>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={({ item }) =>
            item.type === 'day' ? (
              <Text style={[styles.day, { color: colors.textMuted }]}>{item.label}</Text>
            ) : item.type === 'unread-divider' ? (
              <View style={styles.unreadDivider}>
                <View style={[styles.unreadDividerLine, { backgroundColor: colors.ratingLow }]} />
                <Text style={[styles.unreadDividerText, { color: colors.ratingLow }]}>New messages</Text>
                <View style={[styles.unreadDividerLine, { backgroundColor: colors.ratingLow }]} />
              </View>
            ) : (
              <MessageBubble
                message={item.message}
                mine={item.message.senderId === currentUser.id}
                showAuthor={conversation.isGroup && item.showAuthor}
                showSenderAvatar={item.showAuthor}
                hidden={actionTarget?.id === item.message.id}
                highlighted={highlightedId === item.message.id}
                onRetry={() => retryMessage(item.message)}
                onLongPress={(m, anchor, photoIndex) => {
                  setActionAnchor(anchor);
                  setActionTarget(m);
                  setActionPhotoIndex(photoIndex);
                }}
                onOpenVideo={(m) => setViewingVideo(m)}
                onOpenPhoto={(m, index) => {
                  setViewingPhoto(m);
                  setViewingPhotoIndex(index);
                }}
                onJumpToReply={scrollToMessage}
                onSwipeReply={(m) => {
                  setReplyTo(m);
                  setReplyPhotoIndex(undefined);
                }}
              />
            )
          }
          // Extra at the bottom so a reaction pill on the last message — which
          // hangs below its bubble — isn't clipped by the composer.
          contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: spacing.xl }}
          showsVerticalScrollIndicator={false}
          // Dragging down over the conversation dismisses the keyboard in step
          // with the finger (iOS) — the same "pull the keyboard away to see more
          // of the thread" feel as Messages/Instagram DMs. Android has no
          // interactive-tracking keyboard mode, so it falls back to dismissing
          // as soon as the drag starts.
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          onContentSizeChange={onContentSizeChange}
          onScroll={onListScroll}
          scrollEventThrottle={100}
          onScrollToIndexFailed={onScrollToIndexFailed}
          ListEmptyComponent={
            <Text style={[styles.blank, { color: colors.textMuted }]}>
              Say something — or send them a plate.
            </Text>
          }
          ListFooterComponent={
            typingUserIds.length > 0 ? (
              <TypingIndicator />
            ) : seenLabel ? (
              <Text style={[styles.seenLabel, { color: colors.textMuted }]}>{seenLabel}</Text>
            ) : null
          }
        />

        {id && loadingOlderMessages(id) && (
          // An overlay, not a ListHeaderComponent — a header row would itself
          // change the FlatList's content height the moment it appears, which
          // is exactly the signal onContentSizeChange uses to decide whether
          // to preserve scroll position vs. jump to the end (see
          // preservingScroll above). Layering it on top instead means the
          // spinner's own appearance never touches content size at all.
          <View pointerEvents="none" style={styles.historySpinner}>
            <ActivityIndicator size="small" color={colors.textMuted} />
          </View>
        )}

        {showJumpToLatest && (
          // A full-bleed, untouchable layer that only aligns its one real
          // child to the corner — flexbox placement, not raw absolute
          // right/bottom offsets on the button itself, so there's no
          // dependency on this being the button's own positioned ancestor
          // (KeyboardAvoidingView animates its own layout as the keyboard
          // moves, which is exactly the kind of container that can leave a
          // directly-offset absolute child unconstrained instead).
          <View
            pointerEvents="box-none"
            // This layer spans the whole KeyboardAvoidingView (list +
            // composer together), so `bottom: 0` on it is the composer's
            // own bottom edge, not the gap above it — push up by the
            // composer's real measured height (already tracked for the
            // keyboard-offset fix above) plus a little breathing room.
            style={[styles.jumpToLatestLayer, { paddingBottom: composerHeight + 12 }]}>
            <Pressable
              onPress={() => {
                tapLight();
                scrollToEnd();
              }}
              hitSlop={8}
              style={[
                styles.jumpToLatest,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}>
              <Ionicons name="chevron-down" size={20} color={colors.accent} />
            </Pressable>
          </View>
        )}

        {isRequest ? (
          <View style={[styles.requestBar, { borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
            <Text style={[styles.requestText, { color: colors.textMuted }]}>
              {lead.name} wants to send you a message.
            </Text>
            <View style={styles.requestActions}>
              <AnimatedPressable
                pressScale={0.96}
                onPress={() => {
                  warn();
                  confirmAction({
                    title: 'Delete this request?',
                    message: `You won’t see messages from ${lead.name} in this thread again.`,
                    confirmLabel: 'Delete',
                    destructive: true,
                    onConfirm: () => {
                      leaveConversation(conversation.id);
                      router.back();
                    },
                  });
                }}
                style={[styles.requestBtn, { borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }]}>
                <Text style={[styles.requestBtnText, { color: colors.ratingLow }]}>Delete</Text>
              </AnimatedPressable>
              <AnimatedPressable
                pressScale={0.96}
                onPress={() => {
                  tapLight();
                  acceptRequest(conversation.id);
                }}
                style={[styles.requestBtn, { backgroundColor: colors.accent }]}>
                <Text style={[styles.requestBtnText, { color: colors.accentText }]}>Accept</Text>
              </AnimatedPressable>
            </View>
          </View>
        ) : (
          <View
            onLayout={(e) => setComposerHeight(e.nativeEvent.layout.height)}
            style={[
              styles.composerWrap,
              {
                borderTopColor: colors.border,
                backgroundColor: colors.background,
                paddingBottom: keyboardVisible ? 8 : insets.bottom + 8,
              },
            ]}>
            {replyTo &&
              (() => {
                const preview = resolveQuote(replyTo, replyPhotoIndex, orders, platos, restaurantFor);
                return (
                  <View style={[styles.replyBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={[styles.replyBar, { backgroundColor: colors.accent }]} />
                    {preview.thumbnail ? (
                      <Image source={{ uri: preview.thumbnail }} style={styles.replyThumb} contentFit="cover" />
                    ) : (
                      preview.icon && (
                        <View style={[styles.replyThumb, styles.replyIcon, { backgroundColor: colors.accentSoft }]}>
                          <Ionicons name={preview.icon} size={15} color={colors.accent} />
                        </View>
                      )
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.replyWho, { color: colors.accent }]} numberOfLines={1}>
                        Replying to {replyTo.senderId === currentUser.id ? 'yourself' : userFor(replyTo.senderId).name}
                      </Text>
                      <Text style={[styles.replyText, { color: colors.textMuted }]} numberOfLines={1}>
                        {preview.text}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        setReplyTo(null);
                        setReplyPhotoIndex(undefined);
                      }}
                      hitSlop={8}>
                      <Ionicons name="close" size={18} color={colors.textMuted} />
                    </Pressable>
                  </View>
                );
              })()}

            {editingMessage && (
              <View style={[styles.replyBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.replyBar, { backgroundColor: colors.accent }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.replyWho, { color: colors.accent }]} numberOfLines={1}>
                    Editing message
                  </Text>
                  <Text style={[styles.replyText, { color: colors.textMuted }]} numberOfLines={1}>
                    {editingMessage.text}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setEditingMessage(null);
                    setDraft('');
                  }}
                  hitSlop={8}>
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            )}

            {mentionCandidates.length > 0 ? (
              <View style={[styles.mentionList, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {mentionCandidates.map((u) => (
                  <Pressable key={u.id} onPress={() => insertMention(u.handle)} style={styles.mentionRow}>
                    <Avatar uri={u.avatar} size={26} />
                    <Text style={[styles.mentionName, { color: colors.text }]} numberOfLines={1}>
                      {u.name}
                    </Text>
                    <Text style={[styles.mentionHandle, { color: colors.textMuted }]} numberOfLines={1}>
                      @{u.handle}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              !voiceActive && <GifSuggestionRail query={draft} onPick={onPickGif} />
            )}

            <View style={styles.composer}>
              {/* The one button that keeps its own bubble — sharing a plate/
                  Plato/restaurant is a distinct action from composing a
                  message, the same way Instagram's camera button sits
                  outside its own message pill rather than inside it. */}
              {!voiceActive && (
                <Pressable
                  onPress={() => {
                    tapLight();
                    setAttachOpen(true);
                  }}
                  hitSlop={8}
                  style={[styles.standaloneAttachBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="restaurant-outline" size={19} color={colors.accent} />
                </Pressable>
              )}

              {/* Everything else lives inside one pill — bare icons sitting
                  directly on its background, not each in their own bubble.
                  The text field takes the remaining space; photo/sticker/mic
                  cluster together at the pill's trailing edge, in that order
                  — matching Instagram's own message bar. Photo drops out
                  once there's something typed (it's "attach a photo instead
                  of typing," not a persistent control); the sticker button
                  never does, since reaching for one is just as likely
                  mid-sentence as before typing anything. */}
              <View style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {!voiceActive && (
                  <>
                    <TextInput
                      value={draft}
                      onChangeText={(t) => {
                        setDraft(t);
                        if (t.trim()) notifyTyping();
                        else notifyStopped();
                      }}
                      placeholder="Message"
                      placeholderTextColor={colors.textMuted}
                      multiline
                      style={[styles.pillInput, { color: colors.text }]}
                    />
                    {!draft.trim() && (
                      <Pressable onPress={onOpenPhotoPicker} hitSlop={8} style={styles.pillIconBtn}>
                        <Ionicons name="image-outline" size={19} color={colors.accent} />
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => {
                        tapLight();
                        setGifOpen(true);
                      }}
                      hitSlop={8}
                      style={styles.pillIconBtn}>
                      <Ionicons name="happy-outline" size={19} color={colors.accent} />
                    </Pressable>
                  </>
                )}
                {/* The mic lives here too (bare, idle) — VoiceComposer itself
                    reports back when a hold has turned into an actual
                    recording, at which point its sibling photo/text/sticker
                    above hide and it becomes this pill's only child, free to
                    lay out the trash/waveform/lock controls across the whole
                    width instead of a leftover sliver. Never rendered once
                    there's a draft to send instead — the send button (below,
                    outside the pill) takes over that slot. */}
                {!draft.trim() && <VoiceComposer onRecorded={onVoice} onActiveChange={setVoiceActive} />}
              </View>

              {draft.trim() ? (
                <AnimatedPressable
                  pressScale={0.92}
                  onPress={onSend}
                  style={[styles.sendBtn, { backgroundColor: colors.accent }]}>
                  <Ionicons name={editingMessage ? 'checkmark' : 'arrow-up'} size={19} color={colors.accentText} />
                </AnimatedPressable>
              ) : null}
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Rendered after (not alongside) KeyboardAvoidingView on purpose: RN
          paints later siblings over earlier ones, and this used to sit
          before it — meaning the list/composer/keyboard inside
          KeyboardAvoidingView painted *over* the search overlay instead of
          the other way around, so both ended up visible and interactive at
          once instead of search actually covering the thread. */}
      {searchOpen && (
        <SearchOverlay
          query={searchQuery}
          onQueryChange={setSearchQuery}
          results={searchResults}
          isGroup={conversation.isGroup}
          nameFor={(uid) => userFor(uid).name}
          mineId={currentUser.id}
          onClose={() => {
            setSearchOpen(false);
            setSearchQuery('');
          }}
          onSelect={(messageId) => {
            setSearchOpen(false);
            setSearchQuery('');
            scrollToMessage(messageId);
          }}
        />
      )}

      <AttachSheet visible={attachOpen} onClose={() => setAttachOpen(false)} onPick={onShareAttachment} />

      <GifPickerModal visible={gifOpen} onClose={() => setGifOpen(false)} onPick={onPickGif} />

      <MessageActionsSheet
        visible={!!actionTarget}
        message={actionTarget}
        anchor={actionAnchor}
        mine={actionTarget?.senderId === currentUser.id}
        currentEmoji={actionTarget ? myReaction(actionTarget.id) : undefined}
        bottomReserved={composerHeight}
        onClose={() => {
          setActionTarget(null);
          setActionPhotoIndex(undefined);
        }}
        onReact={(emoji) => {
          const target = actionTarget;
          setActionTarget(null);
          if (target) {
            tapLight();
            react(target.id, emoji);
          }
        }}
        onCopy={() => {
          if (actionTarget) Clipboard.setStringAsync(actionTarget.text);
          tapLight();
          setActionTarget(null);
        }}
        onReply={() => {
          setEditingMessage(null);
          setReplyTo(actionTarget);
          setReplyPhotoIndex(actionPhotoIndex);
          setActionTarget(null);
          setActionPhotoIndex(undefined);
        }}
        onEdit={() => {
          if (actionTarget) {
            setEditingMessage(actionTarget);
            setDraft(actionTarget.text);
            setReplyTo(null);
            setReplyPhotoIndex(undefined);
          }
          setActionTarget(null);
          setActionPhotoIndex(undefined);
        }}
        pinned={!!actionTarget && actionTarget.id === pinnedMessageId}
        onTogglePin={() => {
          if (actionTarget) {
            if (actionTarget.id === pinnedMessageId) unpin();
            else pin(actionTarget.id);
          }
          setActionTarget(null);
        }}
        onForward={() => {
          setForwarding(actionTarget);
          setActionTarget(null);
        }}
        onDeleteForMe={() => {
          const target = actionTarget;
          setActionTarget(null);
          if (target) hideMessage(target.id);
        }}
        onUnsend={() => {
          const target = actionTarget;
          setActionTarget(null);
          if (!target) return;
          warn();
          confirmAction({
            title: 'Unsend this message?',
            message: 'It disappears for everyone in the conversation.',
            confirmLabel: 'Unsend',
            destructive: true,
            onConfirm: () => unsendMessage(target.id),
          });
        }}
        onReport={() => {
          const target = actionTarget;
          setActionTarget(null);
          if (target) router.push(`/report?targetType=user&targetId=${target.senderId}`);
        }}
      />

      {/* Forwarding reuses the share sheet — picking people and sending is
          exactly what it already does. Passed as `forward` rather than a
          payload so it carries whatever the message actually is: text, a voice
          note, or a shared card. */}
      <SendToSheet
        visible={!!forwarding}
        onClose={() => setForwarding(null)}
        payload={null}
        forward={forwarding}
      />

      <PhotoPickerSheet
        visible={photoPickerOpen}
        onClose={() => setPhotoPickerOpen(false)}
        onSend={onPhotosSelected}
        onSendVideo={onVideoSelected}
      />

      <PhotoViewerSheet
        message={viewingPhoto}
        initialIndex={viewingPhotoIndex}
        onClose={() => setViewingPhoto(null)}
        onForward={(m) => {
          setViewingPhoto(null);
          setForwarding(m);
        }}
      />

      <VideoViewerSheet
        message={viewingVideo}
        onClose={() => setViewingVideo(null)}
        onForward={(m) => {
          setViewingVideo(null);
          setForwarding(m);
        }}
      />

      <StreakUnlockModal conversationId={id} streakCount={streakCount} />
    </View>
  );
}

/**
 * The thread's own header — a title with the other person's face and a tap
 * target through to them. ScreenHeader can't carry an avatar + subtitle, and
 * "who am I talking to" is the one thing this screen must never leave ambiguous.
 */
function ThreadHeader({
  title,
  subtitle,
  avatar,
  verified,
  streak,
  onBack,
  onTitlePress,
  onSearch,
  onOptions,
  onLayout,
}: {
  title: string;
  subtitle?: string;
  avatar?: string;
  verified?: boolean;
  /** Chat-streak day count — a flame badge next to the title once it's ≥ 3. */
  streak?: number;
  onBack: () => void;
  onTitlePress?: () => void;
  onSearch?: () => void;
  onOptions?: () => void;
  /** Reports this header's real rendered height, for KeyboardAvoidingView's offset. */
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      onLayout={onLayout}
      style={[
        styles.header,
        { paddingTop: insets.top + 6, borderBottomColor: colors.border, backgroundColor: colors.background },
      ]}>
      <Pressable onPress={onBack} hitSlop={10} style={styles.headerIcon}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      <Pressable style={styles.headerTitle} onPress={onTitlePress} disabled={!onTitlePress}>
        {avatar && <Avatar uri={avatar} size={34} verified={verified} />}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text
              style={[styles.headerName, { color: colors.text, fontFamily: displayFont }]}
              numberOfLines={1}>
              {title}
            </Text>
            {!!streak && streak >= 3 && (
              <View style={styles.streakBadge}>
                <Text style={styles.streakBadgeText}>🔥{streak}</Text>
              </View>
            )}
          </View>
          {subtitle && (
            <Text style={[styles.headerSub, { color: colors.textMuted }]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      </Pressable>
      {onSearch && (
        <Pressable onPress={onSearch} hitSlop={10} style={styles.headerIcon}>
          <Ionicons name="search-outline" size={21} color={colors.text} />
        </Pressable>
      )}
      {onOptions && (
        <Pressable onPress={onOptions} hitSlop={10} style={styles.headerIcon}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
        </Pressable>
      )}
    </View>
  );
}

/**
 * In-thread search — replaces the normal header with a search bar (same
 * spot, same safe-area padding, so nothing jumps) and the message list with
 * matching results. Only plain text is searched: a shared plate/Plato/photo/
 * voice note's own caption is the closest thing it has to body text, and
 * this already matches on that when present via `message.text`.
 */
function SearchOverlay({
  query,
  onQueryChange,
  results,
  isGroup,
  nameFor,
  mineId,
  onClose,
  onSelect,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  results: Message[];
  isGroup: boolean;
  nameFor: (userId: string) => string;
  mineId: string;
  onClose: () => void;
  onSelect: (messageId: string) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, zIndex: 10, elevation: 10 }]}>
      <View
        style={[
          styles.searchBar,
          { paddingTop: insets.top + 6, borderBottomColor: colors.border, backgroundColor: colors.background },
        ]}>
        <View style={[styles.searchInputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={onQueryChange}
            placeholder="Search in this conversation"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            style={[styles.searchInput, { color: colors.text }]}
          />
          {query.length > 0 && (
            <Pressable onPress={() => onQueryChange('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={[styles.searchCancel, { color: colors.accent }]}>Cancel</Text>
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        {query.trim().length === 0 ? (
          <Text style={[styles.searchHint, { color: colors.textMuted }]}>
            Search this conversation’s messages.
          </Text>
        ) : results.length === 0 ? (
          <Text style={[styles.searchHint, { color: colors.textMuted }]}>No matches.</Text>
        ) : (
          results.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => onSelect(m.id)}
              style={({ pressed }) => [
                styles.searchResultRow,
                { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}>
              <View style={{ flex: 1 }}>
                {isGroup && (
                  <Text style={[styles.searchResultWho, { color: colors.accent }]} numberOfLines={1}>
                    {m.senderId === mineId ? 'You' : nameFor(m.senderId)}
                  </Text>
                )}
                <Text style={[styles.searchResultText, { color: colors.text }]} numberOfLines={2}>
                  {m.text}
                </Text>
              </View>
              <Text style={[styles.searchResultTime, { color: colors.textMuted }]}>{dayLabel(m.createdAt)}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

/**
 * Pick one of your own plates to send. Your plates are what "you have to try
 * this" almost always means — anything else is a share from the post itself,
 * which the Send-to sheet already handles.
 */
type AttachTab = 'Plates' | 'Platos' | 'Restaurants';
const ATTACH_TABS: AttachTab[] = ['Plates', 'Platos', 'Restaurants'];
const ALL_COLLECTIONS = 'All';

/**
 * Share sheet: your own plates and Platos, plus whatever's saved to any of
 * your collections — restaurants included, since those have no "yours" of
 * their own to lead with. Saved items already covered by "Yours" (you saved
 * your own post) aren't repeated in "Saved".
 *
 * The Saved section can be filtered down to one collection at a time — once
 * you've got more than a couple of lists, "everything you've ever saved"
 * stops being a useful thing to scroll through.
 */
function AttachSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (kind: 'plate' | 'plato' | 'restaurant', attachmentId: string) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { ordersByUser, orders, currentUser, restaurantWithRating } = useData();
  const { platos } = usePlatos();
  const { collections } = useCollections();
  const [tab, setTab] = useState<AttachTab>('Plates');
  const [collectionFilter, setCollectionFilter] = useState<string>(ALL_COLLECTIONS);

  // Every list by name, not just the ones already holding something of this
  // type — the picker needs to be somewhere you can always find it, not a
  // row that only appears once you happen to have the right kind of item
  // saved somewhere. Picking an empty-for-this-tab list just shows the
  // "nothing here" state below, which is itself useful feedback.
  const collectionNames = [...new Set(collections.map((c) => c.name))];
  const activeCollectionIds =
    collectionFilter === ALL_COLLECTIONS ? null : collections.filter((c) => c.name === collectionFilter).map((c) => c.id);

  const savedIds = (t: SavedItemType) => {
    const ids = new Set<string>();
    collections.forEach((c) => {
      if (activeCollectionIds && !activeCollectionIds.includes(c.id)) return;
      c.items.forEach((i) => i.type === t && ids.add(i.id));
    });
    return ids;
  };

  const myPlates = ordersByUser(currentUser.id);
  const savedPlateIds = savedIds('plate');
  const savedPlates = orders.filter((o) => savedPlateIds.has(o.id) && o.userId !== currentUser.id);

  const myPlatos = platos.filter((p) => p.creatorId === currentUser.id);
  const savedPlatoIds = savedIds('plato');
  const savedPlatos = platos.filter((p) => savedPlatoIds.has(p.id) && p.creatorId !== currentUser.id);

  const savedRestaurants = [...savedIds('restaurant')]
    .map((rid) => restaurantWithRating(rid))
    .filter((r): r is RestaurantWithRating => !!r);

  const empty =
    (tab === 'Plates' && myPlates.length === 0 && savedPlates.length === 0) ||
    (tab === 'Platos' && myPlatos.length === 0 && savedPlatos.length === 0) ||
    (tab === 'Restaurants' && savedRestaurants.length === 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.text, fontFamily: displayFont }]}>Share</Text>

          {/* UnderlineTabs owns its own edge padding (it's meant to sit full-bleed,
              the way it does on Search) — negate the sheet's own inset here so it
              lines up with that padding instead of stacking on top of it. */}
          <View style={styles.attachFilterRow}>
            <UnderlineTabs
              tabs={ATTACH_TABS}
              value={tab}
              onChange={(t) => {
                setTab(t);
                setCollectionFilter(ALL_COLLECTIONS);
              }}
            />
          </View>

          {collectionNames.length > 0 && (
            <View style={styles.attachFilterRow}>
              <UnderlineTabs
                tabs={[ALL_COLLECTIONS, ...collectionNames]}
                value={collectionFilter}
                onChange={setCollectionFilter}
                scrollable
              />
            </View>
          )}

          {empty ? (
            <Text style={[styles.blank, { color: colors.textMuted }]}>
              {tab === 'Plates'
                ? 'You haven’t posted or saved a plate yet.'
                : tab === 'Platos'
                  ? 'You haven’t posted or saved a Plato yet.'
                  : 'You haven’t saved a restaurant yet.'}
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 380, marginTop: 8 }} showsVerticalScrollIndicator={false}>
              {tab === 'Plates' && (
                <>
                  <AttachSection title="Yours" show={myPlates.length > 0}>
                    {myPlates.map((o) => (
                      <PlateRow key={o.id} order={o} onPress={() => onPick('plate', o.id)} />
                    ))}
                  </AttachSection>
                  <AttachSection title="Saved" show={savedPlates.length > 0}>
                    {savedPlates.map((o) => (
                      <PlateRow key={o.id} order={o} onPress={() => onPick('plate', o.id)} />
                    ))}
                  </AttachSection>
                </>
              )}
              {tab === 'Platos' && (
                <>
                  <AttachSection title="Yours" show={myPlatos.length > 0}>
                    {myPlatos.map((p) => (
                      <PlatoRow key={p.id} plato={p} onPress={() => onPick('plato', p.id)} />
                    ))}
                  </AttachSection>
                  <AttachSection title="Saved" show={savedPlatos.length > 0}>
                    {savedPlatos.map((p) => (
                      <PlatoRow key={p.id} plato={p} onPress={() => onPick('plato', p.id)} />
                    ))}
                  </AttachSection>
                </>
              )}
              {tab === 'Restaurants' && (
                <AttachSection title="Saved" show={savedRestaurants.length > 0}>
                  {savedRestaurants.map((r) => (
                    <RestaurantRow key={r.id} restaurant={r} onPress={() => onPick('restaurant', r.id)} />
                  ))}
                </AttachSection>
              )}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function AttachSection({ title, show, children }: { title: string; show: boolean; children: React.ReactNode }) {
  const { colors } = useTheme();
  if (!show) return null;
  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={[styles.attachSectionTitle, { color: colors.textMuted }]}>{title}</Text>
      {children}
    </View>
  );
}

function PlateRow({ order, onPress }: { order: Order; onPress: () => void }) {
  const { colors } = useTheme();
  const { restaurantFor } = useData();
  const media = postMedia(order)[0];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.plateRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
      <Image source={{ uri: media.uri }} style={styles.plateThumb} contentFit="cover" />
      <View style={{ flex: 1 }}>
        <Text style={[styles.plateName, { color: colors.text }]} numberOfLines={1}>
          {order.dishName}
        </Text>
        <Text style={[styles.plateMeta, { color: colors.textMuted }]} numberOfLines={1}>
          {restaurantFor(order.restaurantId)?.name ?? 'a restaurant'}
        </Text>
      </View>
      <RatingBadge score={order.rating} size="sm" />
    </Pressable>
  );
}

function PlatoRow({ plato, onPress }: { plato: PlatoVideo; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.plateRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
      <Image source={{ uri: plato.poster }} style={styles.plateThumb} contentFit="cover" />
      <View style={{ flex: 1 }}>
        <Text style={[styles.plateName, { color: colors.text }]} numberOfLines={1}>
          {plato.dishName}
        </Text>
        <Text style={[styles.plateMeta, { color: colors.textMuted }]} numberOfLines={1}>
          {plato.restaurantName}
        </Text>
      </View>
      <Ionicons name="film-outline" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

function RestaurantRow({ restaurant, onPress }: { restaurant: RestaurantWithRating; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.plateRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
      <Image source={{ uri: restaurant.image }} style={styles.plateThumb} contentFit="cover" />
      <View style={{ flex: 1 }}>
        <Text style={[styles.plateName, { color: colors.text }]} numberOfLines={1}>
          {restaurant.name}
        </Text>
        <Text style={[styles.plateMeta, { color: colors.textMuted }]} numberOfLines={1}>
          {restaurant.cuisine} · {restaurant.location}
        </Text>
      </View>
      <RatingBadge score={restaurant.platedRating} size="sm" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  historySpinner: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  headerName: { fontSize: 16, letterSpacing: -0.3, flexShrink: 1 },
  headerSub: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  streakBadge: {
    backgroundColor: 'rgba(255,140,0,0.16)',
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  streakBadgeText: { fontSize: 11, fontWeight: '800', color: '#FF8C00' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },
  searchCancel: { fontSize: 14, fontWeight: '700' },
  searchHint: { textAlign: 'center', marginTop: 40, fontSize: 14, fontWeight: '500', paddingHorizontal: spacing.xl },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchResultWho: { fontSize: 12, fontWeight: '800', marginBottom: 2 },
  searchResultText: { fontSize: 14, fontWeight: '500', lineHeight: 19 },
  searchResultTime: { fontSize: 11, fontWeight: '600' },
  day: { textAlign: 'center', fontSize: 11, fontWeight: '700', marginVertical: 12 },
  unreadDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 12,
    paddingHorizontal: spacing.lg,
  },
  unreadDividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  unreadDividerText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  pinBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pinBannerText: { flex: 1, fontSize: 13, fontWeight: '600' },
  mentionList: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
    overflow: 'hidden',
  },
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  mentionName: { fontSize: 13, fontWeight: '700' },
  mentionHandle: { fontSize: 12, fontWeight: '500', flexShrink: 1 },
  blank: { textAlign: 'center', marginTop: 40, fontSize: 14, fontWeight: '500' },
  seenLabel: {
    textAlign: 'right',
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: spacing.lg,
    paddingTop: 2,
  },
  gone: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  goneText: { fontSize: 14, fontWeight: '500' },
  composerWrap: { paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  jumpToLatestLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingRight: 16,
  },
  jumpToLatest: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: spacing.md,
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: spacing.md,
    marginBottom: 8,
    paddingRight: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  replyBar: { width: 3, alignSelf: 'stretch', marginRight: -4 },
  replyThumb: { width: 34, height: 34, borderRadius: radius.sm },
  replyIcon: { alignItems: 'center', justifyContent: 'center' },
  replyWho: { fontSize: 11, fontWeight: '800' },
  replyText: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  standaloneAttachBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  // The one wide pill housing photo/text/sticker/mic — bare icons sit
  // directly on it rather than each getting their own bubble.
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 38,
    maxHeight: 120,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 14,
    paddingRight: 6,
    gap: 2,
  },
  pillInput: {
    flex: 1,
    minHeight: 38,
    maxHeight: 120,
    paddingVertical: 9,
    fontSize: 15,
    fontWeight: '500',
  },
  // No background/border — the pill itself already provides both; this is
  // just a big-enough hit target for a bare glyph.
  pillIconBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  sendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  requestBar: { paddingHorizontal: spacing.lg, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, gap: 12 },
  requestText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  requestActions: { flexDirection: 'row', gap: 10 },
  requestBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.pill },
  requestBtnText: { fontSize: 14, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 20, fontWeight: '600', marginBottom: 12 },
  attachSectionTitle: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 6, marginBottom: 2 },
  attachFilterRow: { marginHorizontal: -spacing.lg, marginTop: 4 },
  plateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  plateThumb: { width: 48, height: 48, borderRadius: radius.sm },
  plateName: { fontSize: 15, fontWeight: '700' },
  plateMeta: { fontSize: 13, fontWeight: '500', marginTop: 2 },
});
