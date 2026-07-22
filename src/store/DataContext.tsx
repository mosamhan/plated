import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { CONTACTS } from '@/data/contacts';
import { foodPhoto } from '@/data/images';
import { makeOrderId, ORDERS, REORDER_SEEDS } from '@/data/orders';
import { getRestaurant as getMockRestaurant, RESTAURANTS } from '@/data/restaurants';
import { COMMENTS, NOTIFICATIONS } from '@/data/social';
import {
  AppNotification,
  Comment,
  Contact,
  Order,
  ReportReason,
  ReportTarget,
  Restaurant,
  User,
} from '@/data/types';
import { CURRENT_USER_ID, getUser as getMockUser, USERS } from '@/data/users';
import { PlaceResult } from '@/lib/places';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/store/AuthContext';
import { mapComment, mapNotification, mapOrder, mapProfile, mapRestaurant } from '@/store/mappers';

export interface RestaurantWithRating extends Restaurant {
  platedRating: number;
  orderCount: number;
}

export interface NewOrderInput {
  /** Existing restaurant (when adding a plate from a restaurant page). */
  restaurantId?: string;
  /** Foursquare place (when adding from search) — upserted to the restaurants table. */
  place?: PlaceResult;
  dishName: string;
  photo: string;
  description: string;
  rating: number;
  tags?: string[];
}

interface DataContextValue {
  orders: Order[];
  restaurants: Restaurant[];
  contacts: Contact[];
  currentUser: User;
  loading: boolean;
  refresh: () => void;

  // lookups (route all user/restaurant resolution through these)
  userFor: (id: string) => User;
  restaurantFor: (id: string) => Restaurant | undefined;

  // selectors
  feedOrders: () => Order[];
  verifiedCreatorOrders: () => Order[];
  ordersByRestaurant: (restaurantId: string) => Order[];
  ordersByUser: (userId: string) => Order[];
  ratingsByUser: (userId: string) => Order[];
  restaurantWithRating: (restaurantId: string) => RestaurantWithRating | undefined;
  topRestaurants: () => RestaurantWithRating[];
  topPlates: () => Order[];
  topCreators: () => User[];
  followingUsers: () => User[];
  followerUsers: () => User[];
  suggestedUsers: () => User[];
  exploreOrders: (filter: string) => Order[];
  searchRestaurants: (query: string) => Restaurant[];

  // interactions
  isLiked: (orderId: string) => boolean;
  toggleLike: (orderId: string) => void;
  isSaved: (orderId: string) => boolean;
  toggleSave: (orderId: string) => void;
  isFollowing: (userId: string) => boolean;
  toggleFollow: (userId: string) => void;
  hasReordered: (orderId: string) => boolean;
  markReordered: (orderId: string) => void;

  // comments
  commentsFor: (orderId: string) => Comment[];
  addComment: (orderId: string, text: string) => void;

  // notifications
  notifications: AppNotification[];
  unreadCount: number;
  markAllNotificationsRead: () => void;

  // trust & safety
  reportContent: (targetType: ReportTarget, targetId: string, reason: ReportReason, details?: string) => void;
  isBlocked: (userId: string) => boolean;
  blockUser: (userId: string) => void;
  unblockUser: (userId: string) => void;
  blockedUsers: () => User[];

  // mutations
  addOrder: (input: NewOrderInput) => Promise<Order | null>;
  updateProfile: (patch: Partial<User>) => void;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

function platedRatingFor(orders: Order[], restaurantId: string) {
  const list = orders.filter((o) => o.restaurantId === restaurantId);
  if (list.length === 0) return { rating: 0, count: 0 };
  const avg = list.reduce((s, o) => s + o.rating, 0) / list.length;
  return { rating: Math.round(avg * 10) / 10, count: list.length };
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const live = isSupabaseConfigured;

  const [orders, setOrders] = useState<Order[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, User>>({});
  const [restaurantMap, setRestaurantMap] = useState<Record<string, Restaurant>>({});
  const [comments, setComments] = useState<Comment[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [reordered, setReordered] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [followers, setFollowers] = useState<Set<string>>(new Set());
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState<string>(CURRENT_USER_ID);
  const [loading, setLoading] = useState<boolean>(live);

  // ── Seed from mock data (no backend configured) ───────────────────────────
  const seedFromMock = useCallback(() => {
    setOrders(ORDERS.map((o) => ({ ...o, reorders: REORDER_SEEDS[o.id] ?? 0 })));
    setProfileMap(Object.fromEntries(USERS.map((u) => [u.id, u])));
    setRestaurantMap(Object.fromEntries(RESTAURANTS.map((r) => [r.id, r])));
    setComments(COMMENTS);
    setNotifications(NOTIFICATIONS);
    setFollowing(new Set(['u1', 'u3']));
    // Mock followers: a couple of users "follow" you so the People tab isn't empty.
    setFollowers(new Set(['u2', 'u4', 'u5']));
    setCurrentUserId(CURRENT_USER_ID);
    setLoading(false);
  }, []);

  // ── Load everything from Supabase ──────────────────────────────────────────
  const loadFromSupabase = useCallback(async (uid: string) => {
    setLoading(true);
    const [profilesRes, restaurantsRes, ordersRes, commentsRes, likesRes, savesRes, reordersRes, followsRes, followersRes, blocksRes, notifsRes] =
      await Promise.all([
        supabase
          .from('profiles')
          .select('*, followers:follows!follows_following_id_fkey(count), following:follows!follows_follower_id_fkey(count)'),
        supabase.from('restaurants').select('*'),
        supabase.from('orders').select('*, likes(count), comments(count), reorders(count)').order('created_at', { ascending: false }),
        supabase.from('comments').select('*').order('created_at', { ascending: true }),
        supabase.from('likes').select('order_id').eq('user_id', uid),
        supabase.from('saves').select('order_id').eq('user_id', uid),
        supabase.from('reorders').select('order_id').eq('user_id', uid),
        supabase.from('follows').select('following_id').eq('follower_id', uid),
        supabase.from('follows').select('follower_id').eq('following_id', uid),
        supabase.from('blocks').select('blocked_id').eq('blocker_id', uid),
        supabase.from('notifications').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      ]);

    setProfileMap(Object.fromEntries((profilesRes.data ?? []).map((r) => [r.id, mapProfile(r)])));
    setRestaurantMap(Object.fromEntries((restaurantsRes.data ?? []).map((r) => [r.id, mapRestaurant(r)])));
    setOrders((ordersRes.data ?? []).map(mapOrder));
    setComments((commentsRes.data ?? []).map(mapComment));
    setLiked(new Set((likesRes.data ?? []).map((r) => r.order_id)));
    setSaved(new Set((savesRes.data ?? []).map((r) => r.order_id)));
    setReordered(new Set((reordersRes.data ?? []).map((r) => r.order_id)));
    setFollowing(new Set((followsRes.data ?? []).map((r) => r.following_id)));
    setFollowers(new Set((followersRes.data ?? []).map((r) => r.follower_id)));
    setBlocked(new Set((blocksRes.data ?? []).map((r) => r.blocked_id)));
    setNotifications((notifsRes.data ?? []).map(mapNotification));
    setCurrentUserId(uid);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!live) {
      seedFromMock();
      return;
    }
    if (userId) loadFromSupabase(userId).catch((e) => {
      if (__DEV__) console.warn('[Plated] data load failed', e);
      setLoading(false);
    });
  }, [live, userId, seedFromMock, loadFromSupabase]);

  const refresh = useCallback(() => {
    if (live && userId) loadFromSupabase(userId).catch(() => {});
  }, [live, userId, loadFromSupabase]);

  // ── Lookups ────────────────────────────────────────────────────────────────
  const userFor = useCallback(
    (id: string): User => profileMap[id] ?? (live ? FALLBACK_USER : getMockUser(id)),
    [profileMap, live],
  );
  const restaurantFor = useCallback(
    (id: string): Restaurant | undefined => restaurantMap[id] ?? (live ? undefined : getMockRestaurant(id)),
    [restaurantMap, live],
  );
  const currentUser = userFor(currentUserId);

  // ── Visible orders (filter blocked authors) ─────────────────────────────────
  const visibleOrders = useMemo(() => orders.filter((o) => !blocked.has(o.userId)), [orders, blocked]);

  const feedOrders = useCallback(
    () => [...visibleOrders].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [visibleOrders],
  );
  const verifiedCreatorOrders = useCallback(
    () => feedOrders().filter((o) => userFor(o.userId).verified),
    [feedOrders, userFor],
  );
  const ordersByRestaurant = useCallback(
    (rid: string) => visibleOrders.filter((o) => o.restaurantId === rid).sort((a, b) => b.rating - a.rating),
    [visibleOrders],
  );
  const ordersByUser = useCallback(
    (uid: string) => orders.filter((o) => o.userId === uid).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [orders],
  );
  const ratingsByUser = ordersByUser;

  const restaurantWithRating = useCallback(
    (rid: string): RestaurantWithRating | undefined => {
      const r = restaurantFor(rid);
      if (!r) return undefined;
      const { rating, count } = platedRatingFor(orders, rid);
      return { ...r, platedRating: rating, orderCount: count };
    },
    [restaurantFor, orders],
  );
  const topRestaurants = useCallback(
    () =>
      Object.values(restaurantMap)
        .map((r) => {
          const { rating, count } = platedRatingFor(orders, r.id);
          return { ...r, platedRating: rating, orderCount: count };
        })
        .filter((r) => r.orderCount > 0)
        .sort((a, b) => b.platedRating - a.platedRating),
    [restaurantMap, orders],
  );
  const topPlates = useCallback(() => [...visibleOrders].sort((a, b) => b.rating - a.rating).slice(0, 10), [visibleOrders]);
  const topCreators = useCallback(
    () => Object.values(profileMap).filter((u) => u.id !== currentUserId && !blocked.has(u.id)).sort((a, b) => b.followers - a.followers),
    [profileMap, currentUserId, blocked],
  );
  // People lists for the People tab (resolve id sets → users, drop blocked/self).
  const followingUsers = useCallback(
    () => [...following].filter((id) => id !== currentUserId && !blocked.has(id)).map(userFor),
    [following, currentUserId, blocked, userFor],
  );
  const followerUsers = useCallback(
    () => [...followers].filter((id) => id !== currentUserId && !blocked.has(id)).map(userFor),
    [followers, currentUserId, blocked, userFor],
  );
  // Suggested = top creators you don't already follow.
  const suggestedUsers = useCallback(
    () => topCreators().filter((u) => !following.has(u.id)),
    [topCreators, following],
  );
  const exploreOrders = useCallback(
    (filter: string) => {
      const base = feedOrders();
      if (filter === 'Top Rated') return [...base].sort((a, b) => b.rating - a.rating);
      if (filter === 'Most Reordered') return [...base].sort((a, b) => (b.reorders ?? 0) - (a.reorders ?? 0));
      if (filter === 'All') return base;
      return base.filter((o) => o.tags.includes(filter));
    },
    [feedOrders],
  );
  const searchRestaurants = useCallback(
    (query: string) => {
      const q = query.trim().toLowerCase();
      const all = Object.values(restaurantMap);
      if (!q) return all;
      return all.filter((r) => r.name.toLowerCase().includes(q) || r.cuisine.toLowerCase().includes(q));
    },
    [restaurantMap],
  );

  // ── Interactions (optimistic state update + background Supabase write) ──────
  const adjustOrderCount = (id: string, field: 'likes' | 'comments' | 'reorders', delta: number) =>
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, [field]: Math.max(0, (o[field] ?? 0) + delta) } : o)));

  const isLiked = useCallback((id: string) => liked.has(id), [liked]);
  const toggleLike = useCallback(
    (id: string) => {
      const on = !liked.has(id);
      setLiked((p) => { const n = new Set(p); on ? n.add(id) : n.delete(id); return n; });
      adjustOrderCount(id, 'likes', on ? 1 : -1);
      if (live && userId) {
        if (on) supabase.from('likes').insert({ order_id: id, user_id: userId }).then(() => {});
        else supabase.from('likes').delete().eq('order_id', id).eq('user_id', userId).then(() => {});
      }
    },
    [liked, live, userId],
  );

  const isSaved = useCallback((id: string) => saved.has(id), [saved]);
  const toggleSave = useCallback(
    (id: string) => {
      const on = !saved.has(id);
      setSaved((p) => { const n = new Set(p); on ? n.add(id) : n.delete(id); return n; });
      if (live && userId) {
        if (on) supabase.from('saves').insert({ order_id: id, user_id: userId }).then(() => {});
        else supabase.from('saves').delete().eq('order_id', id).eq('user_id', userId).then(() => {});
      }
    },
    [saved, live, userId],
  );

  const isFollowing = useCallback((id: string) => following.has(id), [following]);
  const toggleFollow = useCallback(
    (id: string) => {
      const on = !following.has(id);
      setFollowing((p) => { const n = new Set(p); on ? n.add(id) : n.delete(id); return n; });
      if (live && userId) {
        if (on) supabase.from('follows').insert({ follower_id: userId, following_id: id }).then(() => {});
        else supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', id).then(() => {});
      }
    },
    [following, live, userId],
  );

  const hasReordered = useCallback((id: string) => reordered.has(id), [reordered]);
  const markReordered = useCallback(
    (id: string) => {
      if (reordered.has(id)) return;
      setReordered((p) => new Set(p).add(id));
      adjustOrderCount(id, 'reorders', 1);
      if (live && userId) supabase.from('reorders').insert({ order_id: id, user_id: userId }).then(() => {});
    },
    [reordered, live, userId],
  );

  const commentsFor = useCallback(
    (orderId: string) => comments.filter((c) => c.orderId === orderId && !blocked.has(c.userId)).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    [comments, blocked],
  );
  const addComment = useCallback(
    (orderId: string, text: string) => {
      const tempId = `c${Date.now()}`;
      const optimistic: Comment = { id: tempId, orderId, userId: currentUserId, text, createdAt: new Date().toISOString() };
      setComments((p) => [...p, optimistic]);
      adjustOrderCount(orderId, 'comments', 1);
      if (live && userId) {
        supabase.from('comments').insert({ order_id: orderId, user_id: userId, text }).select().single().then(({ data }) => {
          if (data) setComments((p) => p.map((c) => (c.id === tempId ? mapComment(data) : c)));
        });
      }
    },
    [currentUserId, live, userId],
  );

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const markAllNotificationsRead = useCallback(() => {
    setNotifications((p) => p.map((n) => ({ ...n, read: true })));
    if (live && userId) supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false).then(() => {});
  }, [live, userId]);

  const reportContent = useCallback(
    (targetType: ReportTarget, targetId: string, reason: ReportReason, details?: string) => {
      if (live && userId)
        supabase.from('reports').insert({ reporter_id: userId, target_type: targetType, target_id: targetId, reason, details }).then(() => {});
    },
    [live, userId],
  );

  const isBlocked = useCallback((id: string) => blocked.has(id), [blocked]);
  const blockUser = useCallback(
    (id: string) => {
      setBlocked((p) => new Set(p).add(id));
      setFollowing((p) => { const n = new Set(p); n.delete(id); return n; });
      if (live && userId) {
        supabase.from('blocks').insert({ blocker_id: userId, blocked_id: id }).then(() => {});
        supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', id).then(() => {});
      }
    },
    [live, userId],
  );
  const unblockUser = useCallback(
    (id: string) => {
      setBlocked((p) => { const n = new Set(p); n.delete(id); return n; });
      if (live && userId) supabase.from('blocks').delete().eq('blocker_id', userId).eq('blocked_id', id).then(() => {});
    },
    [live, userId],
  );
  const blockedUsers = useCallback(() => [...blocked].map((id) => userFor(id)), [blocked, userFor]);

  // ── Create a plate ──────────────────────────────────────────────────────────
  const addOrder = useCallback(
    async (input: NewOrderInput): Promise<Order | null> => {
      if (!live || !userId) {
        // mock mode
        const order: Order = {
          id: makeOrderId(),
          userId: currentUserId,
          restaurantId: input.restaurantId ?? 'r1',
          dishName: input.dishName,
          photo: input.photo,
          description: input.description,
          rating: input.rating,
          likes: 0,
          comments: 0,
          createdAt: new Date().toISOString(),
          tags: input.tags ?? [],
          reorders: 0,
        };
        setOrders((p) => [order, ...p]);
        return order;
      }

      // resolve restaurant id — upsert the Foursquare place if needed
      let restaurantId = input.restaurantId;
      if (!restaurantId && input.place) {
        const p = input.place;
        const existing = await supabase.from('restaurants').select('id').eq('fsq_id', p.fsqId).maybeSingle();
        if (existing.data?.id) restaurantId = existing.data.id;
        else {
          const ins = await supabase
            .from('restaurants')
            .insert({ fsq_id: p.fsqId, name: p.name, cuisine: p.cuisine, location: p.location, lat: p.lat, lng: p.lng, price_level: p.priceLevel })
            .select('id')
            .single();
          restaurantId = ins.data?.id;
          if (ins.data) setRestaurantMap((m) => ({ ...m, [ins.data.id]: mapRestaurant({ ...ins.data, name: p.name, cuisine: p.cuisine, location: p.location, price_level: p.priceLevel }) }));
        }
      }
      if (!restaurantId) return null;

      const { data, error } = await supabase
        .from('orders')
        .insert({
          user_id: userId,
          restaurant_id: restaurantId,
          dish_name: input.dishName,
          photo_url: input.photo,
          description: input.description,
          rating: input.rating,
          tags: input.tags ?? [],
        })
        .select('*, likes(count), comments(count), reorders(count)')
        .single();
      if (error || !data) {
        if (__DEV__) console.warn('[Plated] addOrder failed', error);
        return null;
      }
      const order = mapOrder(data);
      setOrders((p) => [order, ...p]);
      return order;
    },
    [live, userId, currentUserId],
  );

  const updateProfile = useCallback(
    (patch: Partial<User>) => {
      setProfileMap((m) => ({ ...m, [currentUserId]: { ...m[currentUserId], ...patch } as User }));
      if (live && userId) {
        const row: Record<string, unknown> = {};
        if (patch.name !== undefined) row.name = patch.name;
        if (patch.bio !== undefined) row.bio = patch.bio;
        if (patch.socials !== undefined) row.socials = patch.socials;
        if (patch.avatar !== undefined) row.avatar_url = patch.avatar;
        if (Object.keys(row).length) supabase.from('profiles').update(row).eq('id', userId).then(() => {});
      }
    },
    [currentUserId, live, userId],
  );

  const value = useMemo<DataContextValue>(
    () => ({
      orders,
      restaurants: Object.values(restaurantMap),
      contacts: CONTACTS,
      currentUser,
      loading,
      refresh,
      userFor,
      restaurantFor,
      feedOrders,
      verifiedCreatorOrders,
      ordersByRestaurant,
      ordersByUser,
      ratingsByUser,
      restaurantWithRating,
      topRestaurants,
      topPlates,
      topCreators,
      followingUsers,
      followerUsers,
      suggestedUsers,
      exploreOrders,
      searchRestaurants,
      isLiked,
      toggleLike,
      isSaved,
      toggleSave,
      isFollowing,
      toggleFollow,
      hasReordered,
      markReordered,
      commentsFor,
      addComment,
      notifications,
      unreadCount,
      markAllNotificationsRead,
      reportContent,
      isBlocked,
      blockUser,
      unblockUser,
      blockedUsers,
      addOrder,
      updateProfile,
    }),
    [orders, restaurantMap, currentUser, loading, refresh, userFor, restaurantFor, feedOrders, verifiedCreatorOrders, ordersByRestaurant, ordersByUser, ratingsByUser, restaurantWithRating, topRestaurants, topPlates, topCreators, followingUsers, followerUsers, suggestedUsers, exploreOrders, searchRestaurants, isLiked, toggleLike, isSaved, toggleSave, isFollowing, toggleFollow, hasReordered, markReordered, commentsFor, addComment, notifications, unreadCount, markAllNotificationsRead, reportContent, isBlocked, blockUser, unblockUser, blockedUsers, addOrder, updateProfile],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

/** Used only in live mode when a referenced profile somehow isn't loaded. */
const FALLBACK_USER: User = {
  id: 'unknown',
  name: 'Plated Guest',
  handle: 'guest',
  avatar: foodPhoto(0),
  bio: '',
  verified: false,
  followers: 0,
  following: 0,
  friends: 0,
  socials: {},
  compensationEligible: false,
  estimatedEarnings: 0,
};

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within a DataProvider');
  return ctx;
}
