import { foodPhoto } from '@/data/images';
import { CURRENT_USER_ID } from '@/data/users';

/**
 * Stories — a dish moment that expires 24 hours after it's posted.
 *
 * Deliberately thinner than a plate: no rating, no menu items, no place in the
 * feed. What a story can carry is a pointer back to durable content (the
 * restaurant, or a plate already posted), so it's a way *into* the app rather
 * than a dead end. See 0020_stories.sql.
 */

export interface Story {
  id: string;
  userId: string;
  mediaUrl: string;
  mediaType: 'image' | 'clip';
  caption: string;
  /** Optional anchors back into durable content. */
  restaurantId?: string;
  orderId?: string;
  visibility: 'public' | 'friends';
  createdAt: string;
  expiresAt: string;
}

/** One person's unexpired stories, as the rail and viewer deal in them. */
export interface StoryGroup {
  userId: string;
  stories: Story[];
  /** True when every story in the group has been seen by the current user. */
  seen: boolean;
}

export const STORY_TTL_MS = 24 * 3600_000;

/** How long each story holds the screen in the viewer. */
export const STORY_DURATION_MS = 5000;

export function isExpired(story: Story, now = Date.now()): boolean {
  return +new Date(story.expiresAt) <= now;
}

/** "3h left" — what a story's remaining life is worth saying. */
export function timeLeft(story: Story, now = Date.now()): string {
  const ms = +new Date(story.expiresAt) - now;
  if (ms <= 0) return 'expired';
  const hours = Math.floor(ms / 3600_000);
  if (hours >= 1) return `${hours}h left`;
  return `${Math.max(1, Math.round(ms / 60_000))}m left`;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const expiring = (h: number) => new Date(Date.now() - h * 3600_000 + STORY_TTL_MS).toISOString();

export const DEMO_STORIES: Story[] = [
  {
    id: 's1',
    userId: 'u1',
    mediaUrl: foodPhoto(6),
    mediaType: 'image',
    caption: 'the cacio e pepe is still perfect',
    restaurantId: 'r2',
    visibility: 'public',
    createdAt: hoursAgo(2),
    expiresAt: expiring(2),
  },
  {
    id: 's2',
    userId: 'u1',
    mediaUrl: foodPhoto(12),
    mediaType: 'image',
    caption: 'and then this happened',
    visibility: 'public',
    createdAt: hoursAgo(1),
    expiresAt: expiring(1),
  },
  {
    id: 's3',
    userId: 'u2',
    mediaUrl: foodPhoto(10),
    mediaType: 'image',
    caption: 'taco tuesday, non-negotiable',
    restaurantId: 'r3',
    visibility: 'public',
    createdAt: hoursAgo(5),
    expiresAt: expiring(5),
  },
  {
    id: 's4',
    userId: 'u3',
    mediaUrl: foodPhoto(13),
    mediaType: 'image',
    caption: 'omakase night 🍣',
    visibility: 'public',
    createdAt: hoursAgo(9),
    expiresAt: expiring(9),
  },
  {
    id: 's5',
    userId: CURRENT_USER_ID,
    mediaUrl: foodPhoto(4),
    mediaType: 'image',
    caption: 'brunch, obviously',
    visibility: 'public',
    createdAt: hoursAgo(4),
    expiresAt: expiring(4),
  },
];
