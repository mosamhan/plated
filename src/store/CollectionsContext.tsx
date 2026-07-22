import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { showAlert } from '@/lib/dialog';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/store/AuthContext';

/** A saved item can be a restaurant, a plate (order), or a plato (reel). */
export type SavedItemType = 'restaurant' | 'plate' | 'plato';

export interface SavedItem {
  type: SavedItemType;
  id: string;
}

export interface Collection {
  id: string;
  name: string;
  items: SavedItem[];
}

interface CollectionsContextValue {
  collections: Collection[];
  loading: boolean;
  /** Every collection that contains this item (for the Save-to picker checkmarks). */
  collectionsWith: (item: SavedItem) => Collection[];
  /** True if the item is saved to at least one collection. */
  isSaved: (item: SavedItem) => boolean;
  /** Add/remove an item to/from a specific collection (optimistic, persisted). */
  toggleInCollection: (collectionId: string, item: SavedItem) => void;
  /** Create a new named list; optionally seed it with one item. Returns its id. */
  createCollection: (name: string, firstItem?: SavedItem) => Promise<string | null>;
  /** Rename / delete a list. */
  renameCollection: (collectionId: string, name: string) => void;
  deleteCollection: (collectionId: string) => void;
}

const CollectionsContext = createContext<CollectionsContextValue | undefined>(undefined);

// The two lists every account starts with (mirrors the DB trigger in
// 0005_collections.sql so demo mode matches live mode).
const STARTER_NAMES = ['Want to try', 'Favorites'] as const;

function seedDemoCollections(): Collection[] {
  return STARTER_NAMES.map((name, i) => ({ id: `demo-c${i}`, name, items: [] }));
}

const sameItem = (a: SavedItem, b: SavedItem) => a.type === b.type && a.id === b.id;

export function CollectionsProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const live = isSupabaseConfigured;

  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState<boolean>(live);

  // ── Load from Supabase (collections + their items in two reads) ─────────────
  const loadFromSupabase = useCallback(async () => {
    setLoading(true);
    const { data: cols, error } = await supabase
      .from('collections')
      .select('id, name, created_at, collection_items(item_type, item_id)')
      .order('created_at', { ascending: true });
    if (error || !cols) {
      if (__DEV__) console.warn('[Plated] collections load failed', error);
      // Fall back to empty starter lists so the picker still works offline.
      setCollections(seedDemoCollections());
      setLoading(false);
      return;
    }
    setCollections(
      cols.map((c: any) => ({
        id: c.id,
        name: c.name,
        items: (c.collection_items ?? []).map((it: any) => ({
          type: it.item_type as SavedItemType,
          id: it.item_id,
        })),
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!live) {
      setCollections(seedDemoCollections());
      setLoading(false);
      return;
    }
    if (userId) loadFromSupabase().catch(() => setLoading(false));
    else {
      // Signed out under a live config — nothing to show yet.
      setCollections([]);
      setLoading(false);
    }
  }, [live, userId, loadFromSupabase]);

  const collectionsWith = useCallback(
    (item: SavedItem) => collections.filter((c) => c.items.some((i) => sameItem(i, item))),
    [collections],
  );
  const isSaved = useCallback(
    (item: SavedItem) => collections.some((c) => c.items.some((i) => sameItem(i, item))),
    [collections],
  );

  const toggleInCollection = useCallback(
    (collectionId: string, item: SavedItem) => {
      const col = collections.find((c) => c.id === collectionId);
      if (!col) return;
      const has = col.items.some((i) => sameItem(i, item));

      // Optimistic update.
      setCollections((prev) =>
        prev.map((c) =>
          c.id !== collectionId
            ? c
            : {
                ...c,
                items: has ? c.items.filter((i) => !sameItem(i, item)) : [...c.items, item],
              },
        ),
      );

      if (!live || !userId) return;
      const revert = () =>
        setCollections((prev) =>
          prev.map((c) =>
            c.id !== collectionId
              ? c
              : {
                  ...c,
                  items: has ? [...c.items, item] : c.items.filter((i) => !sameItem(i, item)),
                },
          ),
        );

      if (has) {
        supabase
          .from('collection_items')
          .delete()
          .eq('collection_id', collectionId)
          .eq('item_type', item.type)
          .eq('item_id', item.id)
          .then(({ error }) => {
            if (error) {
              if (__DEV__) console.warn('[Plated] unsave failed', error);
              revert();
            }
          });
      } else {
        supabase
          .from('collection_items')
          .insert({ collection_id: collectionId, item_type: item.type, item_id: item.id })
          .then(({ error }) => {
            if (error) {
              if (__DEV__) console.warn('[Plated] save failed', error);
              revert();
            }
          });
      }
    },
    [collections, live, userId],
  );

  const createCollection = useCallback(
    async (name: string, firstItem?: SavedItem): Promise<string | null> => {
      const trimmed = name.trim();
      if (!trimmed) return null;

      if (!live || !userId) {
        const id = `demo-c${Date.now()}`;
        setCollections((prev) => [...prev, { id, name: trimmed, items: firstItem ? [firstItem] : [] }]);
        return id;
      }

      const { data, error } = await supabase
        .from('collections')
        .insert({ user_id: userId, name: trimmed })
        .select('id')
        .single();
      if (error || !data) {
        if (__DEV__) console.warn('[Plated] create collection failed', error);
        showAlert('Could not create list', 'Something went wrong — please try again.');
        return null;
      }
      const id = data.id as string;
      setCollections((prev) => [...prev, { id, name: trimmed, items: [] }]);
      if (firstItem) toggleInCollection(id, firstItem);
      return id;
    },
    [live, userId, toggleInCollection],
  );

  const renameCollection = useCallback(
    (collectionId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const prevName = collections.find((c) => c.id === collectionId)?.name;
      setCollections((prev) => prev.map((c) => (c.id === collectionId ? { ...c, name: trimmed } : c)));
      if (!live || !userId) return;
      supabase
        .from('collections')
        .update({ name: trimmed })
        .eq('id', collectionId)
        .then(({ error }) => {
          if (error) {
            if (__DEV__) console.warn('[Plated] rename collection failed', error);
            if (prevName != null)
              setCollections((prev) => prev.map((c) => (c.id === collectionId ? { ...c, name: prevName } : c)));
          }
        });
    },
    [collections, live, userId],
  );

  const deleteCollection = useCallback(
    (collectionId: string) => {
      const removed = collections.find((c) => c.id === collectionId);
      setCollections((prev) => prev.filter((c) => c.id !== collectionId));
      if (!live || !userId) return;
      supabase
        .from('collections')
        .delete()
        .eq('id', collectionId)
        .then(({ error }) => {
          if (error) {
            if (__DEV__) console.warn('[Plated] delete collection failed', error);
            if (removed) setCollections((prev) => [...prev, removed]);
          }
        });
    },
    [collections, live, userId],
  );

  const value = useMemo(
    () => ({
      collections,
      loading,
      collectionsWith,
      isSaved,
      toggleInCollection,
      createCollection,
      renameCollection,
      deleteCollection,
    }),
    [collections, loading, collectionsWith, isSaved, toggleInCollection, createCollection, renameCollection, deleteCollection],
  );

  return <CollectionsContext.Provider value={value}>{children}</CollectionsContext.Provider>;
}

export function useCollections(): CollectionsContextValue {
  const ctx = useContext(CollectionsContext);
  if (!ctx) throw new Error('useCollections must be used within a CollectionsProvider');
  return ctx;
}
