import { CURRENT_USER_ID } from '@/data/users';

/**
 * Direct messages — 1:1 and group threads.
 *
 * A conversation is the container; the participant rows carry the per-person
 * state (accepted vs. request, and how far each person has read). See
 * 0019_messaging.sql — the same shape, one boundary lower.
 *
 * The demo seed below is what the app runs on before Supabase keys are set, the
 * same way ORDERS/PLATOS work.
 */

export type MessageKind = 'text' | 'plate' | 'plato' | 'story_reply' | 'voice' | 'image' | 'restaurant';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  kind: MessageKind;
  text: string;
  /**
   * What this bubble renders as a card: a plate, a Plato, or the story being
   * replied to. Polymorphic on `kind` (mirrors messages.attachment_id).
   */
  attachmentId?: string;
  /**
   * Multi-photo `image` sends (the custom picker's multi-select) — a whole
   * selection is one message, rendered as a swipeable album. Single-photo
   * sends and every other kind still use `attachmentId` alone; a reader
   * should fall back to `[attachmentId]` when this is absent.
   */
  attachmentIds?: string[];
  /**
   * Which plate of a multi-plate post this is. Posts carry a carousel, and a
   * share means the plate the sender was looking at — not the headline dish.
   * Absent (or 0) for single-plate posts and every other attachment kind.
   */
  attachmentIndex?: number;
  /** Length of a voice note in milliseconds. */
  durationMs?: number;
  /** The message this one answers — rendered as a quoted strip above the text. */
  replyTo?: string;
  /**
   * Which photo of `replyTo`'s album this reply points at, when `replyTo`
   * is a multi-photo `image` message — the page the album carousel was on
   * when Reply was tapped. Undefined for a whole-message reply or a quote
   * that isn't a multi-photo album.
   */
  replyToIndex?: number;
  createdAt: string;
  /** Set once the text has been edited — the bubble shows an "Edited" label. */
  editedAt?: string;
  /** Set on optimistic bubbles until the insert comes back. */
  pending?: boolean;
  /** The write failed — the bubble offers a retry instead of lying. */
  failed?: boolean;
}

/**
 * One person's reaction to one message. Capped at one each by the primary key
 * in 0021 — picking a new emoji replaces the old one rather than stacking.
 */
export interface MessageReaction {
  messageId: string;
  userId: string;
  emoji: string;
}

/** The double-tap reaction, and the bar the long-press opens. */
export const HEART_EMOJI = '❤️';
export const QUICK_REACTIONS = ['😭', '❤️', '😂', '😮', '😡', '🤔', '🔥'] as const;

/**
 * How long after sending you can still take a message back for everyone.
 * Mirrored in the DELETE policy in 0022 — the client hides the button, the
 * database is what actually refuses.
 */
export const UNSEND_WINDOW_MS = 3 * 60_000;

export function canUnsend(message: Message, now = Date.now()): boolean {
  return now - +new Date(message.createdAt) < UNSEND_WINDOW_MS;
}

/**
 * How long after sending you can still fix a typo. Longer than the unsend
 * window on purpose — taking a message back for everyone is a bigger promise
 * than correcting it, so it gets a shorter leash. Mirrored in 0059's UPDATE
 * policy — same "client hides the button, the database actually refuses" split.
 */
export const EDIT_WINDOW_MS = 15 * 60_000;

export function canEdit(message: Message, now = Date.now()): boolean {
  return message.kind === 'text' && now - +new Date(message.createdAt) < EDIT_WINDOW_MS;
}

export interface ConversationParticipant {
  userId: string;
  /** 'request' until the recipient accepts a thread from a non-friend. */
  state: 'accepted' | 'request';
  /** Everything newer than this is unread for that person. */
  lastReadAt: string;
  /** This person silenced the thread — it stops counting toward their badge. */
  muted?: boolean;
  /** This person pinned the thread to the top of their own inbox. */
  pinned?: boolean;
  /** Manually marked unread — cleared the next time this person actually opens the thread. */
  forcedUnread?: boolean;
  /** This person's own outgoing-bubble color override for this conversation. */
  bubbleColor?: string;
}

export interface Conversation {
  id: string;
  isGroup: boolean;
  /** Groups can be named; 1:1 threads are titled from the other person. */
  title?: string;
  /** Group photo — 1:1 threads render the other person's avatar instead. */
  avatarUrl?: string;
  createdBy: string;
  createdAt: string;
  lastMessageAt: string;
  participants: ConversationParticipant[];
}

/** Who can start a thread with you. */
export type MessagePrivacy = 'everyone' | 'friends';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

export const DEMO_CONVERSATIONS: Conversation[] = [
  {
    id: 'cv1',
    isGroup: false,
    createdBy: 'u1',
    createdAt: hoursAgo(30),
    lastMessageAt: hoursAgo(1),
    participants: [
      { userId: CURRENT_USER_ID, state: 'accepted', lastReadAt: hoursAgo(4) },
      { userId: 'u1', state: 'accepted', lastReadAt: hoursAgo(1) },
    ],
  },
  {
    id: 'cv2',
    isGroup: true,
    title: 'Sunday dumpling run',
    createdBy: CURRENT_USER_ID,
    createdAt: hoursAgo(50),
    lastMessageAt: hoursAgo(6),
    participants: [
      { userId: CURRENT_USER_ID, state: 'accepted', lastReadAt: hoursAgo(6) },
      { userId: 'u2', state: 'accepted', lastReadAt: hoursAgo(7) },
      { userId: 'u3', state: 'accepted', lastReadAt: hoursAgo(6) },
    ],
  },
  {
    id: 'cv3',
    isGroup: false,
    createdBy: 'u5',
    createdAt: hoursAgo(3),
    lastMessageAt: hoursAgo(3),
    // Started by someone you don't follow back — lands in Requests.
    participants: [
      { userId: CURRENT_USER_ID, state: 'request', lastReadAt: '1970-01-01T00:00:00.000Z' },
      { userId: 'u5', state: 'accepted', lastReadAt: hoursAgo(3) },
    ],
  },
];

export const DEMO_MESSAGES: Message[] = [
  {
    id: 'm1',
    conversationId: 'cv1',
    senderId: 'u1',
    kind: 'text',
    text: 'you have to try this before it goes off the menu',
    createdAt: hoursAgo(2),
  },
  {
    id: 'm2',
    conversationId: 'cv1',
    senderId: 'u1',
    kind: 'plate',
    text: '',
    attachmentId: 'o1',
    // Not the headline burger — the fries, which is what she'd swiped to.
    attachmentIndex: 1,
    createdAt: hoursAgo(2),
  },
  {
    id: 'm3',
    conversationId: 'cv1',
    senderId: CURRENT_USER_ID,
    kind: 'text',
    text: 'ok that looks unreal. friday?',
    createdAt: hoursAgo(1.5),
  },
  {
    id: 'm3b',
    conversationId: 'cv1',
    senderId: CURRENT_USER_ID,
    kind: 'plato',
    text: 'she did a whole reel on it too',
    attachmentId: 'p1',
    createdAt: hoursAgo(1.2),
  },
  {
    id: 'm4',
    conversationId: 'cv1',
    senderId: 'u1',
    kind: 'text',
    text: 'friday. i’ll book 7:30',
    // Answers the "friday?" above — shows the quoted strip in the bubble.
    replyTo: 'm3',
    createdAt: hoursAgo(1),
  },
  {
    id: 'm5',
    conversationId: 'cv2',
    senderId: 'u2',
    kind: 'text',
    text: 'soup dumplings or bust',
    createdAt: hoursAgo(8),
  },
  {
    id: 'm6',
    conversationId: 'cv2',
    senderId: 'u3',
    kind: 'plate',
    text: 'this is the one I meant',
    attachmentId: 'o3',
    createdAt: hoursAgo(7),
  },
  {
    id: 'm7',
    conversationId: 'cv2',
    senderId: CURRENT_USER_ID,
    kind: 'text',
    text: 'booked for 4 at noon 🥟',
    createdAt: hoursAgo(6),
  },
  {
    id: 'm8',
    conversationId: 'cv3',
    senderId: 'u5',
    kind: 'text',
    text: 'hey! loved your ramen post — where was that again?',
    createdAt: hoursAgo(3),
  },
];
