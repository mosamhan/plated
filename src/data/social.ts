import { AppNotification, Comment, PlateAttribution } from '@/data/types';

/** Seed comments for popular plates. */
export const COMMENTS: Comment[] = [
  { id: 'c1', orderId: 'o1', userId: 'u2', text: 'Ordered this off your rec — crust was unreal. Instant reorder.', createdAt: '2026-06-08T19:42:00Z' },
  { id: 'c2', orderId: 'o1', userId: 'u5', text: 'Is the well-done tip serious? Going tomorrow.', createdAt: '2026-06-09T12:10:00Z' },
  { id: 'c3', orderId: 'o1', userId: 'u4', text: 'Best smash in the East Village, no contest.', createdAt: '2026-06-09T20:05:00Z' },
  { id: 'c4', orderId: 'o3', userId: 'u1', text: 'The chutney call-out is correct. Get two.', createdAt: '2026-06-07T09:30:00Z' },
  { id: 'c5', orderId: 'o3', userId: 'u6', text: 'Drove 40 min for this. Worth it.', createdAt: '2026-06-08T13:22:00Z' },
  { id: 'c6', orderId: 'o9', userId: 'u3', text: 'That torched salmon piece lives in my head rent free.', createdAt: '2026-06-06T22:48:00Z' },
  { id: 'c7', orderId: 'o2', userId: 'u7', text: 'Extra chashu confirmed essential.', createdAt: '2026-06-09T18:15:00Z' },
  { id: 'c8', orderId: 'o16', userId: 'u1', text: 'Adding this to my list — truffle aioli sounds dangerous.', createdAt: '2026-06-09T15:00:00Z' },
];

/** Seed notifications for the signed-in user. */
export const NOTIFICATIONS: AppNotification[] = [
  { id: 'n1', kind: 'reorder', userId: 'u2', orderId: 'o16', text: 'Marcus Reed reordered your Truffle Smash', createdAt: '2026-06-10T16:20:00Z', read: false },
  { id: 'n2', kind: 'like', userId: 'u1', orderId: 'o16', text: 'Olivia Chen liked your Truffle Smash', createdAt: '2026-06-10T14:05:00Z', read: false },
  { id: 'n3', kind: 'comment', userId: 'u1', orderId: 'o16', text: 'Olivia Chen commented: "Adding this to my list…"', createdAt: '2026-06-09T15:01:00Z', read: false },
  { id: 'n4', kind: 'follow', userId: 'u4', text: 'Diego Santos started following you', createdAt: '2026-06-09T11:30:00Z', read: true },
  { id: 'n5', kind: 'milestone', text: 'Your Shoyu Ramen hit 50 likes 🎉', createdAt: '2026-06-08T17:45:00Z', read: true },
  { id: 'n6', kind: 'follow', userId: 'u5', text: 'Hannah Liu started following you', createdAt: '2026-06-07T10:12:00Z', read: true },
  { id: 'n7', kind: 'like', userId: 'u7', orderId: 'o17', text: 'Aisha Khan liked your Shoyu Ramen', createdAt: '2026-06-06T19:08:00Z', read: true },
];

/**
 * Preview attribution data for the creator dashboard.
 * Shown to not-yet-eligible users clearly labeled as a preview; becomes real
 * reporting once connected to an affiliate network (Impact.com etc.).
 */
export const PREVIEW_ATTRIBUTIONS: PlateAttribution[] = [
  { plateId: 'o16', attributedOrders: 38, estimated: 87, confirmed: 64, paid: 0 },
  { plateId: 'o17', attributedOrders: 11, estimated: 24, confirmed: 18, paid: 0 },
];
