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
  },
  {
    id: 'r2',
    name: 'Nonna Lucia',
    image: restaurantPhoto(1),
    cuisine: 'Italian',
    location: 'West Village, NYC',
    distance: '0.9 mi',
    priceLevel: '$$$',
  },
  {
    id: 'r3',
    name: 'Slurp House',
    image: restaurantPhoto(2),
    cuisine: 'Ramen',
    location: 'Lower East Side, NYC',
    distance: '1.2 mi',
    priceLevel: '$$',
  },
  {
    id: 'r4',
    name: 'Taqueria El Sol',
    image: restaurantPhoto(3),
    cuisine: 'Mexican',
    location: 'Bushwick, Brooklyn',
    distance: '2.1 mi',
    priceLevel: '$',
  },
  {
    id: 'r5',
    name: 'Sugar & Salt',
    image: restaurantPhoto(4),
    cuisine: 'Brunch & Bakery',
    location: 'SoHo, NYC',
    distance: '0.7 mi',
    priceLevel: '$$',
  },
  {
    id: 'r6',
    name: 'Spice Route',
    image: restaurantPhoto(5),
    cuisine: 'South Indian',
    location: 'Murray Hill, NYC',
    distance: '1.6 mi',
    priceLevel: '$$',
  },
  {
    id: 'r7',
    name: 'Smoke & Oak',
    image: restaurantPhoto(0),
    cuisine: 'BBQ',
    location: 'Williamsburg, Brooklyn',
    distance: '2.8 mi',
    priceLevel: '$$',
  },
  {
    id: 'r8',
    name: 'Hana Sushi',
    image: restaurantPhoto(1),
    cuisine: 'Japanese',
    location: 'Midtown, NYC',
    distance: '1.0 mi',
    priceLevel: '$$$',
  },
];

const restaurantMap = new Map(RESTAURANTS.map((r) => [r.id, r]));

export function getRestaurant(id: string): Restaurant | undefined {
  return restaurantMap.get(id);
}
