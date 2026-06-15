import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { CONTACTS } from '@/data/contacts';
import { makeOrderId, ORDERS, REORDER_SEEDS } from '@/data/orders';
import { getRestaurant, RESTAURANTS } from '@/data/restaurants';
import { COMMENTS, NOTIFICATIONS } from '@/data/social';
import {
  AppNotification,
  Comment,
  Contact,
  ContentReport,
  Order,
  ReportReason,
  ReportTarget,
  Restaurant,
  User,
} from '@/data/types';
import { CURRENT_USER_ID, getUser, USERS } from '@/data/users';

export interface RestaurantWithRating extends Restaurant {
  /** Cumulative "Plated's Rating" — average of all its orders' ratings. */
  platedRating: number;
  orderCount: number;
}

export interface NewOrderInput {
  restaurantId: string;
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
  exploreOrders: (filter: string) => Order[];
  searchRestaurants: (query: string) => Restaurant[];

  // interactions
  isLiked: (orderId: string) => boolean;
  toggleLike: (orderId: string) => void;
  isSaved: (orderId: string) => boolean;
  toggleSave: (orderId: string) => void;
  isFollowing: (userId: string) => boolean;
  toggleFollow: (userId: string) => void;

  // reorder signal — the highest-praise action
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
  addOrder: (input: NewOrderInput) => Order;
  updateProfile: (patch: Partial<User>) => void;

  /**
   * Resolve a user for display. Returns the LIVE currentUser for the
   * signed-in id so profile edits propagate to feed cards immediately.
   */
  userFor: (id: string) => User;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

function platedRatingFor(orders: Order[], restaurantId: string): { rating: number; count: number } {
  const list = orders.filter((o) => o.restaurantId === restaurantId);
  if (list.length === 0) return { rating: 0, count: 0 };
  const avg = list.reduce((sum, o) => sum + o.rating, 0) / list.length;
  return { rating: Math.round(avg * 10) / 10, count: list.length };
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [orders, setOrders] = useState<Order[]>(() =>
    ORDERS.map((o) => ({ ...o, reorders: REORDER_SEEDS[o.id] ?? 0 })),
  );
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [reordered, setReordered] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState<Set<string>>(
    () => new Set(['u1', 'u3']), // pre-follow a couple of creators
  );
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Comment[]>(COMMENTS);
  const [notifications, setNotifications] = useState<AppNotification[]>(NOTIFICATIONS);
  const [, setReports] = useState<ContentReport[]>([]);
  const [currentUser, setCurrentUser] = useState<User>(() => ({
    ...getUser(CURRENT_USER_ID),
  }));

  /** Orders from non-blocked users, the base for every public surface. */
  const visibleOrders = useMemo(
    () => orders.filter((o) => !blocked.has(o.userId)),
    [orders, blocked],
  );

  const feedOrders = useCallback(
    () => [...visibleOrders].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [visibleOrders],
  );

  const verifiedCreatorOrders = useCallback(
    () => feedOrders().filter((o) => getUser(o.userId).verified),
    [feedOrders],
  );

  const ordersByRestaurant = useCallback(
    (restaurantId: string) =>
      visibleOrders
        .filter((o) => o.restaurantId === restaurantId)
        .sort((a, b) => b.rating - a.rating),
    [visibleOrders],
  );

  const ordersByUser = useCallback(
    (userId: string) =>
      orders
        .filter((o) => o.userId === userId)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [orders],
  );

  const ratingsByUser = ordersByUser; // same data, presented as a list elsewhere

  const restaurantWithRating = useCallback(
    (restaurantId: string): RestaurantWithRating | undefined => {
      const r = getRestaurant(restaurantId);
      if (!r) return undefined;
      const { rating, count } = platedRatingFor(visibleOrders, restaurantId);
      return { ...r, platedRating: rating, orderCount: count };
    },
    [visibleOrders],
  );

  const topRestaurants = useCallback(
    () =>
      RESTAURANTS.map((r) => {
        const { rating, count } = platedRatingFor(visibleOrders, r.id);
        return { ...r, platedRating: rating, orderCount: count };
      })
        .filter((r) => r.orderCount > 0)
        .sort((a, b) => b.platedRating - a.platedRating),
    [visibleOrders],
  );

  const topPlates = useCallback(
    () => [...visibleOrders].sort((a, b) => b.rating - a.rating).slice(0, 10),
    [visibleOrders],
  );

  const topCreators = useCallback(
    () =>
      USERS.filter((u) => u.id !== CURRENT_USER_ID && !blocked.has(u.id)).sort(
        (a, b) => b.followers - a.followers,
      ),
    [blocked],
  );

  const exploreOrders = useCallback(
    (filter: string) => {
      const base = feedOrders();
      if (filter === 'Top Rated') return [...base].sort((a, b) => b.rating - a.rating);
      if (filter === 'Most Reordered')
        return [...base].sort((a, b) => (b.reorders ?? 0) - (a.reorders ?? 0));
      if (filter === 'All') return base;
      return base.filter((o) => o.tags.includes(filter));
    },
    [feedOrders],
  );

  const searchRestaurants = useCallback((query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return RESTAURANTS;
    return RESTAURANTS.filter(
      (r) => r.name.toLowerCase().includes(q) || r.cuisine.toLowerCase().includes(q),
    );
  }, []);

  const isLiked = useCallback((id: string) => liked.has(id), [liked]);
  const toggleLike = useCallback((id: string) => {
    setLiked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const isSaved = useCallback((id: string) => saved.has(id), [saved]);
  const toggleSave = useCallback((id: string) => {
    setSaved((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const isFollowing = useCallback((id: string) => following.has(id), [following]);
  const toggleFollow = useCallback((id: string) => {
    setFollowing((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const hasReordered = useCallback((id: string) => reordered.has(id), [reordered]);
  const markReordered = useCallback(
    (id: string) => {
      // Idempotent: repeat provider picks on the same plate don't inflate the count.
      if (reordered.has(id)) return;
      setReordered((prev) => new Set(prev).add(id));
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, reorders: (o.reorders ?? 0) + 1 } : o)),
      );
    },
    [reordered],
  );

  const commentsFor = useCallback(
    (orderId: string) =>
      comments
        .filter((c) => c.orderId === orderId && !blocked.has(c.userId))
        .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    [comments, blocked],
  );

  const addComment = useCallback((orderId: string, text: string) => {
    const comment: Comment = {
      id: `c${Date.now()}`,
      orderId,
      userId: CURRENT_USER_ID,
      text,
      createdAt: new Date().toISOString(),
    };
    setComments((prev) => [...prev, comment]);
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, comments: o.comments + 1 } : o)),
    );
  }, []);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const reportContent = useCallback(
    (targetType: ReportTarget, targetId: string, reason: ReportReason, details?: string) => {
      const report: ContentReport = {
        id: `r${Date.now()}`,
        targetType,
        targetId,
        reason,
        details,
        createdAt: new Date().toISOString(),
      };
      // Mock: persisted locally; production forwards to a moderation queue
      // with a 24h review SLA (App Review expects this to visibly work).
      setReports((prev) => [...prev, report]);
    },
    [],
  );

  const isBlocked = useCallback((userId: string) => blocked.has(userId), [blocked]);
  const blockUser = useCallback((userId: string) => {
    setBlocked((prev) => new Set(prev).add(userId));
    setFollowing((prev) => {
      if (!prev.has(userId)) return prev;
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
  }, []);
  const unblockUser = useCallback((userId: string) => {
    setBlocked((prev) => {
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
  }, []);
  const blockedUsers = useCallback(() => [...blocked].map((id) => getUser(id)), [blocked]);

  const addOrder = useCallback((input: NewOrderInput): Order => {
    const order: Order = {
      id: makeOrderId(),
      userId: CURRENT_USER_ID,
      restaurantId: input.restaurantId,
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
    setOrders((prev) => [order, ...prev]);
    return order;
  }, []);

  const updateProfile = useCallback((patch: Partial<User>) => {
    setCurrentUser((prev) => ({ ...prev, ...patch }));
  }, []);

  const userFor = useCallback(
    (id: string) => (id === CURRENT_USER_ID ? currentUser : getUser(id)),
    [currentUser],
  );

  const value = useMemo<DataContextValue>(
    () => ({
      orders,
      restaurants: RESTAURANTS,
      contacts: CONTACTS,
      currentUser,
      feedOrders,
      verifiedCreatorOrders,
      ordersByRestaurant,
      ordersByUser,
      ratingsByUser,
      restaurantWithRating,
      topRestaurants,
      topPlates,
      topCreators,
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
      userFor,
    }),
    [
      orders,
      currentUser,
      feedOrders,
      verifiedCreatorOrders,
      ordersByRestaurant,
      ordersByUser,
      ratingsByUser,
      restaurantWithRating,
      topRestaurants,
      topPlates,
      topCreators,
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
      userFor,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within a DataProvider');
  return ctx;
}
