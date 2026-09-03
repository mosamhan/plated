/** Maps Supabase rows (snake_case) to the app's domain types (camelCase). */
import { defaultAvatar, foodPhoto, restaurantPhoto } from '@/data/images';
import { Conversation, ConversationParticipant, Message, MessageKind, MessageReaction } from '@/data/messages';
import { PlatoComment, PlatoVideo } from '@/data/platos';
import { Story } from '@/data/stories';
import { AppNotification, Collaborator, Comment, FeedBump, Order, PlateAttribution, Restaurant, RestaurantOffer, SponsoredPlacement, User } from '@/data/types';

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
    avatar: row.avatar_url || defaultAvatar(),
    bio: row.bio ?? '',
    verified: !!row.verified,
    followers: countOf(row.followers),
    following: countOf(row.following),
    friends: 0,
    socials: row.socials ?? {},
    compensationEligible: !!row.compensation_eligible,
    estimatedEarnings: 0,
    needsOnboarding: !!row.needs_onboarding,
    dateOfBirth: row.date_of_birth ?? undefined,
  };
}

export function mapRestaurant(row: any): Restaurant {
  const photos: string[] = row.custom_photos ?? [];
  return {
    id: row.id,
    name: row.custom_name || row.name,
    image: photos[0] || row.image_url || restaurantPhoto(hashToInt(row.id)),
    cuisine: row.cuisine ?? 'Restaurant',
    location: row.location ?? '',
    distance: '',
    lat: row.lat ?? undefined,
    lng: row.lng ?? undefined,
    priceLevel: (row.price_level as Restaurant['priceLevel']) ?? '$$',
    fsqId: row.fsq_id ?? undefined,
    verified: row.verified ?? false,
    photos,
    orderMode: (row.order_mode as Restaurant['orderMode']) ?? undefined,
    reservationPlatform: (row.reservation_platform as Restaurant['reservationPlatform']) ?? undefined,
    reservationUrl: row.reservation_url ?? undefined,
    externalOrderUrl: row.external_order_url ?? undefined,
    doordashStoreUrl: row.doordash_store_url ?? undefined,
    ubereatsStoreUrl: row.ubereats_store_url ?? undefined,
    googlePlaceId: row.google_place_id ?? undefined,
    googleRating: row.google_rating != null ? Number(row.google_rating) : undefined,
    googleRatingCount: row.google_rating_count ?? undefined,
    googleRatingFetchedAt: row.google_rating_fetched_at ?? undefined,
  };
}

/** Rows from the `collaborators:post_collaborators(...)` join on either post type. */
export function mapCollaborators(rows: any): Collaborator[] | undefined {
  if (!Array.isArray(rows) || rows.length === 0) return undefined;
  return rows.map((r: any) => ({ userId: r.user_id, status: r.status }));
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
    items: Array.isArray(row.order_items)
      ? row.order_items
          .map((it: any) => ({ name: it.name, rating: Number(it.rating) }))
          .sort((a: any, b: any) => b.rating - a.rating)
      : undefined,
    // Carousel media, when the post was created with the multi-plate flow.
    media: Array.isArray(row.media)
      ? row.media.map((m: any) => ({
          uri: m.uri ?? m.url,
          type: m.type === 'clip' ? 'clip' : 'image',
          dishName: m.dish_name ?? m.dishName ?? '',
          rating: Number(m.rating ?? 0),
        }))
      : undefined,
    collaborators: mapCollaborators(row.collaborators),
    commentsDisabled: !!row.comments_disabled,
    hideLikeCount: !!row.hide_like_count,
    visibility: (row.visibility as Order['visibility']) ?? 'public',
    archived: !!row.archived,
    monetizable: !!row.monetizable,
  };
}

/**
 * Rows from `creator_earnings` (order_id, amount_cents, status), collapsed to
 * one row per plate for the creator dashboard. `estimated` is every dollar
 * ever recorded for the plate (any non-voided status); `confirmed` is the
 * subset that's cleared the network's return window (confirmed + paid);
 * `paid` is the subset actually swept into a payout — so estimated >=
 * confirmed >= paid, matching the dashboard's "+$X pending" math.
 */
export function mapAttributions(rows: any[]): PlateAttribution[] {
  const byPlate = new Map<string, { orders: number; estimatedCents: number; confirmedCents: number; paidCents: number }>();
  for (const row of rows) {
    if (!row.order_id || row.status === 'voided') continue;
    const bucket = byPlate.get(row.order_id) ?? { orders: 0, estimatedCents: 0, confirmedCents: 0, paidCents: 0 };
    bucket.orders += 1;
    bucket.estimatedCents += row.amount_cents;
    if (row.status === 'confirmed' || row.status === 'paid') bucket.confirmedCents += row.amount_cents;
    if (row.status === 'paid') bucket.paidCents += row.amount_cents;
    byPlate.set(row.order_id, bucket);
  }
  return Array.from(byPlate.entries()).map(([plateId, b]) => ({
    plateId,
    attributedOrders: b.orders,
    estimated: Math.round(b.estimatedCents / 100),
    confirmed: Math.round(b.confirmedCents / 100),
    paid: Math.round(b.paidCents / 100),
  }));
}

export function mapOffer(row: any): RestaurantOffer {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    offerType: row.offer_type,
    title: row.title,
    description: row.description ?? '',
    promoCode: row.promo_code ?? undefined,
    redeemWindowSeconds: row.redeem_window_seconds ?? 300,
    expiresAt: row.expires_at ?? undefined,
    active: row.active ?? true,
  };
}

export function mapFeedBump(row: any): FeedBump {
  return { orderId: row.order_id, expiresAt: row.expires_at };
}

export function mapSponsoredPlacement(row: any): SponsoredPlacement {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    placementType: row.placement_type,
    mediaUrl: row.media_url ?? undefined,
    headline: row.headline ?? undefined,
    ctaUrl: row.cta_url ?? undefined,
    targetZipCodes: row.target_zip_codes ?? [],
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
    avatar: creator.avatar_url || defaultAvatar(),
    verified: !!creator.verified,
    compensationEligible: !!creator.compensation_eligible,
    dishName: row.dish_name,
    restaurantName: row.restaurant_name,
    restaurantId: row.restaurant_id ?? undefined,
    rating: row.rating != null ? Number(row.rating) : 0,
    caption: row.caption ?? '',
    likes: countOf(row.likes),
    comments: countOf(row.comments),
    views: row.view_count ?? 0,
    collaborators: mapCollaborators(row.collaborators),
    plates: Array.isArray(row.plates)
      ? row.plates.map((p: any) => ({ dishName: p.dish_name ?? p.dishName ?? '', rating: Number(p.rating ?? 0) }))
      : undefined,
    visibility: (row.visibility as PlatoVideo['visibility']) ?? 'public',
    archived: !!row.archived,
    monetizable: !!row.monetizable,
  };
}

export function mapPlatoComment(row: any): PlatoComment {
  const author = row.author ?? {};
  return {
    id: row.id,
    platoId: row.plato_id,
    userId: row.user_id,
    parentId: row.parent_id ?? undefined,
    name: author.name ?? 'Guest',
    handle: author.handle ?? 'guest',
    avatar: author.avatar_url || defaultAvatar(),
    text: row.text,
    likes: countOf(row.likes),
    createdAt: row.created_at,
  };
}

export function mapParticipant(row: any): ConversationParticipant {
  return {
    userId: row.user_id,
    state: row.state === 'request' ? 'request' : 'accepted',
    lastReadAt: row.last_read_at ?? EPOCH,
    muted: !!row.muted,
    pinned: !!row.pinned,
    forcedUnread: !!row.forced_unread,
    bubbleColor: row.bubble_color ?? undefined,
  };
}

export function mapConversation(row: any): Conversation {
  return {
    id: row.id,
    isGroup: !!row.is_group,
    title: row.title ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at ?? row.created_at,
    avatarUrl: row.avatar_url ?? undefined,
    participants: (row.participants ?? row.conversation_participants ?? []).map(mapParticipant),
  };
}

export function mapMessage(row: any): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    kind: (row.kind as MessageKind) ?? 'text',
    text: row.text ?? '',
    attachmentId: row.attachment_id ?? undefined,
    attachmentIds: row.attachment_ids ?? undefined,
    attachmentIndex: row.attachment_index ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    replyTo: row.reply_to ?? undefined,
    replyToIndex: row.reply_to_index ?? undefined,
    createdAt: row.created_at,
    editedAt: row.edited_at ?? undefined,
  };
}

export function mapReaction(row: any): MessageReaction {
  return { messageId: row.message_id, userId: row.user_id, emoji: row.emoji };
}

export function mapStory(row: any): Story {
  return {
    id: row.id,
    userId: row.user_id,
    mediaUrl: row.media_url,
    mediaType: row.media_type === 'clip' ? 'clip' : 'image',
    caption: row.caption ?? '',
    restaurantId: row.restaurant_id ?? undefined,
    orderId: row.order_id ?? undefined,
    visibility: (row.visibility as Story['visibility']) ?? 'public',
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

const EPOCH = '1970-01-01T00:00:00.000Z';

export function mapNotification(row: any): AppNotification {
  return {
    id: row.id,
    kind: row.kind,
    userId: row.actor_id ?? undefined,
    orderId: row.order_id ?? undefined,
    platoId: row.plato_id ?? undefined,
    conversationId: row.conversation_id ?? undefined,
    text: row.text,
    createdAt: row.created_at,
    read: !!row.read,
  };
}
