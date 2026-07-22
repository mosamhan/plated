import { restaurantPhoto } from '@/data/images';
import { Restaurant } from '@/data/types';

export const RESTAURANTS: Restaurant[] = [
  {
    id: 'r1',
    name: 'Golden Char',
    image: restaurantPhoto(0),
    cuisine: 'Burgers',
    location: 'East Village, NYC',
    distance: '0.4 mi',
    priceLevel: '$$',
    lat: 40.7265,
    lng: -73.9815,
  },
  {
    id: 'r2',
    name: 'Nonna Lucia',
    image: restaurantPhoto(1),
    cuisine: 'Italian',
    location: 'West Village, NYC',
    distance: '0.9 mi',
    priceLevel: '$$$',
    lat: 40.7358,
    lng: -74.0036,
  },
  {
    id: 'r3',
    name: 'Slurp House',
    image: restaurantPhoto(2),
    cuisine: 'Ramen',
    location: 'Lower East Side, NYC',
    distance: '1.2 mi',
    priceLevel: '$$',
    lat: 40.718,
    lng: -73.9857,
  },
  {
    id: 'r4',
    name: 'Taqueria El Sol',
    image: restaurantPhoto(3),
    cuisine: 'Mexican',
    location: 'Bushwick, Brooklyn',
    distance: '2.1 mi',
    priceLevel: '$',
    lat: 40.6944,
    lng: -73.9213,
  },
  {
    id: 'r5',
    name: 'Sugar & Salt',
    image: restaurantPhoto(4),
    cuisine: 'Brunch & Bakery',
    location: 'SoHo, NYC',
    distance: '0.7 mi',
    priceLevel: '$$',
    lat: 40.7233,
    lng: -74.003,
  },
  {
    id: 'r6',
    name: 'Spice Route',
    image: restaurantPhoto(5),
    cuisine: 'South Indian',
    location: 'Murray Hill, NYC',
    distance: '1.6 mi',
    priceLevel: '$$',
    lat: 40.7478,
    lng: -73.9784,
  },
  {
    id: 'r7',
    name: 'Smoke & Oak',
    image: restaurantPhoto(0),
    cuisine: 'BBQ',
    location: 'Williamsburg, Brooklyn',
    distance: '2.8 mi',
    priceLevel: '$$',
    lat: 40.7145,
    lng: -73.9425,
  },
  {
    id: 'r8',
    name: 'Hana Sushi',
    image: restaurantPhoto(1),
    cuisine: 'Japanese',
    location: 'Midtown, NYC',
    distance: '1.0 mi',
    priceLevel: '$$$',
    lat: 40.7549,
    lng: -73.984,
  },
];

const restaurantMap = new Map(RESTAURANTS.map((r) => [r.id, r]));

export function getRestaurant(id: string): Restaurant | undefined {
  return restaurantMap.get(id);
}
