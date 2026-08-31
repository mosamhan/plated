import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlatosFeed } from '@/components/PlatosFeed';
import { RestaurantDetailSheet } from '@/components/RestaurantDetailSheet';
import { TAB_BAR_BOTTOM_MARGIN, TAB_BAR_HEIGHT } from '@/lib/sections';
import { useDiscoverShared } from '@/store/DiscoverSharedContext';

/** Immersive vertical reels — the bottom bar and swiping are how you leave; no on-screen mode toggle needed here. */
export function PlatosContent() {
  const insets = useSafeAreaInsets();
  const { selectedRestaurant, selectedPlate, sheetSide, setSheetSide, preview, closeSheet, routeToRestaurant, startRoute, adoptPreview, openPin } =
    useDiscoverShared();

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <PlatosFeed bottomInset={insets.bottom + TAB_BAR_BOTTOM_MARGIN + TAB_BAR_HEIGHT + 8} onRestaurantPress={openPin} />

      {/* Tapping a reel's restaurant opens the same sheet as a map pin. Only
          this one overlay: Discover's own sheets/chooser are map chrome, and
          there is no map mounted here. Directions still routes in-app —
          startRoute flips to the Discover page, so the line is drawn on a
          map the user can actually see. */}
      <RestaurantDetailSheet
        restaurantId={selectedRestaurant}
        onClose={closeSheet}
        onRoute={routeToRestaurant}
        onRoutePreview={startRoute}
        plateId={selectedPlate}
        side={sheetSide}
        onSideChange={setSheetSide}
        preview={preview}
        onAdopt={adoptPreview}
      />
    </View>
  );
}
