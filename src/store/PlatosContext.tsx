import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { PLATO_COMMENTS, PLATOS, PlatoComment, PlatoVideo } from '@/data/platos';
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
  commentsFor: (id: string) => PlatoComment[];
  /** Live mode fetches a Plato's comments on demand (no-op in demo). */
  loadComments: (id: string) => void;
  addComment: (id: string, text: string) => void;
  isCommentLiked: (commentId: string) => boolean;
  toggleCommentLike: (platoId: string, commentId: string) => void;
  addPlato: (input: NewPlatoInput) => Promise<PlatoVideo | null>;
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
  '*, creator:profiles!plato_videos_user_id_fkey(name,handle,avatar_url,verified,compensation_eligible), likes:plato_likes(count), comments:plato_comments(count)';

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

  const adjustCount = (id: string, field: 'likes' | 'comments', delta: number) =>
    setPlatos((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: Math.max(0, p[field] + delta) } : p)));

  const isLiked = useCallback((id: string) => liked.has(id), [liked]);
  const toggleLike = useCallback(
    (id: string) => {
      const on = !liked.has(id);
      setLiked((p) => { const n = new Set(p); on ? n.add(id) : n.delete(id); return n; });
      adjustCount(id, 'likes', on ? 1 : -1);
      if (live && userId) {
        if (on) supabase.from('plato_likes').insert({ plato_id: id, user_id: userId }).then(() => {});
        else supabase.from('plato_likes').delete().eq('plato_id', id).eq('user_id', userId).then(() => {});
      }
    },
    [liked, live, userId],
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
    (id: string, text: string) => {
      const tempId = `pc${Date.now()}`;
      const optimistic: PlatoComment = {
        id: tempId,
        platoId: id,
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
          .insert({ plato_id: id, user_id: userId, text })
          .select('*, author:profiles!plato_comments_user_id_fkey(name,handle,avatar_url)')
          .single()
          .then(({ data }) => {
            if (data) setCommentsByPlato((m) => ({
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
        if (on) supabase.from('plato_comment_likes').insert({ comment_id: commentId, user_id: userId }).then(() => {});
        else supabase.from('plato_comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId).then(() => {});
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
        likes: 0,
        comments: 0,
      };
      setPlatos((p) => [local, ...p]);
      setLoadedComments((p) => new Set(p).add(local.id));

      if (live && userId) {
        try {
          const { data } = await supabase
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
            })
            .select(PLATO_SELECT)
            .single();
          // Swap the temp row for the persisted one (keeps the local one if the
          // table isn't there yet — the post still shows for this session).
          if (data) {
            const saved = mapPlato(data);
            setPlatos((p) => p.map((x) => (x.id === local.id ? saved : x)));
            return saved;
          }
        } catch {
          /* keep the local optimistic Plato */
        }
      }
      return local;
    },
    [currentUser, live, userId],
  );

  const value = useMemo<PlatosContextValue>(
    () => ({ platos, loading, refresh, refreshTick, isLiked, toggleLike, commentsFor, loadComments, addComment, isCommentLiked, toggleCommentLike, addPlato }),
    [platos, loading, refresh, refreshTick, isLiked, toggleLike, commentsFor, loadComments, addComment, isCommentLiked, toggleCommentLike, addPlato],
  );

  return <PlatosContext.Provider value={value}>{children}</PlatosContext.Provider>;
}

export function usePlatos(): PlatosContextValue {
  const ctx = useContext(PlatosContext);
  if (!ctx) throw new Error('usePlatos must be used within a PlatosProvider');
  return ctx;
}
