import { Conversation, Message } from '@/data/messages';

/**
 * Naming and summarising a thread — shared by the inbox row, the thread header
 * and the send-to sheet so a conversation is called the same thing everywhere.
 */

/**
 * What to call a thread. A named group uses its name; an unnamed one lists its
 * people (and says how many more, rather than running off the row). A 1:1 is
 * simply the other person.
 */
export function conversationTitle(
  conversation: Conversation,
  otherIds: string[],
  nameOf: (userId: string) => string,
): string {
  if (conversation.title?.trim()) return conversation.title.trim();
  if (otherIds.length === 0) return 'Just you';
  const names = otherIds.map(nameOf);
  if (!conversation.isGroup || names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
}

/** The inbox's one-line summary of the latest message. */
export function messagePreview(
  message: Message | undefined,
  opts: { mine: boolean; senderName?: string; isGroup: boolean },
): string {
  if (!message) return 'No messages yet';

  const body =
    message.kind === 'plate'
      ? '🍽 Shared a plate'
      : message.kind === 'plato'
        ? '🎬 Shared a Plato'
        : message.kind === 'story_reply'
          ? `Replied to a story${message.text ? `: ${message.text}` : ''}`
          : message.kind === 'image'
            ? '📷 Photo'
            : message.text;

  // "You:" matters in both thread types — it's how you tell at a glance whether
  // the ball is in your court. The sender's name only earns space in a group.
  if (opts.mine) return `You: ${body}`;
  if (opts.isGroup && opts.senderName) return `${opts.senderName.split(' ')[0]}: ${body}`;
  return body;
}

/** Compact relative stamp for list rows — "now", "4m", "3h", "2d", "Mar 4". */
export function shortTime(iso: string, now = Date.now()): string {
  const mins = Math.round((now - +new Date(iso)) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Day separator label for a thread — "Today", "Yesterday", or the date. Threads
 * that span weeks are unreadable without one.
 */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** True when two messages are close enough in time to read as one run. */
export function sameRun(previous: Message | undefined, current: Message): boolean {
  if (!previous) return false;
  if (previous.senderId !== current.senderId) return false;
  return +new Date(current.createdAt) - +new Date(previous.createdAt) < 5 * 60_000;
}
