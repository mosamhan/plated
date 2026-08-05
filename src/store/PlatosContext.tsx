import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { PLATO_COMMENTS, PLATOS, PlatoComment, PlatoVideo } from '@/data/platos';
import { showAlert } from '@/lib/dialog';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/store/AuthContext';
import { useData } from '@/store/DataContext';
import { mapPlato, mapPlatoComment } from '@/store/mappers';

export interface NewPlatoInput {
  videoUrl: string;
  poster?: string;
  dishName: string;
  restaurantName: string;
  restaurantId?: string;
  rating: number;
  caption: string;
  /** The plates this video covers (name + rating each). Falls back to the
   *  single dishName/rating when absent. */
  plates?: { dishName: string; rating: number }[];
}

interface PlatosContextValue {
  platos: PlatoVideo[];
  loading: boolean;
  /** Re-order the feed randomly (the pull-to-refresh / shuffle action). */
  refresh: () => void;
  /** Bumps on each refresh() so the feed can jump back to the first reel. */
  refreshTick: number;
  isLiked: (id: string) => boolean;
  toggleLike: (id: string) => void;
  /** Records that the signed-in user watched this Plato. Safe to call repeatedly. */
  recordView: (id: string) => void;
  commentsFor: (id: string) => PlatoComment[];
  /** Live mode fetches a Plato's comments on demand (no-op in demo). */
  loadComments: (id: string) => void;
  /** parentId set → this is a threaded reply to that top-level comment. */
  addComment: (id: string, text: string, parentId?: string) => void;
  isCommentLiked: (commentId: string) => boolean;
  toggleCommentLike: (platoId: string, commentId: string) => void;
  addPlato: (input: NewPlatoInput) => Promise<PlatoVideo | null>;
  /** Delete your own Plato. */
  deletePlato: (id: string) => void;
  /** Change who can see your Plato. */
  setPlatoVisibility: (id: string, visibility: 'public' | 'friends' | 'private') => void;
  /** Archive/unarchive your Plato — hidden from everyone but you when archived. */
  setPlatoArchived: (id: string, archived: boolean) => void;
}

const PlatosContext = createContext<PlatosContextValue | undefined>(undefined);

// Fisher–Yates. Personalized ranking will eventually replace this shuffle with
// a score from the user's account details + in-app interactions (see 0002_platos.sql).
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function groupComments(list: PlatoComment[]): Record<string, PlatoComment[]> {
  const out: Record<string, PlatoComment[]> = {};
  for (const c of list) (out[c.platoId] ??= []).push(c);
  return out;
}

const PLATO_SELECT =
  // `*` already brings view_count along (0009); likes/comments stay aggregates.
  '*, creator:profiles!plato_videos_user_id_fkey(name,handle,avatar_url,verified,compensation_eligible), likes:plato_likes(count), comments:plato_comments(count), collaborators:post_collaborators(user_id, status)';

export function PlatosProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const { currentUser } = useData();
  const live = isSupabaseConfigured;

  const [platos, setPlatos] = useState<PlatoVideo[]>([]);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  const [commentsByPlato, setCommentsByPlato] = useState<Record<string, PlatoComment[]>>({});
  const [loadedComments, setLoadedComments] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(live);
  const [refreshTick, setRefreshTick] = useState(0);

  const seedFromDemo = useCallback(() => {
    setPlatos(shuffle(PLATOS));
    setCommentsByPlato(groupComments(PLATO_COMMENTS));
    setLoadedComments(new Set(PLATOS.map((p) => p.id)));
    setLiked(new Set());
    setLikedComments(new Set());
    setLoading(false);
  }, []);

  const loadFromSupabase = useCallback(
    async (uid: string) => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('plato_videos')
          .select(PLATO_SELECT)
          .order('created_at', { ascending: false });
        // Table missing (migration not run yet) or no creator posts → show demo reels.
        if (error || !data || data.length === 0) {
          seedFromDemo();
          return;
        }
        const likesRes = await supabase.from('plato_likes').select('plato_id').eq('user_id', uid);
        setPlatos(shuffle(data.map(mapPlato)));
        setCommentsByPlato({});
        setLoadedComments(new Set());
        setLiked(new Set((likesRes.data ?? []).map((r) => r.plato_id)));
        setLikedComments(new Set());
        setLoading(false);
      } catch {
        seedFromDemo();
      }
    },
    [seedFromDemo],
  );

  useEffect(() => {
    if (live && userId) loadFromSupabase(userId);
    else seedFromDemo();
  }, [live, userId, loadFromSupabase, seedFromDemo]);

  const refresh = useCallback(() => {
    setPlatos((prev) => shuffle(prev));
    setRefreshTick((t) => t + 1);
  }, []);

  const adjustCount = (id: string, field: 'likes' | 'comments' | 'views', delta: number) =>
    setPlatos((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: Math.max(0, p[field] + delta) } : p)));

  const isLiked = useCallback((id: string) => liked.has(id), [liked]);
  const toggleLike = useCallback(
    (id: string) => {
      const on = !liked.has(id);
      setLiked((p) => { const n = new Set(p); on ? n.add(id) : n.delete(id); return n; });
      adjustCount(id, 'likes', on ? 1 : -1);
      if (live && userId) {
        const q = on
          ? supabase.from('plato_likes').insert({ plato_id: id, user_id: userId })
          : supabase.from('plato_likes').delete().eq('plato_id', id).eq('user_id', userId);
        q.then(({ error }) => {
          if (!error) return;
          console.warn(`[platos] like ${on ? 'insert' : 'delete'} failed:`, error.message);
          // Server disagrees — put the UI back rather than showing a like that
          // won't survive a reload.
          setLiked((p) => { const n = new Set(p); on ? n.delete(id) : n.add(id); return n; });
          adjustCount(id, 'likes', on ? -1 : 1);
        });
      }
    },
    [liked, live, userId],
  );

  // Platos this session has already counted. The table's composite PK makes a
  // repeat insert a no-op anyway; this just avoids the round-trip on every
  // swipe back to a reel.
  const viewed = useRef<Set<string>>(new Set());

  // The number only moves once the row is really there. Bumping first and
  // undoing on failure looks quicker but strands a phantom view whenever the
  // undo never runs — demo mode, a session that hasn't restored yet, or a
  // request that never came back.
  const recordView = useCallback(
    (id: string) => {
      if (!live || !userId || viewed.current.has(id)) return;
      viewed.current.add(id);
      supabase
        .from('plato_views')
        .insert({ plato_id: id, user_id: userId })
        .then(
          ({ error }) => {
            if (!error) {
              adjustCount(id, 'views', 1);
              return;
            }
            // 23505 = this viewer is already counted from another session or
            // device, so the server total is right as it stands.
            if (error.code === '23505') return;
            console.warn('[platos] view insert failed:', error.message);
            viewed.current.delete(id);
          },
          (err) => {
            // Offline or dropped mid-flight — let a later swipe try again.
            console.warn('[platos] view insert failed:', err?.message ?? err);
            viewed.current.delete(id);
          },
        );
    },
    [live, userId],
  );

  const commentsFor = useCallback((id: string) => commentsByPlato[id] ?? [], [commentsByPlato]);

  const loadComments = useCallback(
    (id: string) => {
      if (!live || loadedComments.has(id)) return;
      setLoadedComments((p) => new Set(p).add(id));
      supabase
        .from('plato_comments')
        .select('*, author:profiles!plato_comments_user_id_fkey(name,handle,avatar_url), likes:plato_comment_likes(count)')
        .eq('plato_id', id)
        .order('created_at', { ascending: true })
        .then(async ({ data }) => {
          if (!data) return;
          setCommentsByPlato((m) => ({ ...m, [id]: data.map(mapPlatoComment) }));
          // Which of these comments has the current user already liked?
          if (userId && data.length) {
            const mine = await supabase
              .from('plato_comment_likes')
              .select('comment_id')
              .eq('user_id', userId)
              .in('comment_id', data.map((c) => c.id));
            if (mine.data?.length) {
              setLikedComments((p) => { const n = new Set(p); mine.data.forEach((r) => n.add(r.comment_id)); return n; });
            }
          }
        });
    },
    [live, loadedComments, userId],
  );

  const addComment = useCallback(
    (id: string, text: string, parentId?: string) => {
      const tempId = `pc${Date.now()}`;
      const optimistic: PlatoComment = {
        id: tempId,
        platoId: id,
        parentId,
        userId: currentUser.id,
        name: currentUser.name,
        handle: currentUser.handle,
        avatar: currentUser.avatar,
        text,
        likes: 0,
        createdAt: new Date().toISOString(),
      };
      setCommentsByPlato((m) => ({ ...m, [id]: [...(m[id] ?? []), optimistic] }));
      adjustCount(id, 'comments', 1);
      if (live && userId) {
        supabase
          .from('plato_comments')
          .insert({ plato_id: id, user_id: userId, text, parent_id: parentId ?? null })
          .select('*, author:profiles!plato_comments_user_id_fkey(name,handle,avatar_url)')
          .single()
          .then(({ data, error }) => {
            if (error || !data) {
              console.warn('[platos] comment insert failed:', error?.message ?? 'no row returned');
              // Drop the optimistic comment — leaving it implies it was saved.
              setCommentsByPlato((m) => ({ ...m, [id]: (m[id] ?? []).filter((c) => c.id !== tempId) }));
              adjustCount(id, 'comments', -1);
              showAlert('Comment not posted', 'Your comment could not be saved — please try again.');
              return;
            }
            setCommentsByPlato((m) => ({
              ...m,
              [id]: (m[id] ?? []).map((c) => (c.id === tempId ? mapPlatoComment(data) : c)),
            }));
          });
      }
    },
    [currentUser, live, userId],
  );

  const isCommentLiked = useCallback((commentId: string) => likedComments.has(commentId), [likedComments]);
  const toggleCommentLike = useCallback(
    (platoId: string, commentId: string) => {
      const on = !likedComments.has(commentId);
      setLikedComments((p) => { const n = new Set(p); on ? n.add(commentId) : n.delete(commentId); return n; });
      setCommentsByPlato((m) => ({
        ...m,
        [platoId]: (m[platoId] ?? []).map((c) =>
          c.id === commentId ? { ...c, likes: Math.max(0, c.likes + (on ? 1 : -1)) } : c,
        ),
      }));
      if (live && userId) {
        const q = on
          ? supabase.from('plato_comment_likes').insert({ comment_id: commentId, user_id: userId })
          : supabase.from('plato_comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId);
        q.then(({ error }) => {
          if (!error) return;
          console.warn(`[platos] comment like ${on ? 'insert' : 'delete'} failed:`, error.message);
          setLikedComments((p) => { const n = new Set(p); on ? n.delete(commentId) : n.add(commentId); return n; });
          setCommentsByPlato((m) => ({
            ...m,
            [platoId]: (m[platoId] ?? []).map((c) =>
              c.id === commentId ? { ...c, likes: Math.max(0, c.likes + (on ? -1 : 1)) } : c,
            ),
          }));
        });
      }
    },
    [likedComments, live, userId],
  );

  const addPlato = useCallback(
    async (input: NewPlatoInput): Promise<PlatoVideo | null> => {
      const local: PlatoVideo = {
        id: `p${Date.now()}`,
        videoUrl: input.videoUrl,
        poster: input.poster || currentUser.avatar,
        creatorId: currentUser.id,
        creatorName: currentUser.name,
        creatorHandle: currentUser.handle,
        avatar: currentUser.avatar,
        verified: currentUser.verified,
        compensationEligible: currentUser.compensationEligible,
        dishName: input.dishName,
        restaurantName: input.restaurantName,
        restaurantId: input.restaurantId,
        rating: input.rating,
        caption: input.caption,
        plates: input.plates?.length ? input.plates : undefined,
        likes: 0,
        comments: 0,
        views: 0,
      };
      setPlatos((p) => [local, ...p]);
      setLoadedComments((p) => new Set(p).add(local.id));

      if (live && userId) {
        // Roll the optimistic post back out of the feed. Keeping it would show
        // the creator a Plato that silently vanishes on next launch.
        const rollback = (reason: string) => {
          console.warn('[platos] failed to save Plato:', reason);
          setPlatos((p) => p.filter((x) => x.id !== local.id));
          setLoadedComments((p) => { const n = new Set(p); n.delete(local.id); return n; });
        };
        try {
          // supabase-js reports query failures in `error` rather than throwing,
          // so this must be read explicitly — the catch below only sees network
          // and client-side faults.
          const { data, error } = await supabase
            .from('plato_videos')
            .insert({
              user_id: userId,
              restaurant_id: input.restaurantId ?? null,
              restaurant_name: input.restaurantName,
              video_url: input.videoUrl,
              poster_url: input.poster ?? null,
              dish_name: input.dishName,
              rating: input.rating,
              caption: input.caption,
              plates: input.plates?.length
                ? input.plates.map((pl) => ({ dish_name: pl.dishName, rating: pl.rating }))
                : null,
            })
            .select(PLATO_SELECT)
            .single();
          if (error || !data) {
            rollback(error?.message ?? 'no row returned');
            return null;
          }
          // Swap the temp row for the persisted one.
          const saved = mapPlato(data);
          setPlatos((p) => p.map((x) => (x.id === local.id ? saved : x)));
          return saved;
        } catch (e) {
          rollback(e instanceof Error ? e.message : String(e));
          return null;
        }
      }
      return local;
    },
    [currentUser, live, userId],
  );

  // Content controls — mirror the plate ones (see DataContext). Optimistic
  // local update, then the row write; RLS scopes each to the author.
  const deletePlato = useCallback(
    (id: string) => {
      setPlatos((p) => p.filter((x) => x.id !== id));
      if (live) supabase.from('plato_videos').delete().eq('id', id).then(() => {});
    },
    [live],
  );
  const setPlatoVisibility = useCallback(
    (id: string, visibility: 'public' | 'friends' | 'private') => {
      setPlatos((p) => p.map((x) => (x.id === id ? { ...x, visibility } : x)));
      if (live) supabase.from('plato_videos').update({ visibility }).eq('id', id).then(() => {});
    },
    [live],
  );
  const setPlatoArchived = useCallback(
    (id: string, archived: boolean) => {
      setPlatos((p) => p.map((x) => (x.id === id ? { ...x, archived } : x)));
      if (live) supabase.from('plato_videos').update({ archived }).eq('id', id).then(() => {});
    },
    [live],
  );

  const value = useMemo<PlatosContextValue>(
    () => ({ platos, loading, refresh, refreshTick, isLiked, toggleLike, recordView, commentsFor, loadComments, addComment, isCommentLiked, toggleCommentLike, addPlato, deletePlato, setPlatoVisibility, setPlatoArchived }),
    [platos, loading, refresh, refreshTick, isLiked, toggleLike, recordView, commentsFor, loadComments, addComment, isCommentLiked, toggleCommentLike, addPlato, deletePlato, setPlatoVisibility, setPlatoArchived],
  );

  return <PlatosContext.Provider value={value}>{children}</PlatosContext.Provider>;
}

export function usePlatos(): PlatosContextValue {
  const ctx = useContext(PlatosContext);
  if (!ctx) throw new Error('usePlatos must be used within a PlatosProvider');
  return ctx;
}
