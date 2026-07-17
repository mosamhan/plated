import { avatar, foodPhoto } from '@/data/images';

/**
 * A "Plato" — a short vertical video a creator makes about a plate/restaurant.
 * Demo content for now (food clips from Mixkit + seeded creators); real creator
 * uploads land in a `plato_videos` table + Storage later.
 */
export interface PlatoVideo {
  id: string;
  videoUrl: string;
  poster: string;
  creatorName: string;
  creatorHandle: string;
  creatorId: string;
  avatar: string;
  verified: boolean;
  compensationEligible: boolean;
  dishName: string;
  restaurantName: string;
  /** Present when the Plato is tied to a saved restaurant row (else Foursquare-only). */
  restaurantId?: string;
  rating: number;
  caption: string;
  likes: number;
  comments: number;
}

export interface PlatoComment {
  id: string;
  platoId: string;
  userId: string;
  /** Set when this comment is a reply — points at the top-level comment it threads under. */
  parentId?: string;
  /** Display fields captured at write time so demo comments render without a profile lookup. */
  name: string;
  handle: string;
  avatar: string;
  text: string;
  likes: number;
  createdAt: string;
}

// Mixkit free-license stock clips (H.264 MP4, hotlinkable CDN). Each is a real,
// appetizing food shot matched to its dish label — swapped for creator uploads later.
const V = 'https://assets.mixkit.co/videos';

export const PLATOS: PlatoVideo[] = [
  {
    id: 'p1',
    videoUrl: `${V}/44001/44001-1080.mp4`,
    poster: foodPhoto(2),
    creatorName: 'Olivia Chen',
    creatorHandle: 'oliviaeats',
    creatorId: 'u1',
    avatar: avatar(5),
    verified: true,
    compensationEligible: true,
    dishName: 'Pepperoni Pie',
    restaurantName: "Roberta's",
    rating: 9.3,
    caption: 'Blistered, leopard-spotted crust and cups of crispy pepperoni. Get it whole. 🍕',
    likes: 4210,
    comments: 128,
  },
  {
    id: 'p2',
    videoUrl: `${V}/3537/3537-1080.mp4`,
    poster: foodPhoto(0),
    creatorName: 'Marcus Reed',
    creatorHandle: 'marcuseats',
    creatorId: 'u2',
    avatar: avatar(33),
    verified: true,
    compensationEligible: true,
    dishName: 'Crispy Chicken Sando',
    restaurantName: 'Blue Ribbon Fried Chicken',
    rating: 9.4,
    caption: 'Shatteringly crisp, juicy inside, pickles for the tang. Fries are non-negotiable. 🍔',
    likes: 3180,
    comments: 96,
  },
  {
    id: 'p3',
    videoUrl: `${V}/12171/12171-1080.mp4`,
    poster: foodPhoto(6),
    creatorName: 'Olivia Chen',
    creatorHandle: 'oliviaeats',
    creatorId: 'u1',
    avatar: avatar(5),
    verified: true,
    compensationEligible: true,
    dishName: 'Spaghetti Bolognese',
    restaurantName: 'Rezdôra',
    rating: 9.1,
    caption: 'Slow-simmered ragù, a snowfall of Parmigiano tableside. Order the extra bread. 🍝',
    likes: 2640,
    comments: 71,
  },
  {
    id: 'p4',
    videoUrl: `${V}/2442/2442-1080.mp4`,
    poster: foodPhoto(10),
    creatorName: 'Marcus Reed',
    creatorHandle: 'marcuseats',
    creatorId: 'u2',
    avatar: avatar(33),
    verified: true,
    compensationEligible: true,
    dishName: 'Raspberry Cheesecake',
    restaurantName: "Junior's",
    rating: 9.2,
    caption: 'That dense, tangy New York slice with fresh raspberry. Split it — or don’t. 🍰',
    likes: 5120,
    comments: 143,
  },
];

/** A few demo comments per Plato so the comments sheet isn't empty before real ones land. */
export const PLATO_COMMENTS: PlatoComment[] = [
  { id: 'pc1', platoId: 'p1', userId: 'u3', name: 'Priya Nair', handle: 'priyabites', avatar: avatar(12), text: 'The crust cup situation is unreal 🔥', likes: 24, createdAt: '2026-07-15T18:20:00Z' },
  { id: 'pc1r1', platoId: 'p1', parentId: 'pc1', userId: 'u1', name: 'Olivia Chen', handle: 'oliviaeats', avatar: avatar(5), text: 'Right?? The cup char is the whole point.', likes: 6, createdAt: '2026-07-15T18:41:00Z' },
  { id: 'pc2', platoId: 'p1', userId: 'u2', name: 'Marcus Reed', handle: 'marcuseats', avatar: avatar(33), text: 'Adding this to the list this weekend.', likes: 8, createdAt: '2026-07-15T19:02:00Z' },
  { id: 'pc3', platoId: 'p2', userId: 'u1', name: 'Olivia Chen', handle: 'oliviaeats', avatar: avatar(5), text: 'Pickles carry the whole sandwich, agreed.', likes: 41, createdAt: '2026-07-15T20:10:00Z' },
  { id: 'pc4', platoId: 'p3', userId: 'u4', name: 'Diego Marte', handle: 'diegoforks', avatar: avatar(21), text: 'Rezdôra never misses. That ragù 👌', likes: 17, createdAt: '2026-07-15T21:30:00Z' },
  { id: 'pc5', platoId: 'p4', userId: 'u3', name: 'Priya Nair', handle: 'priyabites', avatar: avatar(12), text: "Junior's is the only cheesecake that matters.", likes: 63, createdAt: '2026-07-15T22:05:00Z' },
];
