import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { DEMO_STORIES, isExpired, Story, StoryGroup } from '@/data/stories';
import { CURRENT_USER_ID } from '@/data/users';
import { showAlert } from '@/lib/dialog';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/store/AuthContext';
import { mapStory } from '@/store/mappers';

/**
 * Stories — 24-hour dish moments.
 *
 * Expiry is filtered here as well as in RLS, because a story can lapse while
 * the app is open: the database stops serving it, but the copy already in
 * memory would keep showing on the rail until the next load.
 *
 * "Seen" is per-story and per-viewer (`story_views`), which is also what the
 * author's viewer list reads from — one table, two questions.
 */

export interface NewStoryInput {
  mediaUrl: string;
  mediaType?: 'image' | 'clip';
  caption?: string;
  restaurantId?: string;
  orderId?: string;
  visibility?: 'public' | 'friends';
}

interface StoriesContextValue {
  /** Rail order: yours first, then unseen, then seen. */
  groups: StoryGroup[];
  /** Your own live stories (the "Your story" bubble + profile archive). */
  myStories: Story[];
  loading: boolean;

  storiesFor: (userId: string) => Story[];
  hasUnseen: (userId: string) => boolean;
  isSeen: (storyId: string) => boolean;
  markSeen: (storyId: string) => void;

  /** Who watched one of your stories. Loaded on demand; author-only by RLS. */
  viewersFor: (storyId: string) => string[];
  loadViewers: (storyId: string) => Promise<void>;

  addStory: (input: NewStoryInput) => Promise<Story | null>;
  deleteStory: (storyId: string) => void;

  /**
   * Your own stories that have expired. Only ever yours — RLS returns an
   * author their lapsed rows and nobody else's (0020).
   */
  archivedStories: Story[];

  /** Stop seeing someone's stories without unfollowing them. */
  isStoryMuted: (userId: string) => boolean;
  toggleStoryMute: (userId: string) => void;
}

const StoriesContext = createContext<StoriesContextValue | undefined>(undefined);

const newestFirst = (a: Story, b: Story) => +new Date(a.createdAt) - +new Date(b.createdAt);

export function StoriesProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const live = isSupabaseConfigured;
  const me = live ? userId : CURRENT_USER_ID;

  const [stories, setStories] = useState<Story[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [viewers, setViewers] = useState<Record<string, string[]>>({});
  const [storyMutes, setStoryMutes] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(live);
  // Re-evaluates expiry on a timer so a story that lapses while you're looking
  // at the rail actually leaves it.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const loadFromSupabase = useCallback(async (uid: string) => {
    setLoading(true);
    const [storiesRes, seenRes] = await Promise.all([
      // RLS already drops expired and out-of-audience rows; the filter here
      // just avoids shipping the author their own expired archive to the rail.
      supabase.from('stories').select('*').order('created_at', { ascending: true }),
      supabase.from('story_views').select('story_id').eq('user_id', uid),
    ]);
    if (storiesRes.error) {
      if (__DEV__) console.warn('[Plated] stories load failed', storiesRes.error);
      setLoading(false);
      return;
    }
    setStories((storiesRes.data ?? []).map(mapStory));
    setSeen(new Set((seenRes.data ?? []).map((r: any) => r.story_id)));

    const mutes = await supabase.from('story_mutes').select('muted_id').eq('user_id', uid);
    setStoryMutes((mutes.data ?? []).map((r: any) => r.muted_id));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!live) {
      setStories([...DEMO_STORIES].sort(newestFirst));
      setLoading(false);
      return;
    }
    if (!userId) {
      setStories([]);
      setLoading(false);
      return;
    }
    loadFromSupabase(userId).catch(() => setLoading(false));
  }, [live, userId, loadFromSupabase]);

  // Muted people drop out of everything the rail and viewer read from — muting
  // is "I don't want to see this", not "hide the ring but keep the content".
  const liveStories = useMemo(
    () => stories.filter((s) => !isExpired(s, now) && !storyMutes.includes(s.userId)),
    [stories, now, storyMutes],
  );

  const storiesFor = useCallback(
    (uid: string) => liveStories.filter((s) => s.userId === uid).sort(newestFirst),
    [liveStories],
  );

  const isSeen = useCallback((storyId: string) => seen.has(storyId), [seen]);

  const hasUnseen = useCallback(
    (uid: string) => storiesFor(uid).some((s) => !seen.has(s.id)),
    [storiesFor, seen],
  );

  const myStories = useMemo(() => (me ? storiesFor(me) : []), [me, storiesFor]);

  const archivedStories = useMemo(
    () =>
      me
        ? stories.filter((s) => s.userId === me && isExpired(s, now)).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
        : [],
    [stories, me, now],
  );

  const groups = useMemo<StoryGroup[]>(() => {
    const byUser = new Map<string, Story[]>();
    for (const s of liveStories) {
      byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s]);
    }
    const all: StoryGroup[] = [...byUser.entries()].map(([uid, list]) => ({
      userId: uid,
      stories: [...list].sort(newestFirst),
      seen: list.every((s) => seen.has(s.id)),
    }));

    return all.sort((a, b) => {
      // Yours pins to the front — it's the thing you're checking on, not
      // something to discover.
      if (a.userId === me) return -1;
      if (b.userId === me) return 1;
      if (a.seen !== b.seen) return a.seen ? 1 : -1;
      // Freshest activity first within each half.
      const last = (g: StoryGroup) => +new Date(g.stories[g.stories.length - 1].createdAt);
      return last(b) - last(a);
    });
  }, [liveStories, seen, me]);

  const markSeen = useCallback(
    (storyId: string) => {
      if (seen.has(storyId)) return;
      setSeen((prev) => new Set(prev).add(storyId));
      if (live && userId) {
        // Your own story doesn't need a view row — you're not an audience.
        const story = stories.find((s) => s.id === storyId);
        if (story?.userId === userId) return;
        supabase
          .from('story_views')
          .insert({ story_id: storyId, user_id: userId })
          .then(() => {});
      }
    },
    [seen, live, userId, stories],
  );

  const viewersFor = useCallback((storyId: string) => viewers[storyId] ?? [], [viewers]);

  const loadViewers = useCallback(
    async (storyId: string) => {
      if (!live || !userId) return;
      const { data } = await supabase.from('story_views').select('user_id').eq('story_id', storyId);
      if (data) setViewers((prev) => ({ ...prev, [storyId]: data.map((r: any) => r.user_id) }));
    },
    [live, userId],
  );

  const addStory = useCallback(
    async (input: NewStoryInput): Promise<Story | null> => {
      if (!me) return null;
      const createdAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();

      if (!live || !userId) {
        const story: Story = {
          id: `s-${Date.now()}`,
          userId: me,
          mediaUrl: input.mediaUrl,
          mediaType: input.mediaType ?? 'image',
          caption: input.caption ?? '',
          restaurantId: input.restaurantId,
          orderId: input.orderId,
          visibility: input.visibility ?? 'public',
          createdAt,
          expiresAt,
        };
        setStories((prev) => [...prev, story]);
        return story;
      }

      const { data, error } = await supabase
        .from('stories')
        .insert({
          user_id: userId,
          media_url: input.mediaUrl,
          media_type: input.mediaType ?? 'image',
          caption: input.caption ?? '',
          restaurant_id: input.restaurantId ?? null,
          order_id: input.orderId ?? null,
          visibility: input.visibility ?? 'public',
        })
        .select('*')
        .single();
      if (error || !data) {
        if (__DEV__) console.warn('[Plated] addStory failed', error);
        showAlert('Could not post', 'Your story didn’t go up — please try again.');
        return null;
      }
      const story = mapStory(data);
      setStories((prev) => [...prev, story]);
      // Housekeeping, piggybacked on the one moment we know the user is online
      // and writing: clear out rows that expired more than a day ago.
      supabase.rpc('reap_expired_stories').then(() => {});
      return story;
    },
    [me, live, userId],
  );

  const isStoryMuted = useCallback((uid: string) => storyMutes.includes(uid), [storyMutes]);

  const toggleStoryMute = useCallback(
    (uid: string) => {
      const on = !storyMutes.includes(uid);
      setStoryMutes((prev) => (on ? [...prev, uid] : prev.filter((m) => m !== uid)));
      if (!live || !userId) return;
      const q = on
        ? supabase.from('story_mutes').insert({ user_id: userId, muted_id: uid })
        : supabase.from('story_mutes').delete().eq('user_id', userId).eq('muted_id', uid);
      q.then(({ error }) => {
        if (error) {
          if (__DEV__) console.warn('[Plated] story mute failed', error);
          setStoryMutes((prev) => (on ? prev.filter((m) => m !== uid) : [...prev, uid]));
        }
      });
    },
    [storyMutes, live, userId],
  );

  const deleteStory = useCallback(
    (storyId: string) => {
      const removed = stories.find((s) => s.id === storyId);
      setStories((prev) => prev.filter((s) => s.id !== storyId));
      if (live && userId)
        supabase
          .from('stories')
          .delete()
          .eq('id', storyId)
          .then(({ error }) => {
            if (error) {
              if (__DEV__) console.warn('[Plated] deleteStory failed', error);
              if (removed) setStories((prev) => [...prev, removed]);
              showAlert('Could not delete', 'Your story is still up — please try again.');
            }
          });
    },
    [stories, live, userId],
  );

  const value = useMemo<StoriesContextValue>(
    () => ({
      groups,
      myStories,
      loading,
      storiesFor,
      hasUnseen,
      isSeen,
      markSeen,
      viewersFor,
      loadViewers,
      addStory,
      deleteStory,
      archivedStories,
      isStoryMuted,
      toggleStoryMute,
    }),
    [groups, myStories, loading, storiesFor, hasUnseen, isSeen, markSeen, viewersFor, loadViewers, addStory, deleteStory, archivedStories, isStoryMuted, toggleStoryMute],
  );

  return <StoriesContext.Provider value={value}>{children}</StoriesContext.Provider>;
}

export function useStories(): StoriesContextValue {
  const ctx = useContext(StoriesContext);
  if (!ctx) throw new Error('useStories must be used within a StoriesProvider');
  return ctx;
}
