import { useMemo } from 'react';

import { PlatoVideo } from '@/data/platos';
import { Order, Restaurant } from '@/data/types';
import { Collection } from '@/store/CollectionsContext';
import { useData } from '@/store/DataContext';
import { usePlatos } from '@/store/PlatosContext';

export interface CollectionContents {
  plates: Order[];
  platos: PlatoVideo[];
  restaurants: Restaurant[];
  /** Items that still resolve to something renderable (a saved plate can vanish). */
  total: number;
  /** Cover images in save order — powers the previews on a collection row. */
  covers: string[];
}

/**
 * Resolves a collection's saved ids into the real plates / platos / restaurants.
 * Lives outside CollectionsContext so that context stays a pure store — this
 * hook is the one place that joins it against DataContext and PlatosContext.
 */
export function useCollectionContents(collection?: Collection): CollectionContents {
  const { orders, restaurantFor } = useData();
  const { platos } = usePlatos();

  return useMemo(() => {
    const plates: Order[] = [];
    const savedPlatos: PlatoVideo[] = [];
    const restaurants: Restaurant[] = [];
    const covers: string[] = [];

    for (const item of collection?.items ?? []) {
      if (item.type === 'plate') {
        const order = orders.find((o) => o.id === item.id);
        if (order) {
          plates.push(order);
          covers.push(order.photo);
        }
      } else if (item.type === 'plato') {
        const plato = platos.find((p) => p.id === item.id);
        if (plato) {
          savedPlatos.push(plato);
          covers.push(plato.poster);
        }
      } else {
        const restaurant = restaurantFor(item.id);
        if (restaurant) {
          restaurants.push(restaurant);
          covers.push(restaurant.image);
        }
      }
    }

    return {
      plates,
      platos: savedPlatos,
      restaurants,
      total: plates.length + savedPlatos.length + restaurants.length,
      covers,
    };
  }, [collection, orders, platos, restaurantFor]);
}
