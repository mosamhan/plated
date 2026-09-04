import { supabase } from '@/lib/supabase';

export interface GifResult {
  id: string;
  title: string;
  previewUrl: string;
  fullUrl: string;
  /** Which Giphy collection this came from — set by `searchStickers` so a
   *  merged gifs+stickers feed can key each cell uniquely. */
  kind?: 'gifs' | 'stickers';
}

/**
 * One hop to the `giphy` Edge Function (search or trending, gifs or
 * stickers) — the key itself never leaves the function, same shape as
 * `places.ts`'s `callPlaces`. Degrades to an empty list on any failure
 * rather than throwing, since both callers (the manual picker sheet, the
 * predictive suggestion rail) just want "nothing to show," not a crash.
 */
export async function searchGifs(query: string, kind: 'gifs' | 'stickers' = 'gifs'): Promise<GifResult[]> {
  try {
    const { data, error } = await supabase.functions.invoke<{ results: GifResult[] }>('giphy', {
      body: query.trim() ? { op: 'search', kind, query } : { op: 'trending', kind },
    });
    if (error) {
      if (__DEV__) console.warn('[Plated] giphy search failed', error.message);
      return [];
    }
    return (data?.results ?? []).map((r) => ({ ...r, kind }));
  } catch (e) {
    if (__DEV__) console.warn('[Plated] giphy request error', e);
    return [];
  }
}

/**
 * "Stickers" in this app's own composer is one browsable/searchable feed
 * that recommends both Giphy GIFs and Giphy stickers together, rather than
 * two separate tabs the user has to switch between — they're the same kind
 * of thing (a fun animated reaction), and splitting them added a UI step
 * without adding a real distinction. Interleaved rather than concatenated so
 * the grid reads as one mixed feed, not "all GIFs, then all stickers."
 */
export async function searchStickers(query: string): Promise<GifResult[]> {
  const [gifs, stickers] = await Promise.all([searchGifs(query, 'gifs'), searchGifs(query, 'stickers')]);
  const merged: GifResult[] = [];
  const max = Math.max(gifs.length, stickers.length);
  for (let i = 0; i < max; i++) {
    if (gifs[i]) merged.push(gifs[i]);
    if (stickers[i]) merged.push(stickers[i]);
  }
  return merged;
}
