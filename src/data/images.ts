/**
 * Remote image helpers. Keeps the repo light (no bundled photos) — the mockup
 * needs network at demo time. Swap to bundled assets later if you want offline.
 */

/** Unsplash food photo IDs (curated, food-forward). */
const FOOD_IDS = [
  '1568901346375-23c9450c58cd', // burger
  '1565299624946-b28f40a0ae38', // pizza
  '1551782450-a2132b4ba21d', // smash burger
  '1504674900247-0877df9cc836', // food spread
  '1567620905732-2d1ec7ab7445', // pancakes
  '1546069901-ba9599a7e63c', // salad bowl
  '1565958011703-44f9829ba187', // pasta
  '1513104890138-7c749659a591', // pizza slice
  '1540189549336-e6e99c3679fe', // greens
  '1559847844-5315695dadae', // steak
  '1553621042-f6e147245754', // tacos
  '1551024506-0bccd828d307', // dessert
  '1607330289024-1535c6b4e1c1', // ramen
  '1579871494447-9811cf80d66c', // sushi
  '1482049016688-2d3e1b311543', // brunch
];

const RESTAURANT_IDS = [
  '1517248135467-4c7edcad34c4', // restaurant interior
  '1552566626-52f8b828add9', // restaurant
  '1414235077428-338989a2e8c0', // dim dining
  '1466978913421-dad2ebd01d17', // cafe
  '1424847651672-bf20a4b0982b', // bistro
  '1559339352-11d035aa65de', // diner
];

export function foodPhoto(index: number): string {
  const id = FOOD_IDS[index % FOOD_IDS.length];
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=80`;
}

export function restaurantPhoto(index: number): string {
  const id = RESTAURANT_IDS[index % RESTAURANT_IDS.length];
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=80`;
}

/** Deterministic avatar from pravatar. */
export function avatar(seed: number): string {
  // pravatar has 70 images; keep within range.
  return `https://i.pravatar.cc/300?img=${(seed % 70) + 1}`;
}

/** Warm-toned blurhashes shown while food photos load (expo-image placeholder). */
const FOOD_BLURHASHES = [
  'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
  'LKO2?U%2Tw=w]~RBVZRi};RPxuwH',
  'LBAdAqof00WCqZj[PDay0.WB}pof',
];

export function foodPlaceholder(seed: string): { blurhash: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return { blurhash: FOOD_BLURHASHES[Math.abs(h) % FOOD_BLURHASHES.length] };
}
