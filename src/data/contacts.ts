import { avatar } from '@/data/images';
import { Contact } from '@/data/types';

/** Phone contacts surfaced as "suggested friends" on the home page. */
export const CONTACTS: Contact[] = [
  { id: 'c1', name: 'Jordan Webb', handle: 'jwebb', avatar: avatar(60), onPlated: true, mutualFriends: 8 },
  { id: 'c2', name: 'Mia Torres', handle: 'miatorres', avatar: avatar(47), onPlated: true, mutualFriends: 5 },
  { id: 'c3', name: 'Leo Park', handle: 'leopark', avatar: avatar(53), onPlated: true, mutualFriends: 12 },
  { id: 'c4', name: 'Grace Kim', handle: 'gracek', avatar: avatar(31), onPlated: false, mutualFriends: 3 },
  { id: 'c5', name: 'Noah Bennett', handle: 'noahb', avatar: avatar(13), onPlated: true, mutualFriends: 2 },
  { id: 'c6', name: 'Ella Rivera', handle: 'ellariv', avatar: avatar(20), onPlated: false, mutualFriends: 6 },
];
