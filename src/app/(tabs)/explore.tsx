import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useData } from '@/store/DataContext';
import { useDiscoverShared } from '@/store/DiscoverSharedContext';
import { useExploreMode } from '@/store/ExploreModeContext';
import { useMainPagerControl } from '@/store/MainPagerControl';

/**
 * Not a real screen — a redirect shim. Everywhere else in the app still links
 * here (`exploreFocusHref`/`exploreRouteHref`/`exploreModeHref` in
 * lib/inAppRoute.ts, from PlateCard, restaurant/story screens, the tab bar,
 * etc.) because Discover/Platos/Ranks used to live on this one route. Now
 * they're pages of the single pager hosted by `index.tsx`, so this file's
 * only job is: read whichever param got it here, apply it to the shared
 * state, jump the pager to the right page, and bounce back to `/(tabs)` —
 * all before paint, so it never actually renders anything visible.
 */
export default function ExploreRedirect() {
  const router = useRouter();
  const { restaurantFor } = useData();
  const { setMode } = useExploreMode();
  const { jumpTo } = useMainPagerControl();
  const { openPin, focusRestaurant, startRoute, expandMapOnRestaurant } = useDiscoverShared();
  const handled = useRef(false);

  const { routeId, routeName, routeLat, routeLng, focusId, focusExpand, mode: modeParam } = useLocalSearchParams<{
    routeId?: string;
    routeName?: string;
    routeLat?: string;
    routeLng?: string;
    focusId?: string;
    focusExpand?: string;
    mode?: string;
  }>();

  useEffect(() => {
    if (handled.current) return;

    if (modeParam === 'platos' || modeParam === 'discover' || modeParam === 'ranks') {
      handled.current = true;
      if (modeParam === 'platos') {
        jumpTo('platos');
      } else {
        setMode(modeParam);
        jumpTo('discover');
      }
      router.replace('/(tabs)');
      return;
    }

    if (focusId) {
      if (!restaurantFor(focusId)) return; // data not in yet; retry next render
      handled.current = true;
      if (focusExpand === '1') {
        // Full-screen map on the pin, no card — "Back to plate" brings it back.
        expandMapOnRestaurant(focusId);
      } else {
        openPin(focusId);
        focusRestaurant(focusId);
      }
      jumpTo('discover');
      router.replace('/(tabs)');
      return;
    }

    if (routeLat && routeLng) {
      handled.current = true;
      startRoute({
        restaurantId: routeId,
        name: routeName || 'Destination',
        lat: Number(routeLat),
        lng: Number(routeLng),
      });
      // startRoute itself jumps to Discover once the route resolves, but
      // that's async — jump now so the map is already what's on screen
      // while the route is being fetched.
      jumpTo('discover');
      router.replace('/(tabs)');
      return;
    }

    // No params at all — a bare link to /(tabs)/explore. Land on Discover.
    handled.current = true;
    jumpTo('discover');
    router.replace('/(tabs)');
    // Deliberately re-runs as params/data arrive so the focusId retry above
    // works — `handled` is what prevents acting twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeParam, focusId, focusExpand, routeId, routeName, routeLat, routeLng, restaurantFor]);

  return null;
}
