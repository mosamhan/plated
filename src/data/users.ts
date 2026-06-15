import { avatar } from '@/data/images';
import { User } from '@/data/types';

/** The signed-in user is always id 'me'. */
export const CURRENT_USER_ID = 'me';

export const USERS: User[] = [
  {
    id: 'me',
    name: 'Sam Han',
    handle: 'samhan',
    avatar: avatar(12),
    bio: 'NYC eats • always chasing the perfect bite 🍜',
    verified: false,
    followers: 482,
    following: 311,
    friends: 96,
    socials: { instagram: 'samhan.eats', tiktok: 'samhaneats' },
    compensationEligible: false,
    estimatedEarnings: 0,
  },
  {
    id: 'u1',
    name: 'Olivia Chen',
    handle: 'oliviaeats',
    avatar: avatar(5),
    bio: 'Food writer. I rate the dish, not the vibe. 📍NYC',
    verified: true,
    followers: 128400,
    following: 612,
    friends: 240,
    socials: { instagram: 'oliviaeats', tiktok: 'oliviaeats', youtube: 'OliviaEats' },
    compensationEligible: true,
    estimatedEarnings: 3120,
  },
  {
    id: 'u2',
    name: 'Marcus Reed',
    handle: 'marcuseats',
    avatar: avatar(33),
    bio: 'Burgers, ramen, repeat. Pickup only purist.',
    verified: true,
    followers: 54200,
    following: 388,
    friends: 175,
    socials: { instagram: 'marcuseats', youtube: 'MarcusReedFood' },
    compensationEligible: true,
    estimatedEarnings: 1480,
  },
  {
    id: 'u3',
    name: 'Priya Nair',
    handle: 'priyatastes',
    avatar: avatar(9),
    bio: 'Spice maximalist. Will travel for good dosa.',
    verified: true,
    followers: 91300,
    following: 502,
    friends: 210,
    socials: { instagram: 'priyatastes', tiktok: 'priyatastes' },
    compensationEligible: true,
    estimatedEarnings: 2240,
  },
  {
    id: 'u4',
    name: 'Diego Santos',
    handle: 'diegobites',
    avatar: avatar(15),
    bio: 'Taquero at heart 🌮 rating every al pastor in the city.',
    verified: false,
    followers: 8700,
    following: 430,
    friends: 150,
    socials: { instagram: 'diegobites', tiktok: 'diegobites' },
    // 8.7K followers — below the 10K program threshold, so not eligible.
    compensationEligible: false,
    estimatedEarnings: 0,
  },
  {
    id: 'u5',
    name: 'Hannah Liu',
    handle: 'hannahnoms',
    avatar: avatar(44),
    bio: 'Dessert first. Brunch always.',
    verified: false,
    followers: 2100,
    following: 280,
    friends: 88,
    socials: { instagram: 'hannahnoms' },
    compensationEligible: false,
    estimatedEarnings: 0,
  },
  {
    id: 'u6',
    name: 'Theo Brooks',
    handle: 'theoeats',
    avatar: avatar(51),
    bio: 'Slow-smoked everything. BBQ scout.',
    verified: false,
    followers: 640,
    following: 190,
    friends: 60,
    socials: {},
    compensationEligible: false,
    estimatedEarnings: 0,
  },
  {
    id: 'u7',
    name: 'Aisha Khan',
    handle: 'aishaeats',
    avatar: avatar(24),
    bio: 'Halal cart connoisseur • golden bbq sauce evangelist',
    verified: true,
    followers: 47600,
    following: 350,
    friends: 198,
    socials: { instagram: 'aishaeats', tiktok: 'aishaeats', youtube: 'AishaEats' },
    compensationEligible: true,
    estimatedEarnings: 1190,
  },
];

const userMap = new Map(USERS.map((u) => [u.id, u]));

/**
 * Resolve a user for display alongside content. Falls back to the first user
 * only for internal joins where ids are known-valid (orders/comments).
 * For route params use {@link findUser} and handle the miss.
 */
export function getUser(id: string): User {
  return userMap.get(id) ?? USERS[0];
}

export function findUser(id: string): User | undefined {
  return userMap.get(id);
}
