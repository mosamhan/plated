import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { PLATO_COMMENTS, PLATOS, PlatoComment, PlatoVideo } from '@/data/platos';
import { showAlert } from '@/lib/dialog';
import { placeTypeFor, type PlaceType } from '@/lib/placeType';
import { rankWithDistance, scoreTextMatch } from '@/lib/search';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { affinityFor, computeTasteAffinity, rankByAffinity } from '@/lib/tasteProfile';
import { useAuth } from '@/store/AuthContext';
import { useData } from '@/store/DataContext';
import { useLocation } from '@/store/LocationContext';
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
  /** Fetches the next page of Platos — call as the feed nears the end of what's loaded. */
  loadMorePlatos: () => void;
  isLiked: (id: string) => boolean;
  toggleLike: (id: string) => void;
  /** Records that the signed-in user watched this Plato. Safe to call repeatedly. */
  recordView: (id: string) => void;
  commentsFor: (id: string) => PlatoComment[];
  /** Live mode fetches a Plato's comments on demand (no-op in demo). */
  loadComments: (id: string) => void;
  /** parentId set → this is a threaded reply to that top-level comment. */
  addComment: (id: string, text: string, parentId?: string, imageUrl?: string) => void;
  /** Author only — the row's own RLS policy is what actually enforces that. */
  deleteComment: (platoId: string, commentId: string) => void;
  isCommentLiked: (commentId: string) => boolean;
  toggleCommentLike: (platoId: string, commentId: string) => void;
  addPlato: (input: NewPlatoInput) => Promise<PlatoVideo | null>;
  /** Delete your own Plato. */
  deletePlato: (id: string) => void;
  /** Change who can see your Plato. */
  setPlatoVisibility: (id: string, visibility: 'public' | 'friends' | 'private') => void;
  /** Archive/unarchive your Plato — hidden from everyone but you when archived. */
  setPlatoArchived: (id: string, archived: boolean) => void;
  /**
   * "Do not include in taste profile" — a viewer excluding someone else's
   * Plato from their own feed. Private to the viewer; the creator never sees
   * it. Removes it from the feed immediately and records the signal for a
   * future taste-profile feature.
   */
  excludePlato: (id: string) => void;
  /** Every Plato whose dish name matches `query`, ranked nearby-first. For the multi-entity search screen. */
  searchPlatos: (query: string) => PlatoVideo[];
}

const PlatosContext = createContext<PlatosContextValue | undefined>(undefined);

function groupComments(list: PlatoComment[]): Record<string, PlatoComment[]> {
  const out: Record<string, PlatoComment[]> = {};
  for (const c of list) (out[c.platoId] ??= []).push(c);
  return out;
}

const PLATO_SELECT =
  // `*` already brings view_count along (0009); likes/comments stay aggregates.
  '*, creator:profiles!plato_videos_user_id_fkey(name,handle,avatar_url,verified,compensation_eligible), likes:plato_likes(count), comments:plato_comments(count), collaborators:post_collaborators(user_id, status)';

// The feed used to fetch every Plato in the table on every cold start —
// fine at demo scale, a real problem once there's enough content that
// "every row" stops being a small number. Paged instead; `loadMorePlatos`
// pulls the next page as the feed nears the end of what's loaded.
const PLATO_PAGE_SIZE = 20;

export function PlatosProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const { currentUser, restaurantFor } = useData();
  const { location } = useLocation();
  const live = isSupabaseConfigured;

  const [rawPlatos, setRawPlatos] = useState<PlatoVideo[]>([]);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  const [commentsByPlato, setCommentsByPlato] = useState<Record<string, PlatoComment[]>>({});
  const [loadedComments, setLoadedComments] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(live);
  const [refreshTick, setRefreshTick] = useState(0);
  const [platoOffset, setPlatoOffset] = useState(0);
  const [hasMorePlatos, setHasMorePlatos] = useState(true);
  const [loadingMorePlatos, setLoadingMorePlatos] = useState(false);
  // Taste-profile signals (see src/lib/tasteProfile.ts) not already covered
  // by `liked` above. Fetched once at load, not re-fetched per page — none
  // of these are page-scoped facts.
  const [sharedPlatoIds, setSharedPlatoIds] = useState<Set<string>>(new Set());
  const [savedPlatoIds, setSavedPlatoIds] = useState<Set<string>>(new Set());
  // Place types excluded this session via "do not include in taste profile"
  // — captured from the excluded Plato's own data at the moment it's
  // excluded (see excludePlato below), not re-derived from past sessions'
  // exclusion rows, which would need an extra round-trip to resolve ids
  // back to a restaurant/cuisine for comparatively little benefit.
  const [excludedPlaceTypes, setExcludedPlaceTypes] = useState<PlaceType[]>([]);
  // Which load-page each Plato came from — same page-stability role as
  // DataContext's orderPageOf, so loadMorePlatos appending a page never
  // reorders reels already rendered (and, here specifically, never shifts
  // the index a viewer's mid-swipe position depends on).
  const platoPageOf = useRef<Map<string, number>>(new Map());
  const nextPlatoPage = useRef(0);

  const seedFromDemo = useCallback(() => {
    platoPageOf.current = new Map(PLATOS.map((p) => [p.id, 0]));
    nextPlatoPage.current = 1;
    setRawPlatos(PLATOS);
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
          .order('created_at', { ascending: false })
          .range(0, PLATO_PAGE_SIZE - 1);
        // Table missing (migration not run yet) or no creator posts → show demo reels.
        if (error || !data || data.length === 0) {
          seedFromDemo();
          return;
        }
        const [likesRes, exclusionsRes, sharesRes, savesRes] = await Promise.all([
          supabase.from('plato_likes').select('plato_id').eq('user_id', uid),
          supabase.from('plato_taste_exclusions').select('plato_id').eq('user_id', uid),
          supabase.from('content_shares').select('plato_id').eq('user_id', uid).not('plato_id', 'is', null),
          supabase.from('collection_items').select('item_id, collections!inner(user_id)').eq('item_type', 'plato').eq('collections.user_id', uid),
        ]);
        const excluded = new Set((exclusionsRes.data ?? []).map((r) => r.plato_id));
        const likedIds = new Set((likesRes.data ?? []).map((r) => r.plato_id));
        const sharedIds = new Set((sharesRes.data ?? []).map((r) => r.plato_id).filter(Boolean));
        const savedIds = new Set((savesRes.data ?? []).map((r) => r.item_id));
        const mapped = data.filter((row) => !excluded.has(row.id)).map(mapPlato);
        platoPageOf.current = new Map(mapped.map((p) => [p.id, 0]));
        nextPlatoPage.current = 1;
        const placeTypeOf = (id: string) => {
          const p = mapped.find((m) => m.id === id);
          return placeTypeFor(p?.restaurantId ? restaurantFor(p.restaurantId)?.cuisine : undefined);
        };
        const affinity = computeTasteAffinity({
          onboarding: (currentUser.tasteCategories ?? []) as PlaceType[],
          reorders: [],
          saves: [...savedIds].map(placeTypeOf),
          shares: [...sharedIds].map(placeTypeOf),
          likes: [...likedIds].map(placeTypeOf),
          views: [],
          excludes: [],
        });
        setRawPlatos(
          rankByAffinity(
            mapped,
            (p) => p.id,
            (p) => (p.restaurantId ? affinityFor(affinity, placeTypeFor(restaurantFor(p.restaurantId)?.cuisine)) : 0),
            (id) => platoPageOf.current.get(id) ?? 0,
          ),
        );
        setPlatoOffset(data.length);
        setHasMorePlatos(data.length === PLATO_PAGE_SIZE);
        setCommentsByPlato({});
        setLoadedComments(new Set());
        setLiked(likedIds);
        setLikedComments(new Set());
        setSharedPlatoIds(sharedIds);
        setSavedPlatoIds(savedIds);
        setExcludedPlaceTypes([]);
        setLoading(false);
      } catch {
        seedFromDemo();
      }
    },
    [seedFromDemo, currentUser.tasteCategories, restaurantFor],
  );

  useEffect(() => {
    if (live && userId) loadFromSupabase(userId);
    else seedFromDemo();
  }, [live, userId, loadFromSupabase, seedFromDemo]);

  // Pulls the next page as the feed nears the end of what's loaded (wired to
  // PlatosFeed's onEndReached) — appends rather than reshuffling everything,
  // so reels already on screen don't reorder out from under the viewer. The
  // new page is ranked within itself (tagged with its own page number, see
  // rankByAffinity) using whatever the affinity looks like right now — new
  // content adapting to interactions made since the last page loaded is the
  // point; it just can never outrank a page already on screen.
  const loadMorePlatos = useCallback(async () => {
    if (!live || !userId || loadingMorePlatos || !hasMorePlatos) return;
    setLoadingMorePlatos(true);
    try {
      const { data, error } = await supabase
        .from('plato_videos')
        .select(PLATO_SELECT)
        .order('created_at', { ascending: false })
        .range(platoOffset, platoOffset + PLATO_PAGE_SIZE - 1);
      if (error || !data) {
        setHasMorePlatos(false);
        return;
      }
      const [likesRes, exclusionsRes] = await Promise.all([
        supabase.from('plato_likes').select('plato_id').eq('user_id', userId).in('plato_id', data.map((r) => r.id)),
        supabase.from('plato_taste_exclusions').select('plato_id').eq('user_id', userId),
      ]);
      const excluded = new Set((exclusionsRes.data ?? []).map((r) => r.plato_id));
      const mapped = data.filter((row) => !excluded.has(row.id)).map(mapPlato);
      const page = nextPlatoPage.current;
      nextPlatoPage.current += 1;
      for (const p of mapped) platoPageOf.current.set(p.id, page);
      const placeTypeOf = (id: string) => {
        const p = mapped.find((m) => m.id === id);
        return placeTypeFor(p?.restaurantId ? restaurantFor(p.restaurantId)?.cuisine : undefined);
      };
      const newLikedIds = (likesRes.data ?? []).map((r) => r.plato_id);
      const affinity = computeTasteAffinity({
        onboarding: (currentUser.tasteCategories ?? []) as PlaceType[],
        reorders: [],
        saves: [...savedPlatoIds].map(placeTypeOf),
        shares: [...sharedPlatoIds].map(placeTypeOf),
        likes: [...liked, ...newLikedIds].map(placeTypeOf),
        views: [],
        excludes: excludedPlaceTypes,
      });
      const fresh = rankByAffinity(
        mapped,
        (p) => p.id,
        (p) => (p.restaurantId ? affinityFor(affinity, placeTypeFor(restaurantFor(p.restaurantId)?.cuisine)) : 0),
        (id) => platoPageOf.current.get(id) ?? page,
      );
      setRawPlatos((prev) => [...prev, ...fresh]);
      setLiked((prev) => {
        const next = new Set(prev);
        for (const id of newLikedIds) next.add(id);
        return next;
      });
      setPlatoOffset((o) => o + data.length);
      setHasMorePlatos(data.length === PLATO_PAGE_SIZE);
    } finally {
      setLoadingMorePlatos(false);
    }
  }, [live, userId, loadingMorePlatos, hasMorePlatos, platoOffset, currentUser.tasteCategories, restaurantFor, savedPlatoIds, sharedPlatoIds, liked, excludedPlaceTypes]);

  // Pull-to-refresh: re-ranks the whole feed with a fresh random tiebreak
  // (rankByAffinity), the same explicit "shuffle it up" action the old pure
  // shuffle gave — still respects the current affinity, so a strong
  // preference doesn't get buried by refreshing, but everything roughly as
  // relevant reshuffles among itself the way a plain shuffle used to.
  const refresh = useCallback(() => {
    const placeTypeOf = (id: string) => {
      const p = rawPlatos.find((m) => m.id === id);
      return placeTypeFor(p?.restaurantId ? restaurantFor(p.restaurantId)?.cuisine : undefined);
    };
    const affinity = computeTasteAffinity({
      onboarding: (currentUser.tasteCategories ?? []) as PlaceType[],
      reorders: [],
      saves: [...savedPlatoIds].map(placeTypeOf),
      shares: [...sharedPlatoIds].map(placeTypeOf),
      likes: [...liked].map(placeTypeOf),
      views: [],
      excludes: excludedPlaceTypes,
    });
    setRawPlatos((prev) =>
      rankByAffinity(
        prev,
        (p) => p.id,
        (p) => (p.restaurantId ? affinityFor(affinity, placeTypeFor(restaurantFor(p.restaurantId)?.cuisine)) : 0),
        (id) => platoPageOf.current.get(id) ?? 0,
      ),
    );
    setRefreshTick((t) => t + 1);
  }, [rawPlatos, currentUser.tasteCategories, restaurantFor, savedPlatoIds, sharedPlatoIds, liked, excludedPlaceTypes]);

  const adjustCount = (id: string, field: 'likes' | 'comments' | 'views', delta: number) =>
    setRawPlatos((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: Math.max(0, p[field] + delta) } : p)));

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
    (id: string, text: string, parentId?: string, imageUrl?: string) => {
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
        imageUrl,
        likes: 0,
        createdAt: new Date().toISOString(),
      };
      setCommentsByPlato((m) => ({ ...m, [id]: [...(m[id] ?? []), optimistic] }));
      adjustCount(id, 'comments', 1);
      if (live && userId) {
        supabase
          .from('plato_comments')
          .insert({ plato_id: id, user_id: userId, text, parent_id: parentId ?? null, image_url: imageUrl ?? null })
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

  // RLS (0002) already restricts the delete to the caller's own row. Replies
  // to the deleted comment cascade in the DB (parent_id references ... on
  // delete cascade, 0004) — mirrored here so the optimistic removal doesn't
  // leave orphaned replies visible until the next refetch.
  const deleteComment = useCallback(
    (platoId: string, commentId: string) => {
      const list = commentsByPlato[platoId] ?? [];
      const removedCount = list.filter((c) => c.id === commentId || c.parentId === commentId).length;
      if (removedCount === 0) return;
      setCommentsByPlato((m) => ({
        ...m,
        [platoId]: (m[platoId] ?? []).filter((c) => c.id !== commentId && c.parentId !== commentId),
      }));
      adjustCount(platoId, 'comments', -removedCount);
      if (live && userId) supabase.from('plato_comments').delete().eq('id', commentId).then(() => {});
    },
    [commentsByPlato, live, userId],
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
      setRawPlatos((p) => [local, ...p]);
      setLoadedComments((p) => new Set(p).add(local.id));

      if (live && userId) {
        // Roll the optimistic post back out of the feed. Keeping it would show
        // the creator a Plato that silently vanishes on next launch.
        const rollback = (reason: string) => {
          console.warn('[platos] failed to save Plato:', reason);
          setRawPlatos((p) => p.filter((x) => x.id !== local.id));
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
          setRawPlatos((p) => p.map((x) => (x.id === local.id ? saved : x)));
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
      setRawPlatos((p) => p.filter((x) => x.id !== id));
      if (live) supabase.from('plato_videos').delete().eq('id', id).then(() => {});
    },
    [live],
  );
  const setPlatoVisibility = useCallback(
    (id: string, visibility: 'public' | 'friends' | 'private') => {
      setRawPlatos((p) => p.map((x) => (x.id === id ? { ...x, visibility } : x)));
      if (live) supabase.from('plato_videos').update({ visibility }).eq('id', id).then(() => {});
    },
    [live],
  );
  const setPlatoArchived = useCallback(
    (id: string, archived: boolean) => {
      setRawPlatos((p) => p.map((x) => (x.id === id ? { ...x, archived } : x)));
      if (live) supabase.from('plato_videos').update({ archived }).eq('id', id).then(() => {});
    },
    [live],
  );

  const excludePlato = useCallback(
    (id: string) => {
      // Captured before the filter below removes it — its own data (and so
      // its restaurant/cuisine) won't be reachable afterward. Only feeds the
      // negative signal for *this* session; see excludedPlaceTypes above.
      const excluded = rawPlatos.find((p) => p.id === id);
      if (excluded) {
        const type = placeTypeFor(excluded.restaurantId ? restaurantFor(excluded.restaurantId)?.cuisine : undefined);
        if (type !== 'other') setExcludedPlaceTypes((p) => [...p, type]);
      }
      setRawPlatos((p) => p.filter((x) => x.id !== id));
      if (live && userId) {
        supabase
          .from('plato_taste_exclusions')
          .insert({ plato_id: id, user_id: userId })
          .then(({ error }) => {
            if (error) console.warn('[platos] taste exclusion insert failed:', error.message);
          });
      }
    },
    [live, userId, rawPlatos, restaurantFor],
  );

  // Every Plato whose dish name matches, ranked nearby-first — search screen.
  // Scores the best-matching dish (headline or any other plate in a multi-dish
  // Plato), same idea as DataContext's searchPlates.
  const locationOrigin = location.lat != null && location.lng != null ? { lat: location.lat, lng: location.lng } : null;
  const searchPlatos = useCallback(
    (query: string) => {
      const q = query.trim();
      if (!q) return [];
      // Also scored against the restaurant's own name (already on the video,
      // no lookup needed) — searching "3 Arts Club" should surface Platos
      // filmed there, not just ones whose dish name contains the term.
      const bestScore = (p: PlatoVideo) => {
        const scores = [
          scoreTextMatch(p.dishName, q),
          ...(p.plates ?? []).map((pl) => scoreTextMatch(pl.dishName, q)),
          scoreTextMatch(p.restaurantName, q),
        ].filter((s) => s >= 0);
        return scores.length ? Math.min(...scores) : -1;
      };
      return rankWithDistance(rawPlatos, {
        score: bestScore,
        coords: (p) => {
          const r = p.restaurantId ? restaurantFor(p.restaurantId) : undefined;
          return r?.lat != null && r?.lng != null ? { lat: r.lat, lng: r.lng } : undefined;
        },
        rating: (p) => p.rating,
        origin: locationOrigin,
      });
    },
    [rawPlatos, restaurantFor, locationOrigin],
  );

  const value = useMemo<PlatosContextValue>(
    () => ({ platos: rawPlatos, loading, refresh, refreshTick, loadMorePlatos, isLiked, toggleLike, recordView, commentsFor, loadComments, addComment, deleteComment, isCommentLiked, toggleCommentLike, addPlato, deletePlato, setPlatoVisibility, setPlatoArchived, excludePlato, searchPlatos }),
    [rawPlatos, loading, refresh, refreshTick, loadMorePlatos, isLiked, toggleLike, recordView, commentsFor, loadComments, addComment, deleteComment, isCommentLiked, toggleCommentLike, addPlato, deletePlato, setPlatoVisibility, setPlatoArchived, excludePlato, searchPlatos],
  );

  return <PlatosContext.Provider value={value}>{children}</PlatosContext.Provider>;
}

export function usePlatos(): PlatosContextValue {
  const ctx = useContext(PlatosContext);
  if (!ctx) throw new Error('usePlatos must be used within a PlatosProvider');
  return ctx;
}
