/**
 * Reverse-proxies the share-link paths (/p/:id, /plato/:id, /r/:id, /@:handle
 * — see src/lib/invite.ts) to the Supabase Edge Function that builds their
 * Open Graph / Twitter Card unfurl pages. Scoped to only these paths via
 * `assets.run_worker_first` in wrangler.jsonc — every other request on
 * joinplated.app is served straight from ./public with no Worker invocation.
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = 'https://lfsrbkrqdvzilfkphgpq.supabase.co/functions/v1/share-preview' + url.pathname + url.search;
    const upstream = await fetch(target, {
      method: request.method,
      headers: { accept: request.headers.get('accept') || 'text/html' },
    });
    const headers = new Headers();
    const contentType = upstream.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    headers.set('cache-control', 'public, max-age=60');
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
