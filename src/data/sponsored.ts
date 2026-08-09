import { restaurantPhoto } from '@/data/images';
import { FeedBump, SponsoredPlacement } from '@/data/types';

/**
 * Mock feed bumps for demo mode — a restaurant "spending" one of its monthly
 * allotment to pin an existing plate to the top of the home feed. See
 * 0028_restaurant_subscriptions.sql; live mode reads the real
 * restaurant_feed_bumps table instead.
 */
export const FEED_BUMPS: FeedBump[] = [
  { orderId: 'o5', expiresAt: new Date(Date.now() + 2 * 86_400_000).toISOString() },
];

/**
 * Mock sponsored placements — one per surface, so all three render something
 * in demo mode: a reel ad (Taqueria El Sol), a sponsored map pin (Spice
 * Route), and a Local Favorites rail entry (Smoke & Oak).
 */
export const SPONSORED_PLACEMENTS: SponsoredPlacement[] = [
  {
    id: 'sp1',
    restaurantId: 'r4',
    placementType: 'reel_ad',
    mediaUrl: restaurantPhoto(3),
    headline: 'Al pastor, made fresh daily',
    ctaUrl: 'https://www.google.com/search?q=Taqueria+El+Sol',
  },
  {
    id: 'sp2',
    restaurantId: 'r6',
    placementType: 'map_pin',
  },
  {
    id: 'sp3',
    restaurantId: 'r7',
    placementType: 'local_favorite',
    headline: 'This week: 20% off smoked brisket',
  },
];
