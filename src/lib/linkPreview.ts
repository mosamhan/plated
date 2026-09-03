/**
 * Rich previews for a URL pasted into a message — Open Graph metadata
 * scraped (and cached) by the `link-preview` Edge Function
 * (supabase/functions/link-preview/index.ts), which holds the actual
 * fetch + SSRF guards. This is the one-hop client wrapper, same shape as
 * `places.ts`'s `callPlaces` — degrade to null on any failure rather than
 * throwing, since a missing preview should just mean no card, not a crash.
 */

import { useEffect, useSyncExternalStore } from 'react';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const URL_PATTERN = /https?:\/\/[^\s]+/i;

/** The first URL in a message's text, or null — only one preview per bubble. */
export function extractFirstUrl(text: string): string | null {
  return text.match(URL_PATTERN)?.[0]?.replace(/[.,!?)\]]+$/, '') ?? null;
}

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase.functions.invoke<LinkPreview>('link-preview', { body: { url } });
    if (error || !data) {
      // `error.message` alone is just "Edge Function returned a non-2xx
      // status code" for every failure — the actual reason (sign-in
      // expired, malformed url, upstream site refused every UA) is the
      // function's own JSON body, sitting on the underlying Response the
      // client SDK attaches as `.context` but doesn't surface itself.
      if (__DEV__ && error) {
        const context = (error as { context?: Response }).context;
        context
          ?.clone()
          .text()
          .then((body) => console.warn('[Plated] link preview failed', error.message, body))
          .catch(() => console.warn('[Plated] link preview failed', error.message));
      }
      return null;
    }
    return data;
  } catch (e) {
    if (__DEV__) console.warn('[Plated] link preview request error', e);
    return null;
  }
}

/** A cache entry worth reusing has something to actually show. */
function hasContent(preview: LinkPreview | null): preview is LinkPreview {
  return !!preview && !!(preview.title || preview.description || preview.imageUrl);
}

// A tiny external store, not component state — module-level so the cache
// survives any one component's mount lifecycle, which matters more here
// than it would elsewhere in this codebase: sending a message is optimistic
// (MessagesContext assigns a temporary id immediately, then replaces that
// message object with the server-confirmed one once the insert returns —
// see `write`/`sendMessage`), and this thread's FlatList keys each row by
// the message's own id. That id changing out from under an otherwise
// unchanged row is exactly a React key change, which unmounts the old
// bubble and mounts a new one *while the preview fetch for that same url is
// still in flight*. A plain `useState`-driven "notify the component that
// started the fetch" (what this used to be) loses the update right there —
// the component that receives it is already gone, and the new one has no
// way to hear about a fetch it didn't start itself. Modeling this as a real
// external store instead — `useSyncExternalStore`, subscribed to by
// whichever component is *currently* asking about a url, notified by
// whichever fetch *actually* resolves — sidesteps the mount-identity
// mismatch entirely instead of trying to out-guess React's remount timing.
const cache = new Map<string, LinkPreview>();
// Dedupes a url's fetch across every component currently asking about it
// (the old and new bubble across an id-swap both call this on the same
// render pass) — one real network request per url, not one per mount.
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Kicks off (or joins) the one fetch for this url, updating the shared cache when it resolves. */
function ensureFetching(url: string): void {
  if (cache.has(url) || inflight.has(url)) return;
  const promise = fetchLinkPreview(url).then((result) => {
    if (hasContent(result)) {
      cache.set(url, result);
      notify();
    }
    inflight.delete(url);
  });
  inflight.set(url, promise);
}

/**
 * The one link preview a text bubble shows, fetched (and cached once
 * successful) per url. `useSyncExternalStore` re-renders whichever
 * component is *currently* subscribed whenever the shared cache changes —
 * regardless of which component's effect originally kicked off the fetch,
 * which is the exact mismatch a plain local-state approach can't survive
 * across the optimistic-send id swap described above.
 */
export function useLinkPreview(url: string | null): LinkPreview | null {
  const preview = useSyncExternalStore(
    subscribe,
    () => (url ? cache.get(url) ?? null : null),
  );

  // Triggering, not reading — safe to leave as a side effect. Firing again
  // on every remount for the same url is exactly the point: `ensureFetching`
  // is a no-op once the url is cached or already in flight, so a remount
  // mid-fetch (the id-swap case above) just joins the existing request
  // instead of starting a redundant one.
  useEffect(() => {
    if (url) ensureFetching(url);
  }, [url]);

  return preview;
}
