import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PersonRow } from '@/components/PersonRow';
import { PlateTile } from '@/components/PlateTile';
import { PlatoTile } from '@/components/PlatoTile';
import { RatingBadge } from '@/components/RatingBadge';
import { RestaurantDetailSheet } from '@/components/RestaurantDetailSheet';
import { TextField } from '@/components/TextField';
import { UnderlineTabs } from '@/components/UnderlineTabs';
import { Restaurant, User } from '@/data/types';
import { showAlert } from '@/lib/dialog';
import { isPlacesConfigured, PlaceResult, searchPlaces } from '@/lib/places';
import { expandPlatoPlates } from '@/lib/platos';
import { rankWithDistance, scoreTextMatch } from '@/lib/search';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useCollections } from '@/store/CollectionsContext';
import { useData } from '@/store/DataContext';
import { useLocation } from '@/store/LocationContext';
import { usePlatos } from '@/store/PlatosContext';
import { radius, spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

type Tab = 'All' | 'Plates' | 'Platos' | 'Restaurants' | 'People';
const TABS: Tab[] = ['All', 'Plates', 'Platos', 'Restaurants', 'People'];

const GAP = spacing.md;
const PADDING = spacing.lg;
/** How many of each type the All tab shows before "see more in <tab>". */
const ALL_TAB_CAP = 4;

/**
 * Full-screen search — the app's one place to find anything by free text:
 * plates, Platos, restaurants (on Plated or not) and people. Nearby-first,
 * not nearby-only (see `rankWithDistance`), and separate from the map's own
 * restaurant-only search reached from inside the expanded map — that one
 * stays exactly as it was.
 */
export default function Search() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const tileWidth = (windowWidth - PADDING * 2 - GAP) / 2;
  const {
    searchRestaurants,
    restaurantWithRating,
    searchPlates,
    searchUsers,
    currentUser,
    ordersByRestaurant,
    userFor,
    ensureRestaurant,
    exploreOrders,
  } = useData();
  const { searchPlatos, platos: allPlatos } = usePlatos();
  const { openSaveSheet } = useCollections();
  const { location, placeQuery } = useLocation();
  // Seeded from ?q= so pressing enter in Explore's inline search lands here
  // with the term already run, rather than making the user retype it.
  // `tab` lets Discover's "See all" links open straight into Plates or
  // Platos rather than dropping you on All to find them again.
  const { q: initialQuery, tab: initialTab } = useLocalSearchParams<{ q?: string; tab?: string }>();
  const [query, setQuery] = useState(initialQuery ?? '');
  const [tab, setTab] = useState<Tab>(TABS.includes(initialTab as Tab) ? (initialTab as Tab) : 'All');
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  // A place Foursquare knows about that isn't on Plated yet — shown in the
  // same preview sheet the map's own search uses (see RestaurantDetailSheet's
  // `preview` mode), not a second bespoke card.
  const [previewPlace, setPreviewPlace] = useState<PlaceResult | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const q = query.trim();
  const locationOrigin = location.lat != null && location.lng != null ? { lat: location.lat, lng: location.lng } : null;

  // Recent Searches — this user's own past terms, newest first. Read-only:
  // `search_queries` has no delete policy by design (see 0044); the 'x' on
  // each row only drops it from this list for the session, it doesn't delete
  // the row.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase
      .from('search_queries')
      .select('query, created_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (!data) return;
        const seen = new Set<string>();
        const distinct: string[] = [];
        for (const row of data) {
          const term = row.query.trim();
          if (!term || seen.has(term.toLowerCase())) continue;
          seen.add(term.toLowerCase());
          distinct.push(term);
          if (distinct.length >= 8) break;
        }
        setRecent(distinct);
      });
  }, [currentUser.id]);

  /**
   * Arriving from a "See all" link means a tab with no query — browse mode.
   * Without this the screen would open on the tab you asked for and show
   * nothing, which is the opposite of "see all".
   */
  const browsing = q.length === 0 && tab !== 'All';

  const plates = useMemo(
    () => (q ? searchPlates(q) : browsing ? exploreOrders('All') : []),
    [q, browsing, searchPlates, exploreOrders],
  );
  const platos = useMemo(
    () => (q ? searchPlatos(q) : browsing ? allPlatos.filter((p) => !p.archived) : []),
    [q, browsing, searchPlatos, allPlatos],
  );
  const onPlated = useMemo(() => {
    if (!q) return [];
    return rankWithDistance(searchRestaurants(q), {
      score: (r) => scoreTextMatch(r.name, q, r.cuisine),
      coords: (r) => (r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : undefined),
      rating: (r) => restaurantWithRating(r.id)?.platedRating,
      origin: locationOrigin,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, searchRestaurants, restaurantWithRating, location.lat, location.lng]);

  // Name/handle matches, plus anyone who's rated a plate at the best-matching
  // restaurant — searching "3 Arts Club" should surface who's been there, not
  // just people whose own name happens to contain the term.
  const people = useMemo(() => {
    const base = searchUsers(q);
    if (onPlated.length === 0) return base;
    const seen = new Set(base.map((u) => u.id));
    const raters: User[] = [];
    for (const o of ordersByRestaurant(onPlated[0].id)) {
      if (seen.has(o.userId)) continue;
      seen.add(o.userId);
      raters.push(userFor(o.userId));
    }
    return [...base, ...raters];
  }, [q, searchUsers, onPlated, ordersByRestaurant, userFor]);

  const runSearch = async (term: string) => {
    if (!isPlacesConfigured) return;
    setSearching(true);
    setPlaces(await searchPlaces(term.trim() || 'restaurant', placeQuery));
    setSearching(false);
  };

  // Live typeahead — search as you type (debounced), no Enter required.
  useEffect(() => {
    if (!isPlacesConfigured) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => runSearch(query), 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, placeQuery.ll, placeQuery.near]);

  // Anything already on Plated is shown from our own data — drop the
  // Foursquare duplicate rather than listing the same place twice.
  const platedNames = new Set(onPlated.map((r) => r.name.toLowerCase()));
  const external = places.filter((p) => !platedNames.has(p.name.toLowerCase()));

  // Same hand-off the map's own search uses for a place Plated doesn't have
  // yet: "plate" starts a post at it, "save" promotes it to a real row first.
  const adoptPreview = async (place: PlaceResult, then: 'save' | 'plate') => {
    if (then === 'plate') {
      setPreviewPlace(null);
      const enc = (s: string) => encodeURIComponent(s);
      router.push(
        `/create?fsqId=${enc(place.fsqId)}&fsqName=${enc(place.name)}&fsqCuisine=${enc(place.cuisine)}&fsqLocation=${enc(place.location)}`,
      );
      return;
    }
    const id = await ensureRestaurant(place);
    if (!id) {
      showAlert('Could not save this place', 'Please try again in a moment.');
      return;
    }
    setPreviewPlace(null);
    openSaveSheet({ type: 'restaurant', id });
  };

  /** One tile per plate covered, so a multi-dish Plato is findable by any of
   *  its dishes rather than only its headline one. */
  const platoTiles = useMemo(() => platos.flatMap(expandPlatoPlates), [platos]);

  const nothing =
    q.length > 0 &&
    !searching &&
    onPlated.length === 0 &&
    external.length === 0 &&
    plates.length === 0 &&
    platos.length === 0 &&
    people.length === 0;

  const renderRestaurantRow = (item: { kind: 'db'; restaurant: Restaurant } | { kind: 'fsq'; place: PlaceResult }) => {
    if (item.kind === 'db') {
      const withRating = restaurantWithRating(item.restaurant.id);
      return (
        <Pressable
          key={item.restaurant.id}
          // Same as everywhere else a restaurant is opened from outside the
          // map (home feed, collections, Ranks, an order, a Plato): a pushed
          // screen whose own body is blank behind the sheet, which is what
          // makes the sheet read as popping up over "this" screen rather than
          // the one you tapped from.
          onPress={() => router.push(`/restaurant/${item.restaurant.id}`)}
          style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Image source={{ uri: item.restaurant.image }} style={[styles.img, { backgroundColor: colors.surface }]} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{item.restaurant.name}</Text>
            <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
              {item.restaurant.cuisine}{item.restaurant.location ? ` · ${item.restaurant.location}` : ''}
            </Text>
          </View>
          {withRating && withRating.orderCount > 0 && <RatingBadge score={withRating.platedRating} size="sm" />}
        </Pressable>
      );
    }
    return (
      <Pressable
        key={item.place.fsqId}
        onPress={() => setPreviewPlace(item.place)}
        style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.venueIcon, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="restaurant" size={20} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{item.place.name}</Text>
          <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
            {item.place.cuisine}{item.place.location ? ` · ${item.place.location}` : ''}
          </Text>
        </View>
        <Text style={[styles.notYet, { color: colors.textMuted }]}>Not rated yet</Text>
      </Pressable>
    );
  };

  const renderPlateGrid = (items: typeof plates) => (
    <View style={styles.grid}>
      {items.map((order) => (
        <PlateTile key={order.id} order={order} width={tileWidth} />
      ))}
    </View>
  );

  const renderPlatoGrid = (items: typeof platoTiles) => (
    <View style={styles.grid}>
      {items.map((t) => (
        <PlatoTile
          key={t.key}
          video={t.video}
          width={tileWidth}
          titleOverride={t.title}
          ratingOverride={t.rating}
        />
      ))}
    </View>
  );

  const seeMore = (label: string, count: number, target: Tab) =>
    count > ALL_TAB_CAP && (
      <Pressable onPress={() => setTab(target)} hitSlop={8} style={{ alignSelf: 'flex-start', marginBottom: spacing.md }}>
        <Text style={[styles.seeMore, { color: colors.accent }]}>See all {count} {label}</Text>
      </Pressable>
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ paddingRight: 4 }}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <TextField
            icon="search"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            placeholder="Search plates, Platos, restaurants, people"
            autoFocus
            style={{ paddingVertical: 8 }}
          />
        </View>
      </View>

      {(q.length > 0 || browsing) && <UnderlineTabs tabs={TABS} value={tab} onChange={setTab} />}

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 60, paddingTop: spacing.sm }}>
        {q.length === 0 && tab === 'All' && (
          <>
            <Text style={[styles.section, { color: colors.text, marginTop: 0 }]}>Recent Searches</Text>
            {recent.length === 0 ? (
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                Nothing searched yet — try a dish, a place, or a person.
              </Text>
            ) : (
              recent.map((term) => (
                <View key={term} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Pressable onPress={() => setQuery(term)} style={styles.recentTap} hitSlop={{ top: 8, bottom: 8 }}>
                    <View style={[styles.venueIcon, { backgroundColor: colors.surface }]}>
                      <Ionicons name="time-outline" size={18} color={colors.textMuted} />
                    </View>
                    <Text style={[styles.name, { color: colors.text, flex: 1 }]} numberOfLines={1}>{term}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setRecent((prev) => prev.filter((t) => t !== term))}
                    hitSlop={8}
                    style={styles.recentRemove}>
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
              ))
            )}
          </>
        )}

        {q.length > 0 && nothing && (
          <Text style={[styles.hint, { color: colors.textMuted, marginTop: spacing.lg }]}>
            Nothing matches “{q}” yet — on Plated or anywhere we can see.
          </Text>
        )}

        {q.length > 0 && (tab === 'All' || tab === 'Restaurants') && onPlated.length > 0 && (
          <>
            <Text style={[styles.section, { color: colors.text, marginTop: 0 }]}>Restaurants</Text>
            {(tab === 'All' ? onPlated.slice(0, ALL_TAB_CAP) : onPlated).map((restaurant) =>
              renderRestaurantRow({ kind: 'db', restaurant }),
            )}
            {tab === 'All' && seeMore('restaurants', onPlated.length, 'Restaurants')}
          </>
        )}

        {q.length > 0 && (tab === 'All' || tab === 'Restaurants') && (external.length > 0 || searching) && (
          <>
            <View style={styles.fsqHead}>
              <Text style={[styles.section, { color: colors.text, marginTop: onPlated.length > 0 ? spacing.lg : 0, marginBottom: 0 }]}>
                Restaurants not on Plated
              </Text>
              {searching && <ActivityIndicator size="small" color={colors.accent} />}
            </View>
            {(tab === 'All' ? external.slice(0, ALL_TAB_CAP) : external).map((place) =>
              renderRestaurantRow({ kind: 'fsq', place }),
            )}
            {tab === 'All' && seeMore('places', external.length, 'Restaurants')}
          </>
        )}

        {/* Plates and Platos get their own sections rather than one mixed
            grid: a plate tile is square and a Plato tile is portrait, so
            interleaving them left every row ragged with the shorter tile
            floating against a gap. */}
        {(q.length > 0 || browsing) && (tab === 'All' || tab === 'Plates') && plates.length > 0 && (
          <>
            <Text style={[styles.section, { color: colors.text }]}>Plates</Text>
            {renderPlateGrid(tab === 'All' ? plates.slice(0, ALL_TAB_CAP) : plates)}
            {tab === 'All' && seeMore('plates', plates.length, 'Plates')}
          </>
        )}

        {(q.length > 0 || browsing) && (tab === 'All' || tab === 'Platos') && platoTiles.length > 0 && (
          <>
            <Text style={[styles.section, { color: colors.text }]}>Platos</Text>
            {renderPlatoGrid(tab === 'All' ? platoTiles.slice(0, ALL_TAB_CAP) : platoTiles)}
            {tab === 'All' && seeMore('Platos', platoTiles.length, 'Platos')}
          </>
        )}

        {q.length > 0 && (tab === 'All' || tab === 'People') && people.length > 0 && (
          <>
            <Text style={[styles.section, { color: colors.text }]}>People</Text>
            {(tab === 'All' ? people.slice(0, ALL_TAB_CAP) : people).map((u, i, arr) => (
              <PersonRow key={u.id} user={u} last={i === arr.length - 1} />
            ))}
            {tab === 'All' && seeMore('people', people.length, 'People')}
          </>
        )}
      </ScrollView>

      {/* The same preview sheet the map's own search uses for a place that
          isn't on Plated yet — "Rate a plate here" / "Save" / "Directions". */}
      <RestaurantDetailSheet restaurantId={null} preview={previewPlace} onClose={() => setPreviewPlace(null)} onAdopt={adoptPreview} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingBottom: 4 },
  section: { ...typography.heading, marginTop: spacing.lg, marginBottom: spacing.md },
  seeMore: { fontSize: 13, fontWeight: '800' },
  fsqHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.md, justifyContent: 'space-between' },
  hint: { fontSize: 13, fontWeight: '500', lineHeight: 19, marginTop: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  recentTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  recentRemove: { padding: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginBottom: spacing.md },
  img: { width: 54, height: 54, borderRadius: radius.md },
  venueIcon: { width: 54, height: 54, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  notYet: { fontSize: 11, fontWeight: '700' },
});
