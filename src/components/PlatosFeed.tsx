import { useRef, useState } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, View } from 'react-native';

import { PlatoReel } from '@/components/PlatoReel';
import { PLATOS } from '@/data/platos';

/** Vertical, full-screen, snap-paged reels — only the visible clip plays. */
export function PlatosFeed({ bottomInset }: { bottomInset: number }) {
  const [containerH, setContainerH] = useState(0);
  const [current, setCurrent] = useState(0);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (containerH > 0) setCurrent(Math.round(e.nativeEvent.contentOffset.y / containerH));
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} onLayout={(e) => setContainerH(e.nativeEvent.layout.height)}>
      {containerH > 0 && (
        <FlatList
          data={PLATOS}
          keyExtractor={(v) => v.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          onMomentumScrollEnd={onScrollEnd}
          getItemLayout={(_, index) => ({ length: containerH, offset: containerH * index, index })}
          renderItem={({ item, index }) => (
            <PlatoReel video={item} active={index === current} height={containerH} bottomInset={bottomInset} />
          )}
        />
      )}
    </View>
  );
}
