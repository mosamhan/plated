import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, RefreshControl, Text, View } from 'react-native';

import { PlatoReel } from '@/components/PlatoReel';
import { SponsoredReelCard } from '@/components/SponsoredReelCard';
import { PlatoVideo } from '@/data/platos';
import { SponsoredPlacement } from '@/data/types';
import { useData } from '@/store/DataContext';
import { usePlatos } from '@/store/PlatosContext';

// One ad per this many organic reels — the plan's own "every 5 to 7 reels",
// landing in the middle of that range.
const REEL_AD_GAP = 6;

type ReelItem = { type: 'plato'; video: PlatoVideo } | { type: 'ad'; placement: SponsoredPlacement; key: string };

/** Vertical, full-screen, snap-paged reels — only the visible clip plays. */
export function PlatosFeed({
  bottomInset,
  onRestaurantPress,
}: {
  bottomInset: number;
  /** Opens the reel's restaurant in the same sheet a map pin opens. */
  onRestaurantPress?: (restaurantId: string) => void;
}) {
  const { platos: allPlatos, refresh, refreshTick } = usePlatos();
  const { placementsFor } = useData();
  // Archived Platos reach the client only for their author (RLS); keep them out
  // of the feed even for the author — they live on the profile grid instead.
  const platos = allPlatos.filter((p) => !p.archived);
  const reelAds = placementsFor('reel_ad');
  // Stable key: recomputes only when the set of videos changes, not on every
  // like/comment count update — same convention as the home feed's orderKey.
  const platoKey = platos.map((p) => p.id).join(',');

  // Cycles through whatever reel ads are live, one every REEL_AD_GAP videos —
  // never inserted after the last video, so a scroll never ends on an ad.
  const items = useMemo<ReelItem[]>(() => {
    if (reelAds.length === 0) return platos.map((video) => ({ type: 'plato', video }));
    const out: ReelItem[] = [];
    let adIdx = 0;
    platos.forEach((video, i) => {
      out.push({ type: 'plato', video });
      if (i < platos.length - 1 && (i + 1) % REEL_AD_GAP === 0) {
        out.push({ type: 'ad', placement: reelAds[adIdx % reelAds.length], key: `ad-${i}` });
        adIdx += 1;
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platoKey, reelAds]);

  const [containerH, setContainerH] = useState(0);
  const [current, setCurrent] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const listRef = useRef<FlatList<ReelItem>>(null);

  // A refresh reshuffles the feed — snap back to the first reel so the new order is seen.
  useEffect(() => {
    if (containerH > 0) {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      setCurrent(0);
    }
  }, [refreshTick, containerH]);

  // Pull down at the top to reshuffle the feed.
  const onRefresh = () => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 650);
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (containerH > 0) setCurrent(Math.round(e.nativeEvent.contentOffset.y / containerH));
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} onLayout={(e) => setContainerH(e.nativeEvent.layout.height)}>
      {containerH > 0 && items.length > 0 && (
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(item) => (item.type === 'plato' ? item.video.id : item.key)}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          onMomentumScrollEnd={onScrollEnd}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" colors={['#fff']} />
          }
          getItemLayout={(_, index) => ({ length: containerH, offset: containerH * index, index })}
          renderItem={({ item, index }) =>
            item.type === 'plato' ? (
              <PlatoReel
                video={item.video}
                active={index === current}
                height={containerH}
                bottomInset={bottomInset}
                onRestaurantPress={onRestaurantPress}
                onEnded={() => {
                  if (index < items.length - 1) {
                    listRef.current?.scrollToOffset({ offset: containerH * (index + 1), animated: true });
                  }
                }}
              />
            ) : (
              <SponsoredReelCard placement={item.placement} height={containerH} bottomInset={bottomInset} />
            )
          }
        />
      )}
      {containerH > 0 && platos.length === 0 && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '600', textAlign: 'center' }}>
            No Platos yet — be the first to post one.
          </Text>
        </View>
      )}
    </View>
  );
}
