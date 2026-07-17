/** Maps Supabase rows (snake_case) to the app's domain types (camelCase). */
import { avatar, foodPhoto, restaurantPhoto } from '@/data/images';
import { PlatoComment, PlatoVideo } from '@/data/platos';
import { AppNotification, Comment, Order, Restaurant, User } from '@/data/types';

function countOf(embedded: unknown): number {
  // Supabase returns embedded counts as [{ count: n }]
  if (Array.isArray(embedded) && embedded[0] && typeof embedded[0].count === 'number') {
    return embedded[0].count;
  }
  return 0;
}

function hashToInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function mapProfile(row: any): User {
  return {
    id: row.id,
    name: row.name ?? 'Guest',
    handle: row.handle ?? 'guest',
    avatar: row.avatar_url || avatar(hashToInt(row.id)),
    bio: row.bio ?? '',
    verified: !!row.verified,
    followers: countOf(row.followers),
    following: countOf(row.following),
    friends: 0,
    socials: row.socials ?? {},
    compensationEligible: !!row.compensation_eligible,
    estimatedEarnings: 0,
  };
}

export function mapRestaurant(row: any): Restaurant {
  return {
    id: row.id,
    name: row.name,
    image: row.image_url || restaurantPhoto(hashToInt(row.id)),
    cuisine: row.cuisine ?? 'Restaurant',
    location: row.location ?? '',
    distance: '',
    lat: row.lat ?? undefined,
    lng: row.lng ?? undefined,
    priceLevel: (row.price_level as Restaurant['priceLevel']) ?? '$$',
  };
}

export function mapOrder(row: any): Order {
  return {
    id: row.id,
    userId: row.user_id,
    restaurantId: row.restaurant_id,
    dishName: row.dish_name,
    photo: row.photo_url || foodPhoto(hashToInt(row.id)),
    description: row.description ?? '',
    rating: Number(row.rating),
    likes: countOf(row.likes),
    comments: countOf(row.comments),
    reorders: countOf(row.reorders),
    createdAt: row.created_at,
    tags: row.tags ?? [],
  };
}

export function mapComment(row: any): Comment {
  return {
    id: row.id,
    orderId: row.order_id,
    userId: row.user_id,
    text: row.text,
    createdAt: row.created_at,
  };
}

export function mapPlato(row: any): PlatoVideo {
  const creator = row.creator ?? {};
  return {
    id: row.id,
    videoUrl: row.video_url,
    poster: row.poster_url || foodPhoto(hashToInt(row.id)),
    creatorId: row.user_id,
    creatorName: creator.name ?? 'Creator',
    creatorHandle: creator.handle ?? 'creator',
    avatar: creator.avatar_url || avatar(hashToInt(row.user_id)),
    verified: !!creator.verified,
    compensationEligible: !!creator.compensation_eligible,
    dishName: row.dish_name,
    restaurantName: row.restaurant_name,
    restaurantId: row.restaurant_id ?? undefined,
    rating: row.rating != null ? Number(row.rating) : 0,
    caption: row.caption ?? '',
    likes: countOf(row.likes),
    comments: countOf(row.comments),
  };
}

export function mapPlatoComment(row: any): PlatoComment {
  const author = row.author ?? {};
  return {
    id: row.id,
    platoId: row.plato_id,
    userId: row.user_id,
    name: author.name ?? 'Guest',
    handle: author.handle ?? 'guest',
    avatar: author.avatar_url || avatar(hashToInt(row.user_id)),
    text: row.text,
    createdAt: row.created_at,
  };
}

export function mapNotification(row: any): AppNotification {
  return {
    id: row.id,
    kind: row.kind,
    userId: row.actor_id ?? undefined,
    orderId: row.order_id ?? undefined,
    text: row.text,
    createdAt: row.created_at,
    read: !!row.read,
  };
}
