import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/store/AuthContext';

/** Which kind of post a collaboration is attached to. */
export type CollabTarget = { type: 'plate' | 'plato'; id: string };

export interface PendingCollab {
  /** Row id — what `respond` acts on. */
  id: string;
  target: CollabTarget;
  /** The post owner who sent the invite. */
  invitedBy: string;
  dishName: string;
  photo?: string;
  createdAt: string;
}

interface CollabsContextValue {
  /** Invites waiting on *your* answer. */
  pending: PendingCollab[];
  loading: boolean;
  /** Invite co-creators onto a post you own. Returns false if nothing was written. */
  invite: (target: CollabTarget, userIds: string[]) => Promise<boolean>;
  respond: (id: string, status: 'accepted' | 'declined') => Promise<void>;
  refresh: () => void;
}

const CollabsContext = createContext<CollabsContextValue | undefined>(undefined);

const columnFor = (target: CollabTarget) => (target.type === 'plate' ? 'order_id' : 'plato_id');

const PENDING_SELECT =
  'id, order_id, plato_id, invited_by, created_at,' +
  ' order:orders(dish_name, photo_url), plato:plato_videos(dish_name, poster_url)';

/**
 * Collaborations on plates and Platos.
 *
 * One store for both post types: the rows live in one table and the accept flow
 * is identical, so splitting it across DataContext and PlatosContext would mean
 * maintaining the same logic twice. Accepted collaborators are read from the
 * post itself (joined in those contexts) — this store owns the *write* side and
 * the invites awaiting your answer.
 */
export function CollabsProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const live = isSupabaseConfigured;

  const [pending, setPending] = useState<PendingCollab[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!live || !userId) return;
    const { data, error } = await supabase
      .from('post_collaborators')
      .select(PENDING_SELECT)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[collabs] pending fetch failed:', error.message);
      setLoaded(true);
      return;
    }
    setPending(
      (data ?? []).map((r: any) => ({
        id: r.id,
        target: r.order_id ? { type: 'plate', id: r.order_id } : { type: 'plato', id: r.plato_id },
        invitedBy: r.invited_by,
        dishName: r.order?.dish_name ?? r.plato?.dish_name ?? 'a post',
        photo: r.order?.photo_url ?? r.plato?.poster_url ?? undefined,
        createdAt: r.created_at,
      })),
    );
    setLoaded(true);
  }, [live, userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, tick]);

  const loading = live && !!userId && !loaded;

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const invite = useCallback(
    async (target: CollabTarget, userIds: string[]): Promise<boolean> => {
      if (!live || !userId || userIds.length === 0) return false;
      const rows = userIds.map((id) => ({
        [columnFor(target)]: target.id,
        user_id: id,
        invited_by: userId,
      }));
      const { error } = await supabase.from('post_collaborators').insert(rows);
      if (error) {
        // Most likely the post isn't ours (RLS) or someone was already invited.
        console.warn('[collabs] invite failed:', error.message);
        return false;
      }
      return true;
    },
    [live, userId],
  );

  const respond = useCallback(
    async (id: string, status: 'accepted' | 'declined') => {
      // Drop it from the list first — the answer is the user's own action, so
      // there's nothing to reconcile if the write is slow.
      setPending((prev) => prev.filter((p) => p.id !== id));
      if (!live || !userId) return;
      const { error } = await supabase.from('post_collaborators').update({ status }).eq('id', id);
      if (error) {
        console.warn('[collabs] respond failed:', error.message);
        refresh();
      }
    },
    [live, userId, refresh],
  );

  const value = useMemo<CollabsContextValue>(
    () => ({ pending, loading, invite, respond, refresh }),
    [pending, loading, invite, respond, refresh],
  );

  return <CollabsContext.Provider value={value}>{children}</CollabsContext.Provider>;
}

export function useCollabs() {
  const ctx = useContext(CollabsContext);
  if (!ctx) throw new Error('useCollabs must be used within CollabsProvider');
  return ctx;
}
