import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  Conversation,
  ConversationParticipant,
  DEMO_CONVERSATIONS,
  DEMO_MESSAGES,
  HEART_EMOJI,
  Message,
  MessageKind,
  MessagePrivacy,
  MessageReaction,
} from '@/data/messages';
import { CURRENT_USER_ID } from '@/data/users';
import { showAlert } from '@/lib/dialog';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/store/AuthContext';
import { mapConversation, mapMessage, mapParticipant, mapReaction } from '@/store/mappers';

/**
 * Direct messages.
 *
 * Reads every thread the signed-in user belongs to up front (the inbox needs a
 * preview line per thread anyway, so a lazy per-thread fetch would only move
 * the same work behind a spinner), then keeps them live over Supabase Realtime.
 *
 * Sends are optimistic: the bubble appears immediately marked `pending`, and
 * either settles into the real row or flips to `failed` with a retry. A message
 * that silently vanishes is worse than one that says it didn't go.
 *
 * Requests: a thread started by someone who isn't a mutual follow, when the
 * recipient is set to friends-only, arrives with the recipient's participant
 * row in 'request'. That's decided by the database (0019), not here — this
 * context only reads the state and splits the inbox on it.
 */

/** What a send carries beyond its text — a shared plate, Plato, or story reply. */
export interface MessageDraft {
  text?: string;
  kind?: MessageKind;
  attachmentId?: string;
  /** Multi-photo `image` sends — a whole picker selection as one album. */
  attachmentIds?: string[];
  /** Which plate of a multi-plate post is being shared. */
  attachmentIndex?: number;
  /** Length of a voice note, ms. */
  durationMs?: number;
  /** The message this one answers. */
  replyTo?: string;
  /** Which photo of `replyTo`'s album this points at — see Message.replyToIndex. */
  replyToIndex?: number;
  /** For `plate_comment`/`plato_comment` — see Message's fields of the same name. */
  commentPostId?: string;
  commentAuthorId?: string;
  commentText?: string;
}

interface MessagesContextValue {
  /** Threads you've accepted, newest activity first. */
  conversations: Conversation[];
  /** Threads waiting on you to accept or decline. */
  requests: Conversation[];
  loading: boolean;
  /** Unread messages across accepted threads — the inbox badge. */
  unreadCount: number;

  conversationFor: (conversationId: string) => Conversation | undefined;
  messagesFor: (conversationId: string) => Message[];
  lastMessageFor: (conversationId: string) => Message | undefined;
  unreadFor: (conversationId: string) => number;
  /** Fetch the next page of history further back than what's currently loaded. */
  loadOlderMessages: (conversationId: string) => Promise<void>;
  /** False once a fetch for this thread came back short of a full page. */
  hasMoreOlderMessages: (conversationId: string) => boolean;
  loadingOlderMessages: (conversationId: string) => boolean;
  /** Everyone in the thread but you. */
  otherIds: (conversation: Conversation) => string[];

  /** Everyone's reaction to one message. */
  /** Everyone but you who's read up through a message sent at this time, in this thread. */
  seenBy: (conversationId: string, messageCreatedAt: string) => string[];

  reactionsFor: (messageId: string) => MessageReaction[];
  /** Your own reaction to a message, if any. */
  myReaction: (messageId: string) => string | undefined;
  /**
   * Set or clear your reaction. Passing the emoji you already have clears it,
   * so a double-tap on a hearted message un-hearts it.
   */
  react: (messageId: string, emoji?: string) => void;

  /** Silence a thread — it stops counting toward the inbox badge. */
  isMuted: (conversationId: string) => boolean;
  toggleMute: (conversationId: string) => void;
  /** Pinned threads sort first in the inbox. */
  isPinned: (conversationId: string) => boolean;
  togglePin: (conversationId: string) => void;
  /** Your own outgoing-bubble color override for this conversation, if set. */
  bubbleColorFor: (conversationId: string) => string | undefined;
  setBubbleColor: (conversationId: string, color: string | undefined) => void;
  /** Force a thread to show unread until it's actually opened again. */
  markUnread: (conversationId: string) => void;

  /** Hide a message from your own copy of the thread. Always allowed. */
  hideMessage: (messageId: string) => void;
  /**
   * Take a message back for everyone. Sender only, and only inside
   * UNSEND_WINDOW_MS — the database refuses it after that (0022).
   */
  unsendMessage: (messageId: string) => void;
  /**
   * Fix a sent message's text. Sender only, and only inside EDIT_WINDOW_MS —
   * the database refuses it after that (0059).
   */
  editMessage: (messageId: string, text: string) => void;
  /** Look up a quoted message for the reply strip. */
  messageById: (messageId: string) => Message | undefined;

  markRead: (conversationId: string) => void;
  sendMessage: (conversationId: string, draft: MessageDraft) => Promise<void>;
  retryMessage: (message: Message) => void;
  /** Find-or-create the 1:1 thread with someone. Returns its id. */
  startDirect: (userId: string) => Promise<string | null>;
  createGroup: (userIds: string[], title?: string) => Promise<string | null>;
  /** Share one thing to several people at once. Returns how many landed. */
  sendTo: (userIds: string[], draft: MessageDraft) => Promise<number>;
  acceptRequest: (conversationId: string) => void;
  /** Decline a request / leave a group — both are "remove my membership". */
  leaveConversation: (conversationId: string) => void;
  renameGroup: (conversationId: string, title: string) => void;
  setGroupPhoto: (conversationId: string, url: string) => void;
  /** Owner-only in practice — RLS permits it because the caller created the group. */
  addParticipants: (conversationId: string, userIds: string[]) => Promise<boolean>;
  removeParticipant: (conversationId: string, targetUserId: string) => void;

  /** Owner-only. Returns the group's existing code, or mints one if it has none yet. */
  getInviteCode: (conversationId: string, regenerate?: boolean) => Promise<string | null>;
  /** What a code resolves to, before committing to joining. */
  getInvitePreview: (code: string) => Promise<InvitePreview | null>;
  /** Joins the group a code points at. Returns its conversation id. */
  joinViaInvite: (code: string) => Promise<string | null>;

  /**
   * The most recent message or reaction that arrived from someone else while
   * the app was open — what the in-app banner renders. Cleared once shown.
   */
  incoming: IncomingNotice | null;
  clearIncoming: () => void;
  /** The thread screen calls this on unmount so banners resume elsewhere. */
  leaveThread: () => void;

  /** Who can start a thread with you. */
  privacy: MessagePrivacy;
  setPrivacy: (privacy: MessagePrivacy) => void;
}

/** A live arrival, reduced to what a banner needs. */
export interface IncomingNotice {
  conversationId: string;
  senderId: string;
  preview: string;
}

/** What an invite code resolves to — enough to show before committing to joining. */
export interface InvitePreview {
  conversationId: string;
  title: string | null;
  avatarUrl: string | null;
  memberCount: number;
}

const MessagesContext = createContext<MessagesContextValue | undefined>(undefined);

const EPOCH = '1970-01-01T00:00:00.000Z';
// Enough history for the threads a real account holds without paginating every
// screen. Older messages are still in the table; a thread that outgrows this
// wants proper windowed loading, which nothing in the UI needs yet.
const MESSAGE_LIMIT = 600;
// How many older messages a single "scroll up" fetches for one thread.
const MESSAGE_PAGE_SIZE = 40;

const byOldestFirst = (a: Message, b: Message) => +new Date(a.createdAt) - +new Date(b.createdAt);

export function MessagesProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const live = isSupabaseConfigured;
  const me = live ? userId : CURRENT_USER_ID;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  // Messages this user has hidden from their own copy of a thread.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [incoming, setIncoming] = useState<IncomingNotice | null>(null);
  // The thread currently on screen. A banner about the conversation you're
  // already reading is noise, so the thread registers itself here.
  const openThread = useRef<string | null>(null);
  const [privacy, setPrivacyState] = useState<MessagePrivacy>('everyone');
  const [loading, setLoading] = useState<boolean>(live);

  // Realtime hands us inserts for threads we may not have loaded yet (someone
  // just started one). This lets the handler ask "is this mine?" without
  // re-subscribing every time the conversation list changes.
  const knownConversations = useRef<Set<string>>(new Set());
  useEffect(() => {
    knownConversations.current = new Set(conversations.map((c) => c.id));
  }, [conversations]);

  // Per-thread "scroll up for more" cursor. A ref, not state: it's read and
  // written synchronously inside loadOlderMessages (both to decide whether to
  // fetch at all and to guard against firing twice for the same thread while
  // the first request is still in flight) and refs are the only thing that's
  // never stale across the rapid-fire scroll events that trigger it.
  const oldestByConversation = useRef<Record<string, string>>({});
  const loadingOlderRef = useRef<Record<string, boolean>>({});
  const [olderLoading, setOlderLoading] = useState<Record<string, boolean>>({});
  // Absent (undefined) reads as "maybe more" — only an explicit `false`, set
  // once a fetch comes back shorter than a full page, means a thread is
  // exhausted. That way a thread nobody has paginated yet doesn't need its
  // own bookkeeping before the first scroll-up.
  const [olderExhausted, setOlderExhausted] = useState<Record<string, boolean>>({});

  // ── Load ────────────────────────────────────────────────────────────────────
  const loadFromSupabase = useCallback(async (uid: string) => {
    setLoading(true);

    // Two reads rather than one embedded select: the participant rows have to
    // come back for *every* member of each thread, and filtering the embed to
    // `uid` (which an inner join would do) would lose the rest of the group.
    const mine = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', uid);
    const ids = (mine.data ?? []).map((r: any) => r.conversation_id);

    if (mine.error) {
      if (__DEV__) console.warn('[Plated] conversations load failed', mine.error);
      setLoading(false);
      return;
    }
    if (ids.length === 0) {
      setConversations([]);
      setMessages([]);
      setLoading(false);
      return;
    }

    const [convsRes, msgsRes] = await Promise.all([
      supabase
        .from('conversations')
        .select('*, participants:conversation_participants(user_id, state, last_read_at, muted, pinned, forced_unread, bubble_color)')
        .in('id', ids)
        .order('last_message_at', { ascending: false }),
      supabase
        .from('messages')
        .select('*')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_LIMIT),
    ]);

    const loaded = (msgsRes.data ?? []).map(mapMessage).sort(byOldestFirst);
    setConversations((convsRes.data ?? []).map(mapConversation));
    setMessages(loaded);

    // The oldest message loaded so far per thread — where loadOlderMessages
    // resumes from. A thread that got none of this bootstrap's budget (an
    // inactive one, crowded out by busier threads sharing MESSAGE_LIMIT) has
    // no cursor yet; its first "scroll up" simply has nothing to page from
    // until it's opened, which re-runs this same bootstrap read.
    const oldestMap: Record<string, string> = {};
    for (const m of loaded) {
      if (!oldestMap[m.conversationId] || m.createdAt < oldestMap[m.conversationId]) {
        oldestMap[m.conversationId] = m.createdAt;
      }
    }
    oldestByConversation.current = oldestMap;

    // Reactions are keyed to messages, so they can only be fetched once we know
    // which messages came back.
    if (loaded.length > 0) {
      const { data } = await supabase
        .from('message_reactions')
        .select('message_id, user_id, emoji')
        .in('message_id', loaded.map((m) => m.id));
      setReactions((data ?? []).map(mapReaction));

      const hides = await supabase.from('message_hides').select('message_id').eq('user_id', uid);
      setHidden(new Set((hides.data ?? []).map((r: any) => r.message_id)));
    } else {
      setReactions([]);
      setHidden(new Set());
    }
    setLoading(false);
  }, []);

  // Scroll-up pagination for one open thread. The bootstrap load above already
  // pulled each thread's most recent slice; this resumes further back from
  // whatever's oldest so far, prepending rather than replacing.
  const loadOlderMessages = useCallback(
    async (conversationId: string) => {
      if (!live || !userId) return;
      if (loadingOlderRef.current[conversationId] || olderExhausted[conversationId]) return;
      const cursor = oldestByConversation.current[conversationId];
      if (!cursor) return;
      loadingOlderRef.current[conversationId] = true;
      setOlderLoading((p) => ({ ...p, [conversationId]: true }));

      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .lt('created_at', cursor)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);
      const older = (data ?? []).map(mapMessage);

      if (older.length > 0) {
        oldestByConversation.current[conversationId] = older[older.length - 1].createdAt;
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          const fresh = older.filter((m) => !ids.has(m.id));
          return fresh.length ? [...fresh, ...prev].sort(byOldestFirst) : prev;
        });
        const { data: reactionsData } = await supabase
          .from('message_reactions')
          .select('message_id, user_id, emoji')
          .in('message_id', older.map((m) => m.id));
        if (reactionsData?.length) {
          setReactions((prev) => [...prev, ...reactionsData.map(mapReaction)]);
        }
      }

      if (older.length < MESSAGE_PAGE_SIZE) setOlderExhausted((p) => ({ ...p, [conversationId]: true }));
      loadingOlderRef.current[conversationId] = false;
      setOlderLoading((p) => ({ ...p, [conversationId]: false }));
    },
    [live, userId, olderExhausted],
  );

  const hasMoreOlderMessages = useCallback(
    (conversationId: string) => live && !olderExhausted[conversationId],
    [live, olderExhausted],
  );
  const loadingOlderMessages = useCallback(
    (conversationId: string) => !!olderLoading[conversationId],
    [olderLoading],
  );

  useEffect(() => {
    if (!live) {
      setConversations(DEMO_CONVERSATIONS);
      setMessages([...DEMO_MESSAGES].sort(byOldestFirst));
      setLoading(false);
      return;
    }
    if (!userId) {
      setConversations([]);
      setMessages([]);
      setLoading(false);
      return;
    }
    loadFromSupabase(userId).catch(() => setLoading(false));
    supabase
      .from('profiles')
      .select('message_privacy')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.message_privacy === 'friends') setPrivacyState('friends');
      });
  }, [live, userId, loadFromSupabase]);

  // Realtime's socket drops the moment the app backgrounds, and doesn't
  // replay what it missed on reconnect — so a read receipt (or anything
  // else) that landed while this device was asleep would otherwise only
  // ever show up after a full app relaunch. A light resync of conversations
  // alone (not the full loadFromSupabase — no need to re-pull every
  // message/reaction/hide just to catch this) on every foreground closes
  // that gap without flashing the inbox's loading state.
  const resyncConversations = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('conversations')
      .select('*, participants:conversation_participants(user_id, state, last_read_at, muted, pinned, forced_unread, bubble_color)')
      .order('last_message_at', { ascending: false });
    if (data) setConversations(data.map(mapConversation));
  }, []);

  useEffect(() => {
    if (!live || !userId) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') resyncConversations(userId).catch(() => {});
    });
    return () => sub.remove();
  }, [live, userId, resyncConversations]);

  // ── Realtime ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!live || !userId) return;

    const channel = supabase
      .channel('messages-inbox')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const row: any = payload.new;
          // Our own sends are already on screen from the insert's response —
          // taking the echo too would double every bubble we write.
          if (row.sender_id === userId) return;

          if (!knownConversations.current.has(row.conversation_id)) {
            // First message of a thread someone just started with us. Pull the
            // conversation in rather than dropping a message we can't place.
            loadFromSupabase(userId).catch(() => {});
            return;
          }
          const arrived = mapMessage(row);
          setMessages((prev) => (prev.some((m) => m.id === arrived.id) ? prev : [...prev, arrived]));
          setConversations((prev) =>
            prev.map((c) =>
              c.id === arrived.conversationId ? { ...c, lastMessageAt: arrived.createdAt } : c,
            ),
          );
          if (openThread.current !== arrived.conversationId) {
            setIncoming({
              conversationId: arrived.conversationId,
              senderId: arrived.senderId,
              preview:
                arrived.kind === 'plate'
                  ? '🍽 Shared a plate'
                  : arrived.kind === 'plato'
                    ? '🎬 Shared a Plato'
                    : arrived.kind === 'voice'
                      ? '🎙 Voice message'
                      : arrived.kind === 'image'
                        ? '📷 Photo'
                        : arrived.kind === 'restaurant'
                          ? '📍 Shared a restaurant'
                          : arrived.text,
            });
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        (payload) => {
          const row: any = payload.new ?? payload.old;
          if (!row || row.user_id === userId) return;
          setReactions((prev) => {
            const without = prev.filter(
              (r) => !(r.messageId === row.message_id && r.userId === row.user_id),
            );
            return payload.eventType === 'DELETE' ? without : [...without, mapReaction(payload.new)];
          });

          // Someone reacting to a message of yours is worth a banner; reacting
          // to somebody else's in a group thread isn't your news.
          if (payload.eventType === 'INSERT') {
            setMessages((current) => {
              const target = current.find((m) => m.id === row.message_id);
              if (
                target &&
                target.senderId === userId &&
                openThread.current !== target.conversationId
              ) {
                setIncoming({
                  conversationId: target.conversationId,
                  senderId: row.user_id,
                  preview: `${row.emoji} reacted to your message`,
                });
              }
              return current;
            });
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_participants' },
        (payload) => {
          const row: any = payload.new;
          // Our own row changing is already reflected locally the moment we
          // write it (markRead, toggleMute, ...) — this stream is for
          // hearing about everyone *else's* row, chiefly their read receipt.
          if (!row || row.user_id === userId) return;
          setConversations((prev) =>
            prev.map((c) =>
              c.id !== row.conversation_id
                ? c
                : { ...c, participants: c.participants.map((p) => (p.userId === row.user_id ? mapParticipant(row) : p)) },
            ),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [live, userId, loadFromSupabase]);

  // ── Selectors ───────────────────────────────────────────────────────────────
  const myRow = useCallback(
    (c: Conversation): ConversationParticipant | undefined => c.participants.find((p) => p.userId === me),
    [me],
  );

  const conversationFor = useCallback(
    (id: string) => conversations.find((c) => c.id === id),
    [conversations],
  );

  const visibleMessages = useMemo(() => messages.filter((m) => !hidden.has(m.id)), [messages, hidden]);

  const messagesFor = useCallback(
    (conversationId: string) => visibleMessages.filter((m) => m.conversationId === conversationId),
    [visibleMessages],
  );

  const messageById = useCallback((id: string) => messages.find((m) => m.id === id), [messages]);

  const lastMessageFor = useCallback(
    (conversationId: string) => {
      const inThread = visibleMessages.filter((m) => m.conversationId === conversationId);
      return inThread[inThread.length - 1];
    },
    [visibleMessages],
  );

  const unreadFor = useCallback(
    (conversationId: string) => {
      const conv = conversations.find((c) => c.id === conversationId);
      if (!conv) return 0;
      const row = myRow(conv);
      const readAt = +new Date(row?.lastReadAt ?? EPOCH);
      const real = visibleMessages.filter(
        (m) => m.conversationId === conversationId && m.senderId !== me && +new Date(m.createdAt) > readAt,
      ).length;
      // A manual "mark as unread" always shows at least 1, even if every
      // message is technically already read by timestamp.
      return row?.forcedUnread ? Math.max(1, real) : real;
    },
    [conversations, visibleMessages, me, myRow],
  );

  const seenBy = useCallback(
    (conversationId: string, messageCreatedAt: string) => {
      const conv = conversations.find((c) => c.id === conversationId);
      if (!conv) return [];
      const sentAt = +new Date(messageCreatedAt);
      return conv.participants
        .filter((p) => p.userId !== me && p.state === 'accepted' && +new Date(p.lastReadAt) >= sentAt)
        .map((p) => p.userId);
    },
    [conversations, me],
  );

  const otherIds = useCallback(
    (c: Conversation) => c.participants.filter((p) => p.userId !== me).map((p) => p.userId),
    [me],
  );

  // Requests are split out entirely: they're a decision, not a thread, and they
  // must not contribute to the badge or the inbox until accepted.
  const accepted = useMemo(
    () =>
      conversations
        .filter((c) => myRow(c)?.state !== 'request')
        .sort((a, b) => {
          const pinnedDiff = Number(!!myRow(b)?.pinned) - Number(!!myRow(a)?.pinned);
          if (pinnedDiff !== 0) return pinnedDiff;
          return +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt);
        }),
    [conversations, myRow],
  );
  const requests = useMemo(
    () =>
      conversations
        .filter((c) => myRow(c)?.state === 'request')
        .sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt)),
    [conversations, myRow],
  );

  // A muted thread still shows its own row count; it just stops shouting from
  // the tab bar. That's what muting is for.
  const unreadCount = useMemo(
    () => accepted.reduce((sum, c) => (myRow(c)?.muted ? sum : sum + unreadFor(c.id)), 0),
    [accepted, unreadFor, myRow],
  );

  // ── Reactions ───────────────────────────────────────────────────────────────
  const reactionsFor = useCallback(
    (messageId: string) => reactions.filter((r) => r.messageId === messageId),
    [reactions],
  );

  const myReaction = useCallback(
    (messageId: string) => reactions.find((r) => r.messageId === messageId && r.userId === me)?.emoji,
    [reactions, me],
  );

  const react = useCallback(
    (messageId: string, emoji: string = HEART_EMOJI) => {
      if (!me) return;
      const existing = reactions.find((r) => r.messageId === messageId && r.userId === me);
      // Re-picking what you already have is how you take it back — that's what
      // makes double-tap a toggle rather than a one-way door.
      const clearing = existing?.emoji === emoji;

      setReactions((prev) => {
        const without = prev.filter((r) => !(r.messageId === messageId && r.userId === me));
        return clearing ? without : [...without, { messageId, userId: me, emoji }];
      });

      if (!live || !userId) return;
      const revert = () =>
        setReactions((prev) => {
          const without = prev.filter((r) => !(r.messageId === messageId && r.userId === me));
          return existing ? [...without, existing] : without;
        });

      if (clearing) {
        supabase
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', userId)
          .then(({ error }) => {
            if (error) {
              if (__DEV__) console.warn('[Plated] unreact failed', error);
              revert();
            }
          });
      } else {
        // Upsert on the (message_id, user_id) key: swapping emoji is an update,
        // not a second row (0021).
        supabase
          .from('message_reactions')
          .upsert({ message_id: messageId, user_id: userId, emoji }, { onConflict: 'message_id,user_id' })
          .then(({ error }) => {
            if (error) {
              if (__DEV__) console.warn('[Plated] react failed', error);
              revert();
            }
          });
      }
    },
    [me, reactions, live, userId],
  );

  // ── Managing messages ───────────────────────────────────────────────────────
  const isMuted = useCallback(
    (conversationId: string) => {
      const conv = conversations.find((c) => c.id === conversationId);
      return !!(conv && myRow(conv)?.muted);
    },
    [conversations, myRow],
  );

  const toggleMute = useCallback(
    (conversationId: string) => {
      const next = !isMuted(conversationId);
      setConversations((prev) =>
        prev.map((c) =>
          c.id !== conversationId
            ? c
            : {
                ...c,
                participants: c.participants.map((p) =>
                  p.userId === me ? { ...p, muted: next } : p,
                ),
              },
        ),
      );
      if (live && userId)
        supabase
          .from('conversation_participants')
          .update({ muted: next })
          .eq('conversation_id', conversationId)
          .eq('user_id', userId)
          .then(() => {});
    },
    [isMuted, live, userId, me],
  );

  const isPinned = useCallback(
    (conversationId: string) => {
      const conv = conversations.find((c) => c.id === conversationId);
      return !!(conv && myRow(conv)?.pinned);
    },
    [conversations, myRow],
  );

  const togglePin = useCallback(
    (conversationId: string) => {
      const next = !isPinned(conversationId);
      setConversations((prev) =>
        prev.map((c) =>
          c.id !== conversationId
            ? c
            : { ...c, participants: c.participants.map((p) => (p.userId === me ? { ...p, pinned: next } : p)) },
        ),
      );
      if (live && userId)
        supabase
          .from('conversation_participants')
          .update({ pinned: next })
          .eq('conversation_id', conversationId)
          .eq('user_id', userId)
          .then(() => {});
    },
    [isPinned, live, userId, me],
  );

  // Self-scoped, like muted/pinned above — how MY own outgoing bubbles look
  // in this one conversation, not synced to the other person.
  const bubbleColorFor = useCallback(
    (conversationId: string) => {
      const conv = conversations.find((c) => c.id === conversationId);
      return conv ? myRow(conv)?.bubbleColor : undefined;
    },
    [conversations, myRow],
  );

  const setBubbleColor = useCallback(
    (conversationId: string, color: string | undefined) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id !== conversationId
            ? c
            : {
                ...c,
                participants: c.participants.map((p) =>
                  p.userId === me ? { ...p, bubbleColor: color } : p,
                ),
              },
        ),
      );
      if (live && userId)
        supabase
          .from('conversation_participants')
          .update({ bubble_color: color ?? null })
          .eq('conversation_id', conversationId)
          .eq('user_id', userId)
          .then(() => {});
    },
    [live, userId, me],
  );

  const markUnread = useCallback(
    (conversationId: string) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id !== conversationId
            ? c
            : { ...c, participants: c.participants.map((p) => (p.userId === me ? { ...p, forcedUnread: true } : p)) },
        ),
      );
      if (live && userId)
        supabase
          .from('conversation_participants')
          .update({ forced_unread: true })
          .eq('conversation_id', conversationId)
          .eq('user_id', userId)
          .then(() => {});
    },
    [live, userId, me],
  );

  const hideMessage = useCallback(
    (messageId: string) => {
      setHidden((prev) => new Set(prev).add(messageId));
      if (live && userId)
        supabase
          .from('message_hides')
          .insert({ message_id: messageId, user_id: userId })
          .then(({ error }) => {
            if (error) {
              if (__DEV__) console.warn('[Plated] hide failed', error);
              setHidden((prev) => {
                const next = new Set(prev);
                next.delete(messageId);
                return next;
              });
              showAlert('Could not delete', 'The message is still here — please try again.');
            }
          });
    },
    [live, userId],
  );

  const unsendMessage = useCallback(
    (messageId: string) => {
      const removed = messages.find((m) => m.id === messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      if (!live || !userId) return;
      supabase
        .from('messages')
        .delete()
        .eq('id', messageId)
        .select('id')
        .then(({ data, error }) => {
          // RLS returns success-with-nothing when the window has closed, so an
          // empty result is a refusal, not a no-op. Put the message back and
          // say why rather than letting the sender believe it's gone.
          if (error || !data || data.length === 0) {
            if (__DEV__) console.warn('[Plated] unsend refused', error);
            if (removed) setMessages((prev) => [...prev, removed].sort(byOldestFirst));
            showAlert(
              'Too late to unsend',
              'You can only take a message back within a few minutes of sending it. You can still delete it for yourself.',
            );
          }
        });
    },
    [messages, live, userId],
  );

  const editMessage = useCallback(
    (messageId: string, text: string) => {
      const previous = messages.find((m) => m.id === messageId);
      const editedAt = new Date().toISOString();
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, text, editedAt } : m)));
      if (!live || !userId) return;
      supabase
        .from('messages')
        .update({ text, edited_at: editedAt })
        .eq('id', messageId)
        .select('id')
        .then(({ data, error }) => {
          // Same "empty result = refused" shape as unsendMessage — the edit
          // window closing is enforced by the UPDATE policy (0059), not the
          // client, so a silent empty result means it was too late.
          if (error || !data || data.length === 0) {
            if (__DEV__) console.warn('[Plated] edit refused', error);
            if (previous) setMessages((prev) => prev.map((m) => (m.id === messageId ? previous : m)));
            showAlert('Too late to edit', 'You can only edit a message within 15 minutes of sending it.');
          }
        });
    },
    [messages, live, userId],
  );

  // ── Mutations ───────────────────────────────────────────────────────────────
  const clearIncoming = useCallback(() => setIncoming(null), []);

  /** Called by the thread screen on unmount, so banners resume elsewhere. */
  const leaveThread = useCallback(() => {
    openThread.current = null;
  }, []);

  const markRead = useCallback(
    (conversationId: string) => {
      // Reading a thread is also how the context learns which one is on screen.
      openThread.current = conversationId;
      const now = new Date().toISOString();
      setConversations((prev) =>
        prev.map((c) =>
          c.id !== conversationId
            ? c
            : {
                ...c,
                participants: c.participants.map((p) =>
                  p.userId === me ? { ...p, lastReadAt: now, forcedUnread: false } : p,
                ),
              },
        ),
      );
      if (live && userId)
        supabase
          .from('conversation_participants')
          .update({ last_read_at: now, forced_unread: false })
          .eq('conversation_id', conversationId)
          .eq('user_id', userId)
          .then(() => {});
    },
    [live, userId, me],
  );

  const write = useCallback(
    async (conversationId: string, draft: MessageDraft, tempId: string) => {
      const kind = draft.kind ?? 'text';
      const text = draft.text?.trim() ?? '';

      if (!live || !userId) {
        // Demo mode: the optimistic bubble is the real one.
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false } : m)));
        return true;
      }

      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          kind,
          text,
          attachment_id: draft.attachmentId ?? null,
          attachment_ids: draft.attachmentIds ?? null,
          attachment_index: draft.attachmentIndex ?? null,
          duration_ms: draft.durationMs ?? null,
          reply_to: draft.replyTo ?? null,
          reply_to_index: draft.replyToIndex ?? null,
          comment_post_id: draft.commentPostId ?? null,
          comment_author_id: draft.commentAuthorId ?? null,
          comment_text: draft.commentText ?? null,
        })
        .select('*')
        .single();

      if (error || !data) {
        if (__DEV__) console.warn('[Plated] send failed', error);
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)),
        );
        return false;
      }
      const saved = mapMessage(data);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? saved : m)));
      return true;
    },
    [live, userId],
  );

  const sendMessage = useCallback(
    async (conversationId: string, draft: MessageDraft) => {
      if (!me) return;
      const text = draft.text?.trim() ?? '';
      const kind = draft.kind ?? 'text';
      // A plain message with nothing in it isn't a message. Voice notes and
      // shared cards carry their content elsewhere.
      if (kind === 'text' && !text) return;

      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const now = new Date().toISOString();
      const optimistic: Message = {
        id: tempId,
        conversationId,
        senderId: me,
        kind,
        text,
        attachmentId: draft.attachmentId,
        attachmentIds: draft.attachmentIds,
        attachmentIndex: draft.attachmentIndex,
        durationMs: draft.durationMs,
        replyTo: draft.replyTo,
        replyToIndex: draft.replyToIndex,
        commentPostId: draft.commentPostId,
        commentAuthorId: draft.commentAuthorId,
        commentText: draft.commentText,
        createdAt: now,
        pending: true,
      };
      setMessages((prev) => [...prev, optimistic]);
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, lastMessageAt: now } : c)),
      );
      // Sending is reading — you've obviously seen everything above your reply.
      markRead(conversationId);

      await write(conversationId, draft, tempId);
    },
    [me, write, markRead],
  );

  const retryMessage = useCallback(
    (message: Message) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, failed: false, pending: true } : m)),
      );
      write(
        message.conversationId,
        {
          text: message.text,
          kind: message.kind,
          attachmentId: message.attachmentId,
          attachmentIds: message.attachmentIds,
          attachmentIndex: message.attachmentIndex,
          durationMs: message.durationMs,
          replyTo: message.replyTo,
        },
        message.id,
      ).catch(() => {});
    },
    [write],
  );

  /** Pull one conversation (and its members) back in after we create it. */
  const hydrateConversation = useCallback(async (conversationId: string) => {
    const { data } = await supabase
      .from('conversations')
      .select('*, participants:conversation_participants(user_id, state, last_read_at, muted, pinned, forced_unread, bubble_color)')
      .eq('id', conversationId)
      .single();
    if (!data) return;
    const conv = mapConversation(data);
    setConversations((prev) => (prev.some((c) => c.id === conv.id) ? prev : [conv, ...prev]));
  }, []);

  const startDirect = useCallback(
    async (otherUserId: string): Promise<string | null> => {
      if (!me || otherUserId === me) return null;

      const existing = conversations.find(
        (c) =>
          !c.isGroup &&
          c.participants.length === 2 &&
          c.participants.some((p) => p.userId === otherUserId),
      );
      if (existing) return existing.id;

      if (!live || !userId) {
        const id = `cv-${Date.now()}`;
        const now = new Date().toISOString();
        setConversations((prev) => [
          {
            id,
            isGroup: false,
            createdBy: me,
            createdAt: now,
            lastMessageAt: now,
            participants: [
              { userId: me, state: 'accepted', lastReadAt: now },
              { userId: otherUserId, state: 'accepted', lastReadAt: EPOCH },
            ],
          },
          ...prev,
        ]);
        return id;
      }

      // One call: the database finds the existing thread or makes one, so two
      // quick taps can't leave the same pair holding two threads.
      const { data, error } = await supabase.rpc('start_direct_conversation', { other: otherUserId });
      if (error || !data) {
        if (__DEV__) console.warn('[Plated] startDirect failed', error);
        showAlert('Could not open chat', 'Please try again in a moment.');
        return null;
      }
      await hydrateConversation(data as string);
      return data as string;
    },
    [me, conversations, live, userId, hydrateConversation],
  );

  const createGroup = useCallback(
    async (userIds: string[], title?: string): Promise<string | null> => {
      const others = [...new Set(userIds)].filter((id) => id && id !== me);
      if (!me || others.length === 0) return null;
      // Two people is a DM whatever the picker called it — reuse their thread
      // rather than stranding a second one beside it.
      if (others.length === 1) return startDirect(others[0]);

      const now = new Date().toISOString();
      const name = title?.trim() || undefined;

      if (!live || !userId) {
        const id = `cv-${Date.now()}`;
        setConversations((prev) => [
          {
            id,
            isGroup: true,
            title: name,
            createdBy: me,
            createdAt: now,
            lastMessageAt: now,
            participants: [
              { userId: me, state: 'accepted', lastReadAt: now },
              ...others.map((u) => ({ userId: u, state: 'accepted' as const, lastReadAt: EPOCH })),
            ],
          },
          ...prev,
        ]);
        return id;
      }

      // One atomic transaction — see 0049_group_chat_upgrade.sql for why this
      // replaced two sequential inserts (an RLS-timing race could fail group
      // creation even with no real refusal underneath it).
      const { data, error } = await supabase.rpc('create_group_conversation', {
        participant_ids: others,
        p_title: name ?? null,
      });
      if (error || !data) {
        if (__DEV__) console.warn('[Plated] createGroup failed', error);
        // The block-check trigger raises its own specific message; anything
        // else is a generic "try again."
        showAlert(
          'Could not create group',
          error?.message?.includes('cannot start a conversation')
            ? 'One of those people can’t be added right now.'
            : 'Please try again.',
        );
        return null;
      }

      await hydrateConversation(data as string);
      return data as string;
    },
    [me, live, userId, startDirect, hydrateConversation],
  );

  const sendTo = useCallback(
    async (userIds: string[], draft: MessageDraft): Promise<number> => {
      let sent = 0;
      for (const target of [...new Set(userIds)]) {
        const conversationId = await startDirect(target);
        if (!conversationId) continue;
        await sendMessage(conversationId, draft);
        sent += 1;
      }
      return sent;
    },
    [startDirect, sendMessage],
  );

  const acceptRequest = useCallback(
    (conversationId: string) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id !== conversationId
            ? c
            : {
                ...c,
                participants: c.participants.map((p) =>
                  p.userId === me ? { ...p, state: 'accepted' as const } : p,
                ),
              },
        ),
      );
      if (live && userId)
        supabase
          .from('conversation_participants')
          .update({ state: 'accepted' })
          .eq('conversation_id', conversationId)
          .eq('user_id', userId)
          .then(({ error }) => {
            if (error && __DEV__) console.warn('[Plated] accept request failed', error);
          });
    },
    [live, userId, me],
  );

  const leaveConversation = useCallback(
    (conversationId: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      setMessages((prev) => prev.filter((m) => m.conversationId !== conversationId));
      if (live && userId)
        supabase
          .from('conversation_participants')
          .delete()
          .eq('conversation_id', conversationId)
          .eq('user_id', userId)
          .then(() => {});
    },
    [live, userId],
  );

  const renameGroup = useCallback(
    (conversationId: string, title: string) => {
      const name = title.trim();
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, title: name || undefined } : c)),
      );
      if (live && userId)
        supabase
          .from('conversations')
          .update({ title: name || null })
          .eq('id', conversationId)
          .then(() => {});
    },
    [live, userId],
  );

  /**
   * Add people to an existing group. The "add participant" RLS policy
   * (0019) already lets a conversation's creator insert rows for others — no
   * new grant needed, just the client call. Re-reads and replaces the local
   * copy afterward rather than guessing each new row's `state`: the
   * gate_participant trigger may land someone as 'request' (a friends-only
   * privacy setting, same as any other invite), which is a server decision,
   * not a client one. (Not `hydrateConversation` — that only prepends a
   * conversation missing from local state, a no-op here since this one
   * already exists; this needs to actually replace the stale copy.)
   */
  const addParticipants = useCallback(
    async (conversationId: string, userIds: string[]): Promise<boolean> => {
      if (!live || !userId || userIds.length === 0) return false;
      const { error } = await supabase
        .from('conversation_participants')
        .insert(userIds.map((u) => ({ conversation_id: conversationId, user_id: u })));
      if (error) {
        if (__DEV__) console.warn('[Plated] addParticipants failed', error);
        return false;
      }
      const { data } = await supabase
        .from('conversations')
        .select('*, participants:conversation_participants(user_id, state, last_read_at, muted, pinned, forced_unread, bubble_color)')
        .eq('id', conversationId)
        .single();
      if (data) {
        const conv = mapConversation(data);
        setConversations((prev) => prev.map((c) => (c.id === conv.id ? conv : c)));
      }
      return true;
    },
    [live, userId],
  );

  /** Owner removes someone else from a group — the new "owner removes member" policy (0049). */
  const removeParticipant = useCallback(
    (conversationId: string, targetUserId: string) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id !== conversationId
            ? c
            : { ...c, participants: c.participants.filter((p) => p.userId !== targetUserId) },
        ),
      );
      if (!live || !userId) return;
      supabase
        .from('conversation_participants')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', targetUserId)
        .then(({ error }) => {
          if (error) {
            if (__DEV__) console.warn('[Plated] removeParticipant failed', error);
            hydrateConversation(conversationId).catch(() => {});
            showAlert('Could not remove them', 'Please try again.');
          }
        });
    },
    [live, userId, hydrateConversation],
  );

  const getInviteCode = useCallback(
    async (conversationId: string, regenerate?: boolean): Promise<string | null> => {
      if (!live || !userId) return null;
      const { data, error } = await supabase.rpc('get_or_create_invite_code', {
        cid: conversationId,
        regenerate: !!regenerate,
      });
      if (error || !data) {
        if (__DEV__) console.warn('[Plated] getInviteCode failed', error);
        showAlert('Could not get invite link', 'Please try again.');
        return null;
      }
      return data as string;
    },
    [live, userId],
  );

  const getInvitePreview = useCallback(
    async (code: string): Promise<InvitePreview | null> => {
      if (!live) return null;
      const { data, error } = await supabase.rpc('invite_preview', { code });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) return null;
      return {
        conversationId: row.conversation_id,
        title: row.title ?? null,
        avatarUrl: row.avatar_url ?? null,
        memberCount: Number(row.member_count ?? 0),
      };
    },
    [live],
  );

  const joinViaInvite = useCallback(
    async (code: string): Promise<string | null> => {
      if (!live || !userId) return null;
      const { data, error } = await supabase.rpc('join_via_invite', { code });
      if (error || !data) {
        if (__DEV__) console.warn('[Plated] joinViaInvite failed', error);
        showAlert('Could not join', 'That invite link may no longer be valid.');
        return null;
      }
      const conversationId = data as string;
      await hydrateConversation(conversationId);
      return conversationId;
    },
    [live, userId, hydrateConversation],
  );

  const setGroupPhoto = useCallback(
    (conversationId: string, url: string) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, avatarUrl: url } : c)),
      );
      if (live && userId)
        supabase
          .from('conversations')
          .update({ avatar_url: url })
          .eq('id', conversationId)
          .then(() => {});
    },
    [live, userId],
  );

  const setPrivacy = useCallback(
    (next: MessagePrivacy) => {
      const previous = privacy;
      setPrivacyState(next);
      if (!live || !userId) return;
      supabase
        .from('profiles')
        .update({ message_privacy: next })
        .eq('id', userId)
        .then(({ error }) => {
          if (error) {
            if (__DEV__) console.warn('[Plated] message privacy failed', error);
            setPrivacyState(previous);
            // Believing you're friends-only when you aren't is exactly the kind
            // of quiet failure a privacy control must never have.
            showAlert('Could not change this', 'Your message settings are unchanged — please try again.');
          }
        });
    },
    [live, userId, privacy],
  );

  const value = useMemo<MessagesContextValue>(
    () => ({
      conversations: accepted,
      requests,
      loading,
      unreadCount,
      conversationFor,
      messagesFor,
      lastMessageFor,
      unreadFor,
      loadOlderMessages,
      hasMoreOlderMessages,
      loadingOlderMessages,
      seenBy,
      otherIds,
      reactionsFor,
      myReaction,
      react,
      incoming,
      clearIncoming,
      leaveThread,
      isMuted,
      toggleMute,
      isPinned,
      togglePin,
      bubbleColorFor,
      setBubbleColor,
      markUnread,
      hideMessage,
      unsendMessage,
      editMessage,
      messageById,
      markRead,
      sendMessage,
      retryMessage,
      startDirect,
      createGroup,
      sendTo,
      acceptRequest,
      leaveConversation,
      renameGroup,
      setGroupPhoto,
      addParticipants,
      removeParticipant,
      getInviteCode,
      getInvitePreview,
      joinViaInvite,
      privacy,
      setPrivacy,
    }),
    [accepted, requests, loading, unreadCount, conversationFor, messagesFor, lastMessageFor, unreadFor, loadOlderMessages, hasMoreOlderMessages, loadingOlderMessages, seenBy, otherIds, reactionsFor, myReaction, react, incoming, clearIncoming, leaveThread, isMuted, toggleMute, isPinned, togglePin, bubbleColorFor, setBubbleColor, markUnread, hideMessage, unsendMessage, editMessage, messageById, markRead, sendMessage, retryMessage, startDirect, createGroup, sendTo, acceptRequest, leaveConversation, renameGroup, setGroupPhoto, addParticipants, removeParticipant, getInviteCode, getInvitePreview, joinViaInvite, privacy, setPrivacy],
  );

  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>;
}

export function useMessages(): MessagesContextValue {
  const ctx = useContext(MessagesContext);
  if (!ctx) throw new Error('useMessages must be used within a MessagesProvider');
  return ctx;
}
