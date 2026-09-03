import { useCallback, useEffect, useState } from 'react';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/store/AuthContext';

/**
 * The one pinned message in a thread (0060_message_pins.sql) — a standalone
 * hook (matching `conversationStreak.ts`'s pattern) rather than more state on
 * `MessagesContext`, which is already sizeable. Returns just the pinned
 * message's id; the caller already has the full `Message` in memory via
 * `messageById` (`MessagesContext`), so there's no reason to fetch it twice.
 */
export function useMessagePins(conversationId: string | undefined) {
  const { userId } = useAuth();
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!conversationId || !isSupabaseConfigured) {
      setPinnedMessageId(null);
      return;
    }
    const { data, error } = await supabase
      .from('message_pins')
      .select('message_id')
      .eq('conversation_id', conversationId)
      .maybeSingle();
    if (error) {
      if (__DEV__) console.warn('[Plated] message pin fetch failed', error.message);
      return;
    }
    setPinnedMessageId(data?.message_id ?? null);
  }, [conversationId]);

  useEffect(() => {
    // load() only sets state after awaiting the network — same shape as
    // conversationStreak.ts's own load().
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    if (!conversationId || !isSupabaseConfigured) return;
    const channel = supabase
      .channel(`message-pins-${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_pins', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setPinnedMessageId(null);
          } else {
            setPinnedMessageId((payload.new as { message_id: string }).message_id);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const pin = useCallback(
    async (messageId: string) => {
      if (!conversationId || !userId || !isSupabaseConfigured) return;
      setPinnedMessageId(messageId);
      const { error } = await supabase
        .from('message_pins')
        .upsert(
          { conversation_id: conversationId, message_id: messageId, pinned_by: userId },
          { onConflict: 'conversation_id' },
        );
      if (error) {
        if (__DEV__) console.warn('[Plated] pin failed', error.message);
        load();
      }
    },
    [conversationId, userId, load],
  );

  const unpin = useCallback(async () => {
    if (!conversationId || !isSupabaseConfigured) return;
    setPinnedMessageId(null);
    const { error } = await supabase.from('message_pins').delete().eq('conversation_id', conversationId);
    if (error) {
      if (__DEV__) console.warn('[Plated] unpin failed', error.message);
      load();
    }
  }, [conversationId, load]);

  return { pinnedMessageId, pin, unpin };
}
