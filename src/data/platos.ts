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
  rating: number;
  caption: string;
  likes: number;
  comments: number;
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
