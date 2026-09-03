/**
 * Giphy proxy — GIFs and Stickers, search + trending. Same shape as
 * `places`: the key is billable/rate-limited, so it stays server-side and
 * the client sends an operation, never a raw path — a signed-in caller
 * can't aim the key at an arbitrary Giphy endpoint, only `search`/`trending`
 * against `gifs`/`stickers`.
 *
 * Deploy:  supabase functions deploy giphy
 * Secret:  supabase secrets set GIPHY_KEY=…
 */

import { CORS, json, requireUser } from '../_shared/http.ts';

const BASE = 'https://api.giphy.com/v1';
const LIMIT = 24;

interface Body {
  op?: 'search' | 'trending';
  kind?: 'gifs' | 'stickers';
  query?: string;
  offset?: number;
}

interface GiphyImage {
  url: string;
  width: string;
  height: string;
}

interface GiphyGif {
  id: string;
  title: string;
  images: {
    fixed_width: GiphyImage;
    original: GiphyImage;
  };
}

function upstreamPath(body: Body, key: string): string | null {
  const kind = body.kind === 'stickers' ? 'stickers' : 'gifs';
  const offset = Math.max(0, Math.min(200, Number(body.offset) || 0));

  if (body.op === 'trending') {
    return `/${kind}/trending?${new URLSearchParams({ api_key: key, limit: String(LIMIT), offset: String(offset), rating: 'pg-13' })}`;
  }
  if (body.op === 'search') {
    const q = (body.query ?? '').trim().slice(0, 100);
    if (!q) return null;
    return `/${kind}/search?${new URLSearchParams({ api_key: key, q, limit: String(LIMIT), offset: String(offset), rating: 'pg-13' })}`;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const key = Deno.env.get('GIPHY_KEY');
  if (!key) return json({ error: 'GIPHY_KEY is not set' }, 500);

  if (!(await requireUser(req))) return json({ error: 'sign-in required' }, 401);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'expected a JSON body' }, 400);
  }

  const path = upstreamPath(body, key);
  if (!path) return json({ error: `unsupported or malformed op: ${body.op ?? '(none)'}` }, 400);

  try {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) return json({ error: 'upstream', status: res.status }, res.status);

    const upstream = await res.json();
    // Trim Giphy's (large) per-item payload down to what the picker actually
    // renders — id, title, and just the two image sizes it needs.
    const results = ((upstream.data ?? []) as GiphyGif[]).map((g) => ({
      id: g.id,
      title: g.title,
      previewUrl: g.images.fixed_width.url,
      fullUrl: g.images.original.url,
      width: Number(g.images.original.width) || undefined,
      height: Number(g.images.original.height) || undefined,
    }));
    return json({ results });
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
