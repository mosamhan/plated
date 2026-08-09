export interface Socials {
  instagram?: string;
  tiktok?: string;
  youtube?: string;
}

export interface User {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  bio: string;
  verified: boolean;
  followers: number;
  following: number;
  friends: number;
  socials: Socials;
  /** Eligible for creator compensation (high follower count). */
  compensationEligible: boolean;
  /** Mock estimated monthly earnings, only meaningful when eligible. */
  estimatedEarnings: number;
}

export interface Restaurant {
  id: string;
  name: string;
  image: string;
  cuisine: string;
  location: string;
  /** Rough distance label for "near you" UI. */
  distance: string;
  /** Coordinates (from Foursquare) — used for directions + location filtering. */
  lat?: number;
  lng?: number;
  priceLevel: '$' | '$$' | '$$$';
  /** Foursquare place id — lets the menu pull FSQ's structured dish list. */
  fsqId?: string;
}

/**
 * A co-creator named on a post. Credit only — creator earnings stay with the
 * original poster, and any split between creators is arranged between them.
 */
export interface Collaborator {
  userId: string;
  status: 'pending' | 'accepted' | 'declined';
}

/** An "order" / "plate" — a single dish someone rated. The core unit of Plated. */
/** One menu item on a post, with its own rating. */
export interface OrderItem {
  name: string;
  /** 0–10 personal rating for this specific item. */
  rating: number;
}

/**
 * One photo/clip in a post's carousel, carrying its own dish and rating.
 *
 * A post is now several plates, not one: swiping the carousel moves between
 * dishes, each with its own name and score. `items[]` (name+rating, no media)
 * predates this and stays for legacy single-photo posts — `postMedia()` in
 * lib/post normalises both shapes to this one so the UI only handles media.
 */
export interface PostMedia {
  /** Image or short-clip URI. */
  uri: string;
  type: 'image' | 'clip';
  dishName: string;
  /** 0–10 rating for this specific plate. */
  rating: number;
}

export interface Order {
  id: string;
  userId: string;
  restaurantId: string;
  dishName: string;
  photo: string;
  description: string;
  /** 0–10 personal rating (the headline item's rating). */
  rating: number;
  /**
   * Every item the user had on this order, best-rated first. The headline
   * dishName/rating mirror items[0]. Empty for legacy single-dish posts.
   */
  items?: OrderItem[];
  /**
   * The post's carousel: each plate's photo/clip + its dish name and rating.
   * When present it's the source of truth for what's on the post; the headline
   * photo/dishName/rating mirror media[0]. Absent on legacy single-photo posts,
   * which `postMedia()` synthesises a one-entry carousel for.
   */
  media?: PostMedia[];
  likes: number;
  comments: number;
  /** ISO date string. */
  createdAt: string;
  /** Tags used for explore filtering. */
  tags: string[];
  /**
   * How many times the community reordered this exact plate — the
   * highest-praise signal Plated tracks (Beli has no equivalent).
   */
  reorders?: number;
  /** Co-creators. Only `accepted` entries are visible to anyone but the two parties. */
  collaborators?: Collaborator[];
  /** Poster turned commenting off for this post (more-options at create time). */
  commentsDisabled?: boolean;
  /** Poster hid the like count — only they see it. */
  hideLikeCount?: boolean;
  /** Who can see this post. Enforced in the DB, not just the client. */
  visibility?: 'public' | 'friends' | 'private';
  /** Hidden from everyone but the author, who can restore it. */
  archived?: boolean;
}

export interface Comment {
  id: string;
  orderId: string;
  userId: string;
  text: string;
  createdAt: string;
}

export type NotificationKind =
  | 'like'
  | 'comment'
  | 'follow'
  | 'reorder'
  | 'earnings'
  | 'milestone'
  /** Invited onto someone's post as a co-creator, or an invite of yours accepted. */
  | 'collab';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  /** Actor (who liked/followed/etc.), when applicable. */
  userId?: string;
  /** Related plate, when applicable. */
  orderId?: string;
  /** Related Plato, when the notification is about a reel rather than a plate. */
  platoId?: string;
  text: string;
  createdAt: string;
  read: boolean;
}

export type ReportReason =
  | 'Spam or misleading'
  | 'Offensive or inappropriate'
  | 'Not food / wrong content'
  | 'Harassment or hate'
  | 'Child safety concern'
  | 'Intellectual property'
  | 'Other';

export type ReportTarget = 'plate' | 'plato' | 'user' | 'comment';

export interface ContentReport {
  id: string;
  targetType: ReportTarget;
  targetId: string;
  reason: ReportReason;
  details?: string;
  createdAt: string;
}

/** Per-plate creator attribution row (mock of affiliate-network reporting). */
export interface PlateAttribution {
  plateId: string;
  attributedOrders: number;
  estimated: number;
  confirmed: number;
  paid: number;
}

/**
 * A restaurant-funded coupon. `general` also works outside Plated (a code
 * copied to the clipboard); `plated_exclusive` only redeems through the
 * countdown screen at /offer/[id] — "show this to your server". See
 * 0029_restaurant_offers.sql.
 */
export interface RestaurantOffer {
  id: string;
  restaurantId: string;
  offerType: 'general' | 'plated_exclusive';
  title: string;
  description: string;
  promoCode?: string;
  /** How long the redeem screen's countdown runs once opened. */
  redeemWindowSeconds: number;
  expiresAt?: string;
}

/**
 * A restaurant's plate temporarily pinned to the top of nearby feeds — one of
 * a subscribed restaurant's monthly allotment (see restaurant_subscriptions).
 * A pointer, not new content: the plate itself is a plain Order.
 */
export interface FeedBump {
  orderId: string;
  expiresAt: string;
}

/**
 * A paid restaurant placement. Three independent surfaces share one table
 * (see 0028_restaurant_subscriptions.sql) because they're the same product —
 * a restaurant paying for visibility — just rendered differently:
 *   reel_ad        — a sponsored card interspersed in the Platos feed
 *   map_pin        — a distinguished pin in Explore's map
 *   local_favorite — a rail on Explore, the flat-fee "Local Favorites" tier
 */
export interface SponsoredPlacement {
  id: string;
  restaurantId: string;
  placementType: 'reel_ad' | 'map_pin' | 'local_favorite';
  mediaUrl?: string;
  headline?: string;
  ctaUrl?: string;
}

export interface Contact {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  /** Already on Plated (suggest follow) vs. not (invite). */
  onPlated: boolean;
  mutualFriends: number;
}
