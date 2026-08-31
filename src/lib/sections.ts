import { Ionicons } from '@expo/vector-icons';

export type SectionKey = 'home' | 'platos' | 'discover' | 'profile';

/** Icon (filled/outline) + label for each pager page/bar icon. Ranks lives inside Discover's own pill; Messages is a pushed screen from the Home header — neither is a page. */
export const SECTION_META: Record<
  SectionKey,
  { icon: keyof typeof Ionicons.glyphMap; iconOutline: keyof typeof Ionicons.glyphMap; label: string }
> = {
  home: { icon: 'home', iconOutline: 'home-outline', label: 'Home' },
  // Fork + knife — Discover is where you go looking for somewhere to eat.
  discover: { icon: 'restaurant', iconOutline: 'restaurant-outline', label: 'Discover' },
  platos: { icon: 'play-circle', iconOutline: 'play-circle-outline', label: 'Platos' },
  profile: { icon: 'person', iconOutline: 'person-outline', label: 'Profile' },
};

/** Shared with PlatoReel/PlatosFeed so their chrome clears the floating bar. */
export const TAB_BAR_HEIGHT = 68;
export const TAB_BAR_BOTTOM_MARGIN = 0;
