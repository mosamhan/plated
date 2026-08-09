import { RestaurantOffer } from '@/data/types';

/**
 * Seed offers for mock/demo mode — there's no live equivalent until a
 * restaurant is actually onboarded (see 0029_restaurant_offers.sql), so this
 * is what OfferBanner and the /offer/[id] redeem screen render against when
 * Supabase isn't configured.
 */
export const OFFERS: RestaurantOffer[] = [
  {
    id: 'off1',
    restaurantId: 'r1',
    offerType: 'general',
    title: '10% off online orders',
    description: 'Applies at checkout on DoorDash & Uber Eats',
    promoCode: 'GOLDENCHAR10',
    redeemWindowSeconds: 300,
  },
  {
    id: 'off2',
    restaurantId: 'r2',
    offerType: 'plated_exclusive',
    title: 'Free tiramisu with any entrée',
    description: 'Show this screen to your server',
    redeemWindowSeconds: 300,
  },
];
