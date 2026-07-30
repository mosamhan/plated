import { useCallback, useEffect, useState } from 'react';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { Collection, SavedItemType } from '@/store/CollectionsContext';

const SELECT = 'id, name, is_private, created_at, collection_items(item_type, item_id)';

function mapRows(rows: any[]): Collection[] {
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    isPrivate: c.is_private ?? true,
    items: (c.collection_items ?? []).map((it: any) => ({
      type: it.item_type as SavedItemType,
      id: it.item_id,
    })),
  }));
}

/**
 * Someone else's shared lists, for their profile. RLS (0008) does the filtering:
 * a private list simply isn't returned, so this never needs to trust the client.
 * Use CollectionsContext for the signed-in user's own lists instead — those are
 * already loaded and stay in sync with saves.
 */
export function usePublicCollections(userId: string): { collections: Collection[]; loading: boolean } {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setCollections([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from('collections')
      .select(SELECT)
      .eq('user_id', userId)
      .eq('is_private', false)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          if (__DEV__) console.warn('[Plated] public collections load failed', error);
          setCollections([]);
        } else {
          setCollections(mapRows(data));
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { collections, loading };
}

/**
 * A single list by id, for opening one that isn't in your own context — i.e.
 * someone else's public list. Returns null once the fetch has come back empty,
 * which RLS also produces for a list that exists but is private.
 */
export function useCollectionById(
  id: string | undefined,
  skip: boolean,
): { collection: Collection | null; loading: boolean } {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id || skip || !isSupabaseConfigured) {
      setCollection(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.from('collections').select(SELECT).eq('id', id).maybeSingle();
    if (error || !data) {
      if (__DEV__ && error) console.warn('[Plated] collection load failed', error);
      setCollection(null);
    } else {
      setCollection(mapRows([data])[0]);
    }
    setLoading(false);
  }, [id, skip]);

  useEffect(() => {
    load();
  }, [load]);

  return { collection, loading };
}
