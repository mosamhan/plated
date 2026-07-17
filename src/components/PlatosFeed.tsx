import { useEffect, useRef, useState } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, RefreshControl, Text, View } from 'react-native';

import { PlatoReel } from '@/components/PlatoReel';
import { PlatoVideo } from '@/data/platos';
import { usePlatos } from '@/store/PlatosContext';

/** Vertical, full-screen, snap-paged reels — only the visible clip plays. */
export function PlatosFeed({ bottomInset }: { bottomInset: number }) {
  const { platos, refresh, refreshTick } = usePlatos();
  const [containerH, setContainerH] = useState(0);
  const [current, setCurrent] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const listRef = useRef<FlatList<PlatoVideo>>(null);

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
      {containerH > 0 && platos.length > 0 && (
        <FlatList
          ref={listRef}
          data={platos}
          keyExtractor={(v) => v.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          onMomentumScrollEnd={onScrollEnd}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" colors={['#fff']} />
          }
          getItemLayout={(_, index) => ({ length: containerH, offset: containerH * index, index })}
          renderItem={({ item, index }) => (
            <PlatoReel video={item} active={index === current} height={containerH} bottomInset={bottomInset} />
          )}
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
