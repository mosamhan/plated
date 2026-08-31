/**
 * Public share-preview page — Open Graph / Twitter Card metadata for the
 * links `src/lib/invite.ts` builds (`plateLink`, `platoLink`,
 * `restaurantLink`, `profileLink`), so pasting one into iMessage, Slack,
 * WhatsApp, or X shows the actual dish/restaurant/profile (photo, title,
 * rating) instead of a bare link.
 *
 * Deliberately the ONE function in this project with no auth check at all —
 * not `requireUser`, not even the gateway's own JWT check (see config.toml's
 * `verify_jwt = false` for this function). Every other function assumes a
 * signed-in caller because the client always is one; a link-unfurling
 * crawler (iMessage's LPLinkView fetcher, Slack/Twitter/Facebook's bots) or a
 * human tapping the link from a browser is not, and never carries a
 * Supabase session to attach. What keeps this from leaking a friends-only or
 * private post is the anon client below plus the RLS policies already on
 * `orders`/`plato_videos` (0016/0017_*_visibility.sql) — with no JWT at all,
 * `auth.uid()` is null, so those policies fall through to exactly "public and
 * not archived", the same as what a logged-out browser would see anywhere
 * else in the app.
 *
 * Path shape mirrors the links themselves — whatever comes after this
 * function's own base URL:
 *   /p/<orderId>        → a plate (orders row)
 *   /plato/<platoId>     → a Plato (plato_videos row)
 *   /r/<restaurantId>    → a restaurant
 *   /@<handle>           → a profile
 * Unmatched or missing rows fall back to a generic Plated card rather than an
 * error, so a stale/deleted link still unfurls to *something*.
 *
 * `plateLink`/`platoLink`/`restaurantLink`/`profileLink` point at
 * `https://joinplated.app/...`; a Cloudflare Worker (`share-preview`, routed
 * on `joinplated.app/*`) reverse-proxies those exact paths to this function's
 * URL, forwarding the full path + query untouched.
 *
 * Deploy:  supabase functions deploy share-preview --no-verify-jwt
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlResponse(body: string) {
  return new Response(body, { headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' } });
}

/**
 * The card itself: OG + Twitter tags in the head (what crawlers read, never
 * rendering the page), plus a body that's just enough for the rare human who
 * opens the raw link directly — a manual "Open in Plated" link.
 *
 * Deliberately NOT an auto-redirect (no `<meta http-equiv="refresh">` to the
 * `plated://` scheme). `LPMetadataProvider` — what Messages/iMessage use to
 * build a link's rich preview — does a real WebKit-backed load of the page
 * to pull these tags, and an immediate redirect to an unrecognized custom
 * scheme mid-load makes that fetch fail, which makes Messages give up on the
 * rich preview entirely and fall back to offering the raw response as a
 * downloadable file instead. Confirmed on a real device, not just the
 * Simulator. A visible link the rare direct-open visitor can tap is a small
 * price for every *shared* link actually unfurling correctly.
 */
function page(opts: { title: string; description: string; image?: string | null; url: string; deepLink?: string }): string {
  const { title, description, image, url, deepLink } = opts;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Plated" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${escapeHtml(url)}" />
${image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
${image ? `<meta name="twitter:image" content="${escapeHtml(image)}" />` : ''}
</head>
<body>
<p>${escapeHtml(title)}</p>
<p>${escapeHtml(description)}</p>
${deepLink ? `<p><a href="${escapeHtml(deepLink)}">Open in Plated</a></p>` : ''}
</body>
</html>`;
}

const FALLBACK_TITLE = 'Plated';
const FALLBACK_DESCRIPTION = 'Rate dishes and order the exact plates people rated.';

// Mirrors src/lib/invite.ts's plateLink/platoLink/restaurantLink/profileLink —
// duplicated rather than imported, since this runs as a standalone Deno
// module with no bundler to resolve the app's `@/` path aliases. og:url is
// this canonical joinplated.app link, not this function's own request URL, so
// a crawler's card points at the same address that was actually shared (and
// never leaks the raw Supabase functions host or the Cloudflare Worker in
// front of it).
const canonicalUrl = {
  plate: (id: string) => `https://joinplated.app/p/${id}`,
  plato: (id: string) => `https://joinplated.app/plato/${id}`,
  restaurant: (id: string) => `https://joinplated.app/r/${id}`,
  profile: (handle: string) => `https://joinplated.app/@${handle}`,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const reqUrl = new URL(req.url);
  // Falls back to the site root rather than this function's own (internal,
  // http, functions-host) URL — a stale/deleted link should still unfurl to
  // a joinplated.app address, not one that leaks the backend.
  const fallback = () =>
    htmlResponse(page({ title: FALLBACK_TITLE, description: FALLBACK_DESCRIPTION, url: 'https://joinplated.app' }));

  // Whatever comes after this function's own base path, e.g.
  // /functions/v1/share-preview/p/<id> → kind="p", key="<id>". Taking the
  // last two segments (rather than assuming a fixed prefix length) means this
  // doesn't care whether it's invoked via the raw functions URL or through
  // the joinplated.app Worker in front of it.
  const parts = reqUrl.pathname.split('/').filter(Boolean);
  const key = parts[parts.length - 1] ?? '';
  const kind = parts[parts.length - 2] ?? '';

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!supabaseUrl || !anonKey) return fallback();
  // The anon client, on purpose — see the file header for why this is the
  // one function that never resolves a real user.
  const supabase = createClient(supabaseUrl, anonKey);

  try {
    if (kind === 'p') {
      const { data: order } = await supabase
        .from('orders')
        .select('dish_name, photo_url, rating, restaurants(name)')
        .eq('id', key)
        .maybeSingle();
      if (!order) return fallback();
      const restaurantName = (order.restaurants as { name?: string } | null)?.name;
      // Some dish names already start with "The" ("The Classic Smash") — don't double it up.
      const dishTitle = /^the\s/i.test(order.dish_name) ? order.dish_name : `The ${order.dish_name}`;
      return htmlResponse(
        page({
          title: `${dishTitle}${restaurantName ? ` at ${restaurantName}` : ''}`,
          description: order.rating != null ? `${Number(order.rating).toFixed(1)} on Plated` : 'On Plated',
          image: order.photo_url,
          url: canonicalUrl.plate(key),
          deepLink: `plated://order/${key}`,
        }),
      );
    }

    if (kind === 'plato') {
      const { data: plato } = await supabase
        .from('plato_videos')
        .select('dish_name, restaurant_name, poster_url, rating')
        .eq('id', key)
        .maybeSingle();
      if (!plato) return fallback();
      return htmlResponse(
        page({
          title: `${plato.dish_name} at ${plato.restaurant_name}`,
          description: plato.rating != null ? `${Number(plato.rating).toFixed(1)} on Plated` : 'On Plated',
          image: plato.poster_url,
          url: canonicalUrl.plato(key),
          deepLink: `plated://plato/${key}`,
        }),
      );
    }

    if (kind === 'r') {
      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('name, cuisine, location, image_url')
        .eq('id', key)
        .maybeSingle();
      if (!restaurant) return fallback();
      const where = [restaurant.cuisine, restaurant.location].filter(Boolean).join(' · ');
      return htmlResponse(
        page({
          title: restaurant.name,
          description: where || 'On Plated',
          image: restaurant.image_url,
          url: canonicalUrl.restaurant(key),
          deepLink: `plated://restaurant/${key}`,
        }),
      );
    }

    if (key.startsWith('@')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, name, handle, avatar_url, bio')
        .eq('handle', key.slice(1))
        .maybeSingle();
      if (!profile) return fallback();
      return htmlResponse(
        page({
          title: `${profile.name} (@${profile.handle})`,
          description: profile.bio || "See what they're rating on Plated.",
          image: profile.avatar_url,
          url: canonicalUrl.profile(profile.handle),
          deepLink: `plated://user/${profile.id}`,
        }),
      );
    }

    return fallback();
  } catch {
    return fallback();
  }
});
