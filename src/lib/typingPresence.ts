import { useCallback, useEffect, useRef, useState } from 'react';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const STOP_DELAY_MS = 3000;

type Channel = ReturnType<typeof supabase.channel>;

/**
 * Ephemeral "is typing" state for one thread, via Realtime Presence rather
 * than the database — nobody needs a permanent record that you typed and
 * didn't send, and presence already clears itself the moment a client
 * disconnects, which a table row never does on its own.
 *
 * The channel is named after the conversation's (unguessable) uuid and left
 * public rather than behind Realtime Authorization — the same trust model
 * `messages-inbox`'s postgres_changes stream already leans on for reading;
 * reasonable for a low-stakes, self-clearing signal, not something that
 * would be acceptable for the messages themselves.
 */
export function useTypingPresence(conversationId: string | undefined, me: string | undefined) {
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const channelRef = useRef<Channel | null>(null);
  const readyRef = useRef(false);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    readyRef.current = false;
    // Cleared on the way out rather than at the top of this effect: a
    // conversationId switch tears down the old channel (and its stale
    // typing state, via this same cleanup) before the new one ever
    // subscribes, so there's nothing left to reset going in.
    if (!isSupabaseConfigured || !conversationId || !me) {
      return () => setTypingUserIds([]);
    }

    const channel = supabase.channel(`typing:${conversationId}`, {
      config: { presence: { key: me } },
    });
    channelRef.current = channel;

    const sync = () => {
      const state: Record<string, { typing?: boolean }[]> = channel.presenceState();
      const typing = Object.entries(state)
        .filter(([key, presences]) => key !== me && presences.some((p) => p.typing))
        .map(([key]) => key);
      setTypingUserIds(typing);
    };

    channel.on('presence', { event: 'sync' }, sync).subscribe((status) => {
      readyRef.current = status === 'SUBSCRIBED';
    });

    return () => {
      if (stopTimer.current) clearTimeout(stopTimer.current);
      readyRef.current = false;
      channelRef.current = null;
      supabase.removeChannel(channel);
      setTypingUserIds([]);
    };
  }, [conversationId, me]);

  const notifyTyping = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || !readyRef.current) return;
    channel.track({ typing: true });
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(() => channel.track({ typing: false }), STOP_DELAY_MS);
  }, []);

  const notifyStopped = useCallback(() => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (channelRef.current && readyRef.current) channelRef.current.track({ typing: false });
  }, []);

  return { typingUserIds, notifyTyping, notifyStopped };
}
