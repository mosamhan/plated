import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { CONTACTS } from '@/data/contacts';
import { foodPhoto } from '@/data/images';
import { updateSavedAccountProfile } from '@/lib/accountStore';
import { plateRatings } from '@/lib/post';
import { OFFERS } from '@/data/offers';
import { makeOrderId, ORDERS, REORDER_SEEDS } from '@/data/orders';
import { placeTypeFor, type PlaceType } from '@/lib/placeType';
import { rankWithDistance, scoreTextMatch } from '@/lib/search';
import { getRestaurant as getMockRestaurant, RESTAURANTS } from '@/data/restaurants';
import { COMMENTS, NOTIFICATIONS } from '@/data/social';
import { FEED_BUMPS, SPONSORED_PLACEMENTS } from '@/data/sponsored';
import {
  AppNotification,
  Comment,
  Contact,
  FeedBump,
  Order,
  PlateAttribution,
  PostMedia,
  ReportReason,
  ReportTarget,
  Restaurant,
  RestaurantClaimInput,
  RestaurantOffer,
  RestaurantRequestInput,
  SponsoredPlacement,
  User,
} from '@/data/types';
import { CURRENT_USER_ID, getUser as getMockUser, USERS } from '@/data/users';
import { PlaceResult } from '@/lib/places';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/store/AuthContext';
import { useLocation } from '@/store/LocationContext';
import { mapAttributions, mapComment, mapFeedBump, mapNotification, mapOffer, mapOrder, mapProfile, mapRestaurant, mapSponsoredPlacement } from '@/store/mappers';

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
  /**
   * Every menu item on this order (name + its own rating). The headline dish
   * is the highest-rated of these; if omitted, falls back to the single
   * dishName/rating (legacy single-dish post).
   */
  items?: { name: string; rating: number }[];
  /**
   * The post's carousel — a photo/clip per plate with its own name+rating.
   * When present, the headline photo/dish/rating are derived from the
   * best-rated entry, and `media` is stored whole on the order.
   */
  media?: PostMedia[];
  /** More-options at create time. */
  commentsDisabled?: boolean;
  hideLikeCount?: boolean;
}

interface DataContextValue {
  orders: Order[];
  restaurants: Restaurant[];
  contacts: Contact[];
  currentUser: User;
  loading: boolean;
  refresh: () => void;
  /** Fetches the next page of plates — call as the feed nears the end of what's loaded. */
  loadMoreOrders: () => void;

  // lookups (route all user/restaurant resolution through these)
  userFor: (id: string) => User;
  /**
   * Pull profiles the initial load didn't include. Anyone who joined (or first
   * interacted with you) after boot isn't in `profileMap`, and without this they
   * render as the fallback "Plated Guest" — which is what a message from a new
   * account looked like.
   */
  ensureProfiles: (ids: string[]) => void;
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
  /** Every restaurant the current user has personally rated, ranked by their own average there. */
  myRestaurantRankings: () => RestaurantWithRating[];
  /** Every plate the current user has personally rated, best first. */
  myPlateRankings: () => Order[];
  topCreators: () => User[];
  followingUsers: () => User[];
  followerUsers: () => User[];
  suggestedUsers: () => User[];
  /** Mutual follows — you follow them and they follow you back. */
  friendUsers: () => User[];
  exploreOrders: (filter: string) => Order[];
  searchRestaurants: (query: string) => Restaurant[];
  /** Crowd-sourced menu: distinct dish names posted at a restaurant. */
  menuForRestaurant: (restaurantId: string) => string[];
  /** Aggregated menu: each dish + its community avg rating and post count. */
  restaurantMenu: (restaurantId: string) => { name: string; rating: number; count: number }[];

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
  addComment: (orderId: string, text: string, imageUrl?: string) => void;
  /** Author only — the row's own RLS policy is what actually enforces that. */
  deleteComment: (commentId: string, orderId: string) => void;

  // notifications
  notifications: AppNotification[];
  unreadCount: number;
  markAllNotificationsRead: () => void;
  /**
   * Re-read just the notifications. They're written by database triggers
   * (0011, 0025), so the client never learns about a new one from its own
   * writes — without this the screen shows whatever existed at app launch.
   */
  refreshNotifications: () => void;

  // creator earnings — one row per plate, real once compensation_eligible and
  // an affiliate network is wired up; empty otherwise (creator.tsx falls back
  // to a clearly-labeled preview for ineligible/mock accounts).
  attributions: PlateAttribution[];
  /** Re-read earnings after a payout — they aren't pushed to the client on their own. */
  refreshAttributions: () => void;

  // restaurant offers
  offersForRestaurant: (restaurantId: string) => RestaurantOffer[];
  offerFor: (id: string) => RestaurantOffer | undefined;
  isOfferRedeemed: (offerId: string) => boolean;
  /** Records the one-time redemption (RLS + a unique index enforce "once"). */
  redeemOffer: (offerId: string) => void;
  /** Live, unexpired offers — nearby-first when location is known. For the Discover "Exclusive Deals" rail. */
  activeOffers: () => RestaurantOffer[];
  /** Most recent ratings across the app, pure recency (not personalization-ranked). For the Discover "Activity" rail. */
  recentActivity: (limit?: number) => Order[];
  /** Every plate/dish whose name matches `query`, ranked nearby-first. For the multi-entity search screen. */
  searchPlates: (query: string) => Order[];
  /** Users whose name or handle matches `query`. For the multi-entity search screen. */
  searchUsers: (query: string) => User[];

  // restaurant subscriptions — feed bumps and paid placements
  /** Orders currently pinned to the top of nearby feeds, not yet expired. */
  bumpedOrderIds: Set<string>;
  /** Live placements for one surface — reel ads, sponsored map pins, or the Local Favorites rail. */
  placementsFor: (type: SponsoredPlacement['placementType']) => SponsoredPlacement[];

  // restaurant claiming — see 0032_restaurant_claims.sql
  /** Restaurants the signed-in user is an approved owner/manager of. */
  ownedRestaurantIds: Set<string>;
  /** Files a claim request; an admin reviews and approves it manually. */
  submitRestaurantClaim: (input: RestaurantClaimInput) => Promise<boolean>;
  /** "We couldn't find it" from onboarding's find-restaurant detour — no restaurant_id yet, unlike a claim. */
  submitRestaurantRequest: (input: RestaurantRequestInput) => Promise<boolean>;

  // trust & safety
  reportContent: (targetType: ReportTarget, targetId: string, reason: ReportReason, details?: string) => void;
  isBlocked: (userId: string) => boolean;
  blockUser: (userId: string) => void;
  unblockUser: (userId: string) => void;
  blockedUsers: () => User[];

  // mutations
  addOrder: (input: NewOrderInput) => Promise<Order | null>;
  /** Delete one of your own posts. */
  deleteOrder: (orderId: string) => void;
  /** Change who can see your post. */
  setOrderVisibility: (orderId: string, visibility: 'public' | 'friends' | 'private') => void;
  /** Archive/unarchive your post — hidden from everyone but you when archived. */
  setOrderArchived: (orderId: string, archived: boolean) => void;
  /** Upsert a searched Foursquare place → its restaurant id (for the detail sheet). */
  ensureRestaurant: (place: PlaceResult) => Promise<string | undefined>;
  updateProfile: (patch: Partial<User>) => void;
  /** Owner-only edits to a restaurant's own page — see 0042. Resolves false if the write was rejected. */
  updateRestaurantPage: (restaurantId: string, patch: RestaurantPagePatch) => Promise<boolean>;
}

/**
 * The subset of a restaurant an owner may edit. Mirrors exactly the columns
 * 0042_restaurant_page_customization.sql grants column-level UPDATE on —
 * anything outside this set is Plated's or the community's to set, not the
 * restaurant's.
 */
export interface RestaurantPagePatch {
  /** Display name override. Empty string clears it back to the imported name. */
  customName?: string;
  /** Owner-uploaded photos; the first is the listing's hero image. */
  photos?: string[];
  orderMode?: Restaurant['orderMode'];
  reservationPlatform?: Restaurant['reservationPlatform'];
  reservationUrl?: string;
  externalOrderUrl?: string;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

const ORDERS_SELECT =
  '*, likes(count), comments(count), reorders(count), order_items(name, rating, position), collaborators:post_collaborators(user_id, status)';

// The feed used to fetch every plate ever posted on every cold start — fine
// at demo scale, a real cost once there's enough content that "everything"
// stops being a small number. Paged instead; `loadMoreOrders` pulls the next
// page as the feed nears the end of what's loaded.
const ORDER_PAGE_SIZE = 30;

function platedRatingFor(orders: Order[], restaurantId: string) {
  // Every plate counts, not every post: a post with five dishes contributes
  // five ratings to the restaurant's average, which is what "average of all
  // the plates rated here" means. `plateRatings` expands each post's media
  // (or its single legacy photo) into individual dish ratings.
  const ratings = orders
    .filter((o) => o.restaurantId === restaurantId)
    .flatMap((o) => plateRatings(o).map((p) => p.rating));
  if (ratings.length === 0) return { rating: 0, count: 0 };
  const avg = ratings.reduce((s, r) => s + r, 0) / ratings.length;
  return { rating: Math.round(avg * 10) / 10, count: ratings.length };
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { userId, refreshAccounts } = useAuth();
  const { location } = useLocation();
  const locationZip = location.zip;
  const live = isSupabaseConfigured;

  const [orders, setOrders] = useState<Order[]>([]);
  const [orderOffset, setOrderOffset] = useState(0);
  const [hasMoreOrders, setHasMoreOrders] = useState(true);
  const [loadingMoreOrders, setLoadingMoreOrders] = useState(false);
  // Which load-page each order came from — lets `feedOrders` rank *within*
  // a page by personalization/recency without ever letting a later-loaded
  // (older) page outrank an earlier one. Without this, appending a page of
  // older orders during infinite scroll could re-sort content already on
  // screen out from under the viewer, since personalization scoring is
  // recomputed over the whole set on every call. A ref, not state — it's
  // bookkeeping for feedOrders' sort, not something that itself needs to
  // trigger a render (the orders/visibleOrders state change already does).
  const orderPageOf = useRef<Map<string, number>>(new Map());
  const nextOrderPage = useRef(0);
  const [profileMap, setProfileMap] = useState<Record<string, User>>({});
  const [restaurantMap, setRestaurantMap] = useState<Record<string, Restaurant>>({});
  const [comments, setComments] = useState<Comment[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [attributions, setAttributions] = useState<PlateAttribution[]>([]);
  const [offers, setOffers] = useState<RestaurantOffer[]>([]);
  const [redeemedOfferIds, setRedeemedOfferIds] = useState<Set<string>>(new Set());
  const [feedBumps, setFeedBumps] = useState<FeedBump[]>([]);
  const [sponsoredPlacements, setSponsoredPlacements] = useState<SponsoredPlacement[]>([]);
  const [ownedRestaurantIds, setOwnedRestaurantIds] = useState<Set<string>>(new Set());
  const [recentSearchPlaceTypes, setRecentSearchPlaceTypes] = useState<Set<PlaceType>>(new Set());
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
    // No real ledger in mock mode — creator.tsx shows PREVIEW_ATTRIBUTIONS
    // regardless, same as it always has.
    setAttributions([]);
    setOffers(OFFERS);
    setRedeemedOfferIds(new Set());
    setFeedBumps(FEED_BUMPS);
    setSponsoredPlacements(SPONSORED_PLACEMENTS);
    // No restaurant-owner concept in mock mode — nobody has claimed anything.
    setOwnedRestaurantIds(new Set());
    setFollowing(new Set(['u1', 'u3']));
    // Mock followers: a couple of users "follow" you so the People tab isn't empty.
    setFollowers(new Set(['u2', 'u4', 'u5']));
    setCurrentUserId(CURRENT_USER_ID);
    setLoading(false);
  }, []);

  // ── Load everything from Supabase ──────────────────────────────────────────
  const loadFromSupabase = useCallback(async (uid: string) => {
    setLoading(true);
    const [profilesRes, restaurantsRes, ordersRes, commentsRes, likesRes, savesRes, reordersRes, followsRes, followersRes, blocksRes, notifsRes, earningsRes, offersRes, redemptionsRes, feedBumpsRes, placementsRes, ownersRes, searchQueriesRes] =
      await Promise.all([
        supabase
          .from('profiles')
          .select('*, followers:follows!follows_following_id_fkey(count), following:follows!follows_follower_id_fkey(count)'),
        supabase.from('restaurants').select('*'),
        supabase
          .from('orders')
          .select(ORDERS_SELECT)
          .order('created_at', { ascending: false })
          .range(0, ORDER_PAGE_SIZE - 1),
        supabase.from('comments').select('*').order('created_at', { ascending: true }),
        supabase.from('likes').select('order_id').eq('user_id', uid),
        supabase.from('saves').select('order_id').eq('user_id', uid),
        supabase.from('reorders').select('order_id').eq('user_id', uid),
        supabase.from('follows').select('following_id').eq('follower_id', uid),
        supabase.from('follows').select('follower_id').eq('following_id', uid),
        supabase.from('blocks').select('blocked_id').eq('blocker_id', uid),
        supabase.from('notifications').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
        supabase.from('creator_earnings').select('order_id, amount_cents, status').eq('creator_id', uid),
        supabase.from('restaurant_offers').select('*'),
        supabase.from('offer_redemptions').select('offer_id').eq('user_id', uid),
        // RLS admits any row here (there's no restaurant-owner login to scope
        // to), so the expiry itself is filtered here rather than trusting the
        // policy to have done it.
        supabase.from('restaurant_feed_bumps').select('order_id, expires_at').gt('expires_at', new Date().toISOString()),
        supabase.from('sponsored_placements').select('*'),
        supabase.from('restaurant_owners').select('restaurant_id').eq('user_id', uid),
        // Recent search-intent signal for feed personalization (0044/D3) — the
        // last 30 is plenty to derive "what cuisines has this person been
        // looking for lately" without needing a time-window query.
        supabase
          .from('search_queries')
          .select('matched_place_type')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

    setProfileMap(Object.fromEntries((profilesRes.data ?? []).map((r) => [r.id, mapProfile(r)])));
    setRestaurantMap(Object.fromEntries((restaurantsRes.data ?? []).map((r) => [r.id, mapRestaurant(r)])));
    const firstOrderPage = ordersRes.data ?? [];
    orderPageOf.current = new Map(firstOrderPage.map((r) => [r.id, 0]));
    nextOrderPage.current = 1;
    setOrders(firstOrderPage.map(mapOrder));
    setOrderOffset(firstOrderPage.length);
    setHasMoreOrders(firstOrderPage.length === ORDER_PAGE_SIZE);
    setComments((commentsRes.data ?? []).map(mapComment));
    setLiked(new Set((likesRes.data ?? []).map((r) => r.order_id)));
    setSaved(new Set((savesRes.data ?? []).map((r) => r.order_id)));
    setReordered(new Set((reordersRes.data ?? []).map((r) => r.order_id)));
    setFollowing(new Set((followsRes.data ?? []).map((r) => r.following_id)));
    setFollowers(new Set((followersRes.data ?? []).map((r) => r.follower_id)));
    setBlocked(new Set((blocksRes.data ?? []).map((r) => r.blocked_id)));
    setNotifications((notifsRes.data ?? []).map(mapNotification));
    setAttributions(mapAttributions(earningsRes.data ?? []));
    setOffers((offersRes.data ?? []).map(mapOffer));
    setRedeemedOfferIds(new Set((redemptionsRes.data ?? []).map((r) => r.offer_id)));
    setFeedBumps((feedBumpsRes.data ?? []).map(mapFeedBump));
    // RLS only gates status='active'; the time window (starts_at/ends_at) is
    // this table's equivalent of the feed bumps' expiry and gets the same
    // client-side check.
    const nowIso = new Date().toISOString();
    setSponsoredPlacements(
      (placementsRes.data ?? [])
        .filter((r) => (!r.starts_at || r.starts_at <= nowIso) && (!r.ends_at || r.ends_at >= nowIso))
        .map(mapSponsoredPlacement),
    );
    setOwnedRestaurantIds(new Set((ownersRes.data ?? []).map((r) => r.restaurant_id)));
    setRecentSearchPlaceTypes(new Set((searchQueriesRes.data ?? []).map((r) => r.matched_place_type as PlaceType)));
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

  // Pulls the next page of plates as the feed nears the end of what's
  // loaded (wired to HomeContent's onEndReached). Appends only — every
  // order already fetched keeps its position, since `feedOrders` ranks
  // strictly within a page (see orderPageOf above) rather than re-sorting
  // the whole accumulated set on every call.
  const loadMoreOrders = useCallback(async () => {
    if (!live || !userId || loadingMoreOrders || !hasMoreOrders) return;
    setLoadingMoreOrders(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDERS_SELECT)
        .order('created_at', { ascending: false })
        .range(orderOffset, orderOffset + ORDER_PAGE_SIZE - 1);
      if (error || !data) {
        setHasMoreOrders(false);
        return;
      }
      const page = nextOrderPage.current++;
      for (const r of data) orderPageOf.current.set(r.id, page);
      setOrders((prev) => [...prev, ...data.map(mapOrder)]);
      setOrderOffset((o) => o + data.length);
      setHasMoreOrders(data.length === ORDER_PAGE_SIZE);
    } finally {
      setLoadingMoreOrders(false);
    }
  }, [live, userId, loadingMoreOrders, hasMoreOrders, orderOffset]);

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

  // Keeps the Account Center's rows showing a real name/handle/avatar instead
  // of just an email — reuses the profile data already loaded above rather
  // than a new query, and stays correct if the user edits their profile later.
  useEffect(() => {
    if (!live || !currentUserId) return;
    updateSavedAccountProfile(currentUserId, {
      name: currentUser.name,
      handle: currentUser.handle,
      avatar: currentUser.avatar,
    })
      .then(refreshAccounts)
      .catch(() => {});
  }, [live, currentUserId, currentUser.name, currentUser.handle, currentUser.avatar, refreshAccounts]);

  const offersForRestaurant = useCallback(
    (restaurantId: string) => offers.filter((o) => o.restaurantId === restaurantId),
    [offers],
  );
  const offerFor = useCallback((id: string) => offers.find((o) => o.id === id), [offers]);
  const isOfferRedeemed = useCallback((offerId: string) => redeemedOfferIds.has(offerId), [redeemedOfferIds]);

  const locationOrigin = location.lat != null && location.lng != null ? { lat: location.lat, lng: location.lng } : null;
  const restaurantCoords = useCallback(
    (restaurantId: string) => {
      const r = restaurantMap[restaurantId];
      return r?.lat != null && r?.lng != null ? { lat: r.lat, lng: r.lng } : undefined;
    },
    [restaurantMap],
  );

  // Live, unexpired offers, nearby-first — the Discover "Exclusive Deals" rail.
  const activeOffers = useCallback(() => {
    const nowIso = new Date().toISOString();
    const live = offers.filter((o) => o.active && (!o.expiresAt || o.expiresAt > nowIso));
    return rankWithDistance(live, {
      score: () => 0,
      coords: (o) => restaurantCoords(o.restaurantId),
      origin: locationOrigin,
    });
  }, [offers, restaurantCoords, locationOrigin]);

  // Name/handle match — search screen's People tab.
  const searchUsers = useCallback(
    (query: string) => {
      const q = query.trim();
      if (!q) return [];
      return rankWithDistance(
        Object.values(profileMap).filter((u) => u.id !== currentUserId && !blocked.has(u.id)),
        { score: (u) => scoreTextMatch(u.name, q, u.handle), rating: (u) => u.followers },
      );
    },
    [profileMap, currentUserId, blocked],
  );

  // A Set, not the raw list: every caller only ever asks "is this order
  // bumped?" (home feed) — never "which restaurant bumped it or when".
  const bumpedOrderIds = useMemo(() => new Set(feedBumps.map((b) => b.orderId)), [feedBumps]);
  // Untargeted (targetZipCodes: []) placements show everywhere — that's every
  // placement created before geo-targeting existed, and stays the default.
  // A zip-targeted one only shows once we actually know the viewer's zip;
  // an unknown zip means "don't show", not "show anyway".
  const placementsFor = useCallback(
    (type: SponsoredPlacement['placementType']) =>
      sponsoredPlacements.filter(
        (p) =>
          p.placementType === type &&
          (p.targetZipCodes.length === 0 || (!!locationZip && p.targetZipCodes.includes(locationZip))),
      ),
    [sponsoredPlacements, locationZip],
  );

  const ensureProfiles = useCallback(
    (ids: string[]) => {
      if (!live) return;
      const missing = [...new Set(ids)].filter((id) => id && !profileMap[id]);
      if (missing.length === 0) return;
      supabase
        .from('profiles')
        .select('*, followers:follows!follows_following_id_fkey(count), following:follows!follows_follower_id_fkey(count)')
        .in('id', missing)
        .then(({ data }) => {
          if (!data?.length) return;
          setProfileMap((m) => ({
            ...m,
            ...Object.fromEntries(data.map((r) => [r.id, mapProfile(r)])),
          }));
        });
    },
    [live, profileMap],
  );

  // ── Visible orders (filter blocked authors) ─────────────────────────────────
  // Feeds, rankings and restaurant aggregations run off this: blocked authors
  // out, and archived posts out. Archived rows only ever reach the client for
  // their own author (RLS), so this is what keeps an author's archived posts
  // out of their *own* feed while still letting the profile grid show them.
  // Friends/private posts are already filtered at the DB by RLS — a viewer who
  // shouldn't see one never receives it — so there's nothing to re-filter here.
  const visibleOrders = useMemo(
    () => orders.filter((o) => !blocked.has(o.userId) && !o.archived),
    [orders, blocked],
  );

  // Pure recency, not personalization-ranked — the Discover "Activity" rail
  // is meant to read as "what's happening right now," not a re-rank of the feed.
  const recentActivity = useCallback(
    (limit = 10) => [...visibleOrders].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, limit),
    [visibleOrders],
  );

  // Every plate whose dish name matches, ranked nearby-first — search screen.
  // Scores the best-matching dish on the post (headline or any other plate in
  // a multi-dish post), not just the headline — a match buried in a post's
  // third plate still ranks by how good *that* match is, not as a non-match.
  const searchPlates = useCallback(
    (query: string) => {
      const q = query.trim();
      if (!q) return [];
      // Also scored against the restaurant's own name — searching "3 Arts
      // Club" should surface what's been rated there, not just plates whose
      // dish name happens to contain the term.
      const bestScore = (o: Order) => {
        const r = restaurantFor(o.restaurantId);
        const scores = [
          scoreTextMatch(o.dishName, q),
          ...plateRatings(o).map((p) => scoreTextMatch(p.dishName, q)),
          ...(r ? [scoreTextMatch(r.name, q)] : []),
        ].filter((s) => s >= 0);
        return scores.length ? Math.min(...scores) : -1;
      };
      return rankWithDistance(visibleOrders, {
        score: bestScore,
        coords: (o) => restaurantCoords(o.restaurantId),
        rating: (o) => o.rating,
        origin: locationOrigin,
      });
    },
    [visibleOrders, restaurantFor, restaurantCoords, locationOrigin],
  );

  // Feed personalization v1 (D3) — a re-rank layer, not a replacement: still
  // chronological by default, just nudged by three real signals. A user with
  // none of them (no follows posting, no search history, nothing rated yet)
  // gets a score of 0 on every post, so the tie-break falls straight through
  // to the original recency sort — the graceful fallback the plan calls for.
  const visitedRestaurantIds = useMemo(
    () => new Set(orders.filter((o) => o.userId === currentUserId).map((o) => o.restaurantId)),
    [orders, currentUserId],
  );
  const personalizationScore = useCallback(
    (o: Order) => {
      let score = 0;
      if (following.has(o.userId)) score += 3;
      const r = restaurantMap[o.restaurantId];
      if (r && recentSearchPlaceTypes.has(placeTypeFor(r.cuisine))) score += 2;
      if (visitedRestaurantIds.has(o.restaurantId)) score += 1;
      return score;
    },
    [following, restaurantMap, recentSearchPlaceTypes, visitedRestaurantIds],
  );
  const feedOrders = useCallback(
    () =>
      [...visibleOrders].sort((a, b) => {
        // Ranks *within* a load-page, never across pages — a later (older)
        // page loaded via infinite scroll can never outrank an earlier one,
        // no matter how it scores, so appending a page never reorders
        // content already on screen. An order with no recorded page (a
        // brand-new post prepended by addOrder, not yet through a fetch)
        // defaults to page 0, which is exactly where new content belongs.
        const pageA = orderPageOf.current.get(a.id) ?? 0;
        const pageB = orderPageOf.current.get(b.id) ?? 0;
        if (pageA !== pageB) return pageA - pageB;
        const scoreDiff = personalizationScore(b) - personalizationScore(a);
        return scoreDiff !== 0 ? scoreDiff : +new Date(b.createdAt) - +new Date(a.createdAt);
      }),
    [visibleOrders, personalizationScore],
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
  // "Visited places" — same shape as topRestaurants, scoped to only the
  // orders the current user has personally rated rather than every order at
  // that restaurant. A restaurant they've never rated at just doesn't appear;
  // there's no separate check-in concept, rating a plate there is the visit.
  const myRestaurantRankings = useCallback(() => {
    const own = ordersByUser(currentUserId);
    const seen = new Set(own.map((o) => o.restaurantId));
    return Array.from(seen)
      .map((rid) => {
        const r = restaurantFor(rid);
        if (!r) return null;
        const { rating, count } = platedRatingFor(own, rid);
        return count > 0 ? { ...r, platedRating: rating, orderCount: count } : null;
      })
      .filter((r): r is RestaurantWithRating => r != null)
      .sort((a, b) => b.platedRating - a.platedRating);
  }, [ordersByUser, currentUserId, restaurantFor]);
  const myPlateRankings = useCallback(
    () => [...ordersByUser(currentUserId)].sort((a, b) => b.rating - a.rating),
    [ordersByUser, currentUserId],
  );
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
  // Friends = mutual follow — you follow them and they follow you back.
  const friendUsers = useCallback(
    () => followingUsers().filter((u) => followers.has(u.id)),
    [followingUsers, followers],
  );
  const exploreOrders = useCallback(
    (filter: string) => {
      const base = feedOrders();
      // Real signals, not a hand-picked editorial tag: a plate only counts as
      // "Trending" once it's both genuinely good (rating above 8) and getting
      // real engagement, ranked by that engagement rather than just listed.
      if (filter === 'Trending') {
        return [...base].filter((o) => o.rating > 8).sort((a, b) => b.likes + b.comments - (a.likes + a.comments));
      }
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
  // Crowd-sourced menu — distinct dish names people have posted at a restaurant
  // (across every order's items, plus each order's headline dish). Powers the
  // "items you had" suggestions when posting.
  // Aggregate every order's items (or its headline dish for legacy posts) at a
  // restaurant into a menu: one row per distinct dish with its average rating
  // and how many times it's been posted. Most-posted first.
  const restaurantMenu = useCallback(
    (restaurantId: string) => {
      const agg = new Map<string, { name: string; sum: number; count: number }>();
      for (const o of orders) {
        if (o.restaurantId !== restaurantId) continue;
        const pairs = o.items?.length ? o.items : [{ name: o.dishName, rating: o.rating }];
        for (const it of pairs) {
          const key = it.name.trim().toLowerCase();
          if (!key) continue;
          const cur = agg.get(key) ?? { name: it.name.trim(), sum: 0, count: 0 };
          cur.sum += it.rating;
          cur.count += 1;
          agg.set(key, cur);
        }
      }
      return [...agg.values()]
        .map((e) => ({ name: e.name, rating: Math.round((e.sum / e.count) * 10) / 10, count: e.count }))
        .sort((a, b) => b.count - a.count || b.rating - a.rating);
    },
    [orders],
  );
  const menuForRestaurant = useCallback(
    (restaurantId: string): string[] => restaurantMenu(restaurantId).map((m) => m.name),
    [restaurantMenu],
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

  const redeemOffer = useCallback(
    (offerId: string) => {
      if (redeemedOfferIds.has(offerId)) return;
      setRedeemedOfferIds((p) => new Set(p).add(offerId));
      if (live && userId) supabase.from('offer_redemptions').insert({ offer_id: offerId, user_id: userId }).then(() => {});
    },
    [redeemedOfferIds, live, userId],
  );

  const commentsFor = useCallback(
    (orderId: string) => comments.filter((c) => c.orderId === orderId && !blocked.has(c.userId)).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    [comments, blocked],
  );
  const addComment = useCallback(
    (orderId: string, text: string, imageUrl?: string) => {
      const tempId = `c${Date.now()}`;
      const optimistic: Comment = {
        id: tempId,
        orderId,
        userId: currentUserId,
        text,
        imageUrl,
        createdAt: new Date().toISOString(),
      };
      setComments((p) => [...p, optimistic]);
      adjustOrderCount(orderId, 'comments', 1);
      if (live && userId) {
        supabase
          .from('comments')
          .insert({ order_id: orderId, user_id: userId, text, image_url: imageUrl ?? null })
          .select()
          .single()
          .then(({ data }) => {
            if (data) setComments((p) => p.map((c) => (c.id === tempId ? mapComment(data) : c)));
          });
      }
    },
    [currentUserId, live, userId],
  );
  // RLS (0001) already restricts the delete to the caller's own row — this
  // only ever removes optimistically what the author was allowed to remove
  // for real.
  const deleteComment = useCallback(
    (commentId: string, orderId: string) => {
      setComments((p) => p.filter((c) => c.id !== commentId));
      adjustOrderCount(orderId, 'comments', -1);
      if (live && userId) supabase.from('comments').delete().eq('id', commentId).then(() => {});
    },
    [live, userId],
  );

  // Messages and reactions get their own badge on the chat icon (unread
  // conversations, via MessagesContext) and never surface as rows on the
  // notifications screen itself (see notifications.tsx) — counting their
  // rows here would double-badge the same activity on two different icons.
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read && n.kind !== 'message' && n.kind !== 'reaction').length,
    [notifications],
  );
  const markAllNotificationsRead = useCallback(() => {
    setNotifications((p) => p.map((n) => ({ ...n, read: true })));
    if (live && userId) supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false).then(() => {});
  }, [live, userId]);

  const refreshNotifications = useCallback(() => {
    if (!live || !userId) return;
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setNotifications(data.map(mapNotification));
      });
  }, [live, userId]);

  const refreshAttributions = useCallback(() => {
    if (!live || !userId) return;
    supabase
      .from('creator_earnings')
      .select('order_id, amount_cents, status')
      .eq('creator_id', userId)
      .then(({ data }) => {
        if (data) setAttributions(mapAttributions(data));
      });
  }, [live, userId]);

  const reportContent = useCallback(
    (targetType: ReportTarget, targetId: string, reason: ReportReason, details?: string) => {
      if (live && userId)
        supabase.from('reports').insert({ reporter_id: userId, target_type: targetType, target_id: targetId, reason, details }).then(() => {});
    },
    [live, userId],
  );

  const submitRestaurantClaim = useCallback(
    async (input: RestaurantClaimInput): Promise<boolean> => {
      if (!live || !userId) return true;
      const { error } = await supabase.from('restaurant_claims').insert({
        restaurant_id: input.restaurantId,
        claimant_id: userId,
        business_name: input.businessName,
        role: input.role,
        contact_email: input.contactEmail,
        contact_phone: input.contactPhone,
        notes: input.notes,
        id_document_path: input.idDocumentPath,
        authorization_document_path: input.authorizationDocumentPath,
        storefront_photo_path: input.storefrontPhotoPath,
      });
      if (error && __DEV__) console.warn('[Plated] submitRestaurantClaim failed', error);
      return !error;
    },
    [live, userId],
  );

  const submitRestaurantRequest = useCallback(
    async (input: RestaurantRequestInput): Promise<boolean> => {
      if (!live || !userId) return true;
      const { error } = await supabase.from('restaurant_requests').insert({
        requester_id: userId,
        business_name: input.businessName,
        location: input.location,
        contact_email: input.contactEmail,
        contact_phone: input.contactPhone,
        notes: input.notes,
      });
      if (error && __DEV__) console.warn('[Plated] submitRestaurantRequest failed', error);
      return !error;
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

  // Ensure a Foursquare place exists in our restaurants table, returning its
  // uuid. Used when a user opens a searched place from the map (so it has a
  // real id to save / attach a detail sheet to). Deduped by fsq_id.
  const ensureRestaurant = useCallback(
    async (place: PlaceResult): Promise<string | undefined> => {
      // Already known this session?
      const known = Object.values(restaurantMap).find((r) => r.name === place.name && r.location === place.location);
      if (known) return known.id;

      if (!live || !userId) {
        const id = `fsq-${place.fsqId || makeOrderId()}`;
        setRestaurantMap((m) => ({
          ...m,
          [id]: {
            id,
            name: place.name,
            image: '',
            cuisine: place.cuisine,
            location: place.location,
            distance: '',
            lat: place.lat,
            lng: place.lng,
            priceLevel: (place.priceLevel as Restaurant['priceLevel']) ?? '$$',
          },
        }));
        return id;
      }

      const existing = await supabase.from('restaurants').select('id').eq('fsq_id', place.fsqId).maybeSingle();
      if (existing.data?.id) return existing.data.id;
      const ins = await supabase
        .from('restaurants')
        .insert({ fsq_id: place.fsqId, name: place.name, cuisine: place.cuisine, location: place.location, lat: place.lat, lng: place.lng, price_level: place.priceLevel })
        .select('id')
        .single();
      if (!ins.data) return undefined;
      setRestaurantMap((m) => ({ ...m, [ins.data.id]: mapRestaurant({ ...ins.data, name: place.name, cuisine: place.cuisine, location: place.location, lat: place.lat, lng: place.lng, price_level: place.priceLevel }) }));
      return ins.data.id;
    },
    [live, userId, restaurantMap],
  );

  // ── Create a plate ──────────────────────────────────────────────────────────
  const addOrder = useCallback(
    async (input: NewOrderInput): Promise<Order | null> => {
      // A multi-plate post carries media; each media entry's dish+rating is
      // also an item, so the two stay in sync. Fall back to `items`, then to
      // the single dish/rating for legacy posts. Headline = highest-rated.
      const media = input.media?.length ? input.media : undefined;
      const items = (
        media
          ? media.map((m) => ({ name: m.dishName, rating: m.rating }))
          : input.items?.length
            ? input.items
            : [{ name: input.dishName, rating: input.rating }]
      )
        .filter((i) => i.name.trim())
        .sort((a, b) => b.rating - a.rating);
      const headline = items[0] ?? { name: input.dishName, rating: input.rating };
      const headlinePhoto = media ? (media.find((m) => m.dishName === headline.name)?.uri ?? media[0].uri) : input.photo;

      if (!live || !userId) {
        // mock mode
        const order: Order = {
          id: makeOrderId(),
          userId: currentUserId,
          restaurantId: input.restaurantId ?? 'r1',
          dishName: headline.name,
          photo: headlinePhoto,
          description: input.description,
          rating: headline.rating,
          likes: 0,
          comments: 0,
          createdAt: new Date().toISOString(),
          tags: input.tags ?? [],
          reorders: 0,
          items,
          media,
          commentsDisabled: input.commentsDisabled,
          hideLikeCount: input.hideLikeCount,
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
          dish_name: headline.name,
          photo_url: headlinePhoto,
          description: input.description,
          rating: headline.rating,
          tags: input.tags ?? [],
          media: media
            ? media.map((m) => ({ uri: m.uri, type: m.type, dish_name: m.dishName, rating: m.rating }))
            : null,
          comments_disabled: input.commentsDisabled ?? false,
          hide_like_count: input.hideLikeCount ?? false,
        })
        .select('*, likes(count), comments(count), reorders(count)')
        .single();
      if (error || !data) {
        if (__DEV__) console.warn('[Plated] addOrder failed', error);
        return null;
      }

      // Persist every item; failure here is non-fatal (the post already exists).
      const { error: itemsError } = await supabase.from('order_items').insert(
        items.map((it, i) => ({ order_id: data.id, name: it.name.trim(), rating: it.rating, position: i })),
      );
      if (itemsError && __DEV__) console.warn('[Plated] order_items insert failed', itemsError);

      const order = { ...mapOrder(data), items, media, commentsDisabled: input.commentsDisabled, hideLikeCount: input.hideLikeCount };
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

  /**
   * An owner editing their own restaurant's page. Only the columns 0042
   * grants column-level UPDATE on are writable — the RLS policy additionally
   * requires the restaurant to be `verified` and the caller to hold a
   * `restaurant_owners` row, so this can't be used to edit someone else's
   * listing even if the client asked it to.
   *
   * Returns whether the write actually landed, so the editor can tell the
   * owner it failed rather than silently keeping an optimistic value.
   */
  const updateRestaurantPage = useCallback(
    async (restaurantId: string, patch: RestaurantPagePatch): Promise<boolean> => {
      const before = restaurantMap[restaurantId];
      // Optimistic: `custom_name`/`custom_photos` are what `mapRestaurant`
      // folds into `name`/`image`/`photos`, so mirror that here rather than
      // waiting on a refetch to see the edit.
      setRestaurantMap((m) => {
        const current = m[restaurantId];
        if (!current) return m;
        return {
          ...m,
          [restaurantId]: {
            ...current,
            ...(patch.customName !== undefined ? { name: patch.customName || current.name } : {}),
            ...(patch.photos !== undefined
              ? { photos: patch.photos, image: patch.photos[0] || current.image }
              : {}),
            ...(patch.orderMode !== undefined ? { orderMode: patch.orderMode } : {}),
            ...(patch.reservationPlatform !== undefined ? { reservationPlatform: patch.reservationPlatform } : {}),
            ...(patch.reservationUrl !== undefined ? { reservationUrl: patch.reservationUrl } : {}),
            ...(patch.externalOrderUrl !== undefined ? { externalOrderUrl: patch.externalOrderUrl } : {}),
          },
        };
      });

      if (!live) return true;

      const row: Record<string, unknown> = {};
      if (patch.customName !== undefined) row.custom_name = patch.customName || null;
      if (patch.photos !== undefined) row.custom_photos = patch.photos;
      if (patch.orderMode !== undefined) row.order_mode = patch.orderMode ?? null;
      if (patch.reservationPlatform !== undefined) row.reservation_platform = patch.reservationPlatform ?? null;
      if (patch.reservationUrl !== undefined) row.reservation_url = patch.reservationUrl || null;
      if (patch.externalOrderUrl !== undefined) row.external_order_url = patch.externalOrderUrl || null;
      if (!Object.keys(row).length) return true;

      // `.select()` matters: an UPDATE whose rows are all filtered out by RLS
      // is reported as success with zero rows, not as an error. Without asking
      // for the updated rows back there's nothing to distinguish "saved" from
      // "silently rejected", and the editor would claim success either way.
      const { data, error } = await supabase.from('restaurants').update(row).eq('id', restaurantId).select('id');
      const saved = !error && (data?.length ?? 0) > 0;
      if (!saved) {
        console.warn('[restaurants] page update failed:', error?.message ?? 'no rows updated (blocked by RLS?)');
        // Put the old values back — an edit that didn't save shouldn't keep
        // looking saved.
        if (before) setRestaurantMap((m) => ({ ...m, [restaurantId]: before }));
        return false;
      }
      return true;
    },
    [live, restaurantMap],
  );

  // Delete one of your own posts. Optimistic: drop it locally, then delete the
  // row (RLS "delete own order" allows it only for the author).
  const deleteOrder = useCallback(
    (orderId: string) => {
      setOrders((p) => p.filter((o) => o.id !== orderId));
      if (live) supabase.from('orders').delete().eq('id', orderId).then(() => {});
    },
    [live],
  );

  const setOrderVisibility = useCallback(
    (orderId: string, visibility: 'public' | 'friends' | 'private') => {
      setOrders((p) => p.map((o) => (o.id === orderId ? { ...o, visibility } : o)));
      if (live) supabase.from('orders').update({ visibility }).eq('id', orderId).then(() => {});
    },
    [live],
  );

  const setOrderArchived = useCallback(
    (orderId: string, archived: boolean) => {
      setOrders((p) => p.map((o) => (o.id === orderId ? { ...o, archived } : o)));
      if (live) supabase.from('orders').update({ archived }).eq('id', orderId).then(() => {});
    },
    [live],
  );

  const value = useMemo<DataContextValue>(
    () => ({
      orders,
      restaurants: Object.values(restaurantMap),
      contacts: CONTACTS,
      currentUser,
      loading,
      refresh,
      loadMoreOrders,
      userFor,
      ensureProfiles,
      restaurantFor,
      feedOrders,
      verifiedCreatorOrders,
      ordersByRestaurant,
      ordersByUser,
      ratingsByUser,
      restaurantWithRating,
      topRestaurants,
      topPlates,
      myRestaurantRankings,
      myPlateRankings,
      topCreators,
      followingUsers,
      followerUsers,
      suggestedUsers,
      friendUsers,
      exploreOrders,
      searchRestaurants,
      menuForRestaurant,
      restaurantMenu,
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
      deleteComment,
      notifications,
      unreadCount,
      markAllNotificationsRead,
      refreshNotifications,
      attributions,
      refreshAttributions,
      offersForRestaurant,
      offerFor,
      isOfferRedeemed,
      redeemOffer,
      activeOffers,
      recentActivity,
      searchPlates,
      searchUsers,
      bumpedOrderIds,
      placementsFor,
      ownedRestaurantIds,
      submitRestaurantClaim,
      submitRestaurantRequest,
      reportContent,
      isBlocked,
      blockUser,
      unblockUser,
      blockedUsers,
      addOrder,
      deleteOrder,
      setOrderVisibility,
      setOrderArchived,
      ensureRestaurant,
      updateProfile,
      updateRestaurantPage,
    }),
    [orders, restaurantMap, currentUser, loading, refresh, loadMoreOrders, userFor, ensureProfiles, restaurantFor, feedOrders, verifiedCreatorOrders, ordersByRestaurant, ordersByUser, ratingsByUser, restaurantWithRating, topRestaurants, topPlates, myRestaurantRankings, myPlateRankings, topCreators, followingUsers, followerUsers, suggestedUsers, friendUsers, exploreOrders, searchRestaurants, menuForRestaurant, restaurantMenu, isLiked, toggleLike, isSaved, toggleSave, isFollowing, toggleFollow, hasReordered, markReordered, commentsFor, addComment, deleteComment, notifications, unreadCount, markAllNotificationsRead, refreshNotifications, attributions, refreshAttributions, offersForRestaurant, offerFor, isOfferRedeemed, redeemOffer, activeOffers, recentActivity, searchPlates, searchUsers, bumpedOrderIds, placementsFor, ownedRestaurantIds, submitRestaurantClaim, submitRestaurantRequest, reportContent, isBlocked, blockUser, unblockUser, blockedUsers, addOrder, deleteOrder, setOrderVisibility, setOrderArchived, ensureRestaurant, updateProfile, updateRestaurantPage],
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
