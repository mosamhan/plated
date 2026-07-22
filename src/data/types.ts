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
}

/** An "order" / "plate" — a single dish someone rated. The core unit of Plated. */
/** One menu item on a post, with its own rating. */
export interface OrderItem {
  name: string;
  /** 0–10 personal rating for this specific item. */
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
}

export interface Comment {
  id: string;
  orderId: string;
  userId: string;
  text: string;
  createdAt: string;
}

export type NotificationKind = 'like' | 'comment' | 'follow' | 'reorder' | 'earnings' | 'milestone';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  /** Actor (who liked/followed/etc.), when applicable. */
  userId?: string;
  /** Related plate, when applicable. */
  orderId?: string;
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

export type ReportTarget = 'plate' | 'user' | 'comment';

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

export interface Contact {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  /** Already on Plated (suggest follow) vs. not (invite). */
  onPlated: boolean;
  mutualFriends: number;
}
