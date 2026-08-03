/**
 * Directions in Plated draw a line on the Explore map rather than handing off to
 * a maps app — but only Explore owns that map. Screens without one (the
 * restaurant screen, search) send the destination over as route params and let
 * Explore draw it.
 *
 * The destination travels whole rather than as an id to look up: search can
 * offer Directions for a Foursquare place Plated has no row for, and Explore
 * would have nothing to resolve. `id` rides along when a row does exist, so the
 * map can still ring the right pin.
 *
 * The only remaining hand-off to a maps app is Navigate, inside the route's
 * steps sheet, where turn-by-turn is the actual ask.
 */
export interface RouteTarget {
  id?: string;
  name: string;
  lat: number;
  lng: number;
}

/**
 * Open a restaurant on the Discover map — the map moves to it and its card
 * opens. Used from the feed, where "where is this?" is the question a detail
 * screen answers worse than a map does.
 */
export function exploreFocusHref(restaurantId: string) {
  return { pathname: '/(tabs)/explore' as const, params: { focusId: restaurantId } };
}

/** `router.navigate(exploreRouteHref(dest))` to draw a route on the Explore map. */
export function exploreRouteHref(dest: RouteTarget) {
  return {
    pathname: '/(tabs)/explore' as const,
    params: {
      routeId: dest.id,
      routeName: dest.name,
      routeLat: String(dest.lat),
      routeLng: String(dest.lng),
    },
  };
}
