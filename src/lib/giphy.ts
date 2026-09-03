import { supabase } from '@/lib/supabase';

export interface GifResult {
  id: string;
  title: string;
  previewUrl: string;
  fullUrl: string;
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
    return data?.results ?? [];
  } catch (e) {
    if (__DEV__) console.warn('[Plated] giphy request error', e);
    return [];
  }
}
