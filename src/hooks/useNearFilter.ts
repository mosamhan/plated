import { useCallback } from 'react';

import { distanceKm, NEAR_RADIUS_KM } from '@/lib/geo';

export type DiscoverScope = 'near' | 'global';

/**
 * The near/global predicate shared by Discover's grid, rails, and "see all"
 * screens (mirrors the pattern `RanksView`'s own `withinRange` established):
 * `global` or a missing origin never filters — everything shows rather than
 * nothing — `near` requires the place to have coordinates within
 * `NEAR_RADIUS_KM` of `origin`.
 */
export function useNearFilter(scope: DiscoverScope, origin: { lat: number; lng: number } | null) {
  return useCallback(
    (place?: { lat?: number | null; lng?: number | null }) => {
      if (scope !== 'near' || !origin) return true;
      if (place?.lat == null || place?.lng == null) return false;
      return distanceKm(origin, { lat: place.lat, lng: place.lng }) <= NEAR_RADIUS_KM;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, origin?.lat, origin?.lng],
  );
}
