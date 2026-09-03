/**
 * Link-preview scraper for a URL pasted into a message — Open Graph metadata
 * (title/description/image), cached in `public.link_previews` (0061) so the
 * same link isn't re-scraped every time it renders or every time someone
 * else pastes it.
 *
 * This is the one function in this project that fetches a URL the *client*
 * supplied, not one this codebase already knows about — unlike `places`
 * (fixed upstream, fixed operations) or `share-preview` (fixed internal
 * tables), an attacker-chosen URL here could otherwise be pointed at
 * `169.254.169.254` (cloud metadata endpoints), a private RFC1918 address,
 * or localhost, turning this into an SSRF proxy for the function's own
 * network. Every guard below exists for that one reason:
 *
 *   - only http(s), never file:/data:/etc.
 *   - the hostname's *resolved* IP is checked against private/loopback/
 *     link-local/reserved ranges — not just the hostname string, since DNS
 *     rebinding means the string alone proves nothing.
 *   - redirects are followed manually (not by fetch itself) so every hop's
 *     target gets the same IP check, capped at 3 hops.
 *   - a short timeout and a hard cap on how much of the body is read — this
 *     has no business pulling a multi-GB response just to find <title>.
 *
 * The User-Agent matters more than it looks like it should, in both
 * directions — confirmed by hand, not assumed:
 *
 *   - Some sites (TikTok) serve their full client-rendered JS app shell,
 *     with NO Open Graph tags at all, to a UA they don't recognize, but
 *     serve a small server-rendered page WITH the tags to the handful of
 *     crawler UAs every major platform's own unfurler uses (this is the
 *     actual reason those tags exist) — identifying as one of those isn't
 *     evasion, it's the intended way to receive the response the site
 *     already built for exactly this purpose.
 *   - Other sites do the opposite: Wikipedia returns a flat 403 to
 *     `facebookexternalhit` specifically (measured from this function's own
 *     network — the identical request succeeds from an ordinary shell) while
 *     serving a plain browser UA, or even Twitterbot, without complaint.
 *
 * No single fixed UA satisfies both, and betting everything on one is
 * fragile against whichever site decides to change its mind next — so this
 * tries a short ordered list and keeps the first one that actually returns
 * usable content, not just the first one that returns 200.
 *
 * Auth is `requireUser`, same as `places` — a link preview isn't billable,
 * but an anonymous open proxy to fetch arbitrary URLs is its own liability
 * independent of cost.
 *
 * Deploy:  supabase functions deploy link-preview
 */

import { CORS, json, requireUser, serviceClient } from '../_shared/http.ts';

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 512 * 1024;
const CACHE_FRESH_MS = 7 * 24 * 60 * 60 * 1000;
// Tried in order; the first one that comes back with actual content wins.
// Twitterbot first — the only one of these confirmed clean against both
// TikTok (rich OG tags) and Wikipedia (200, not 403) from this function's
// own network. The other two are real allowlisted crawler identities kept
// as fallbacks for whatever site treats one of *them* as the special case.
const USER_AGENTS = [
  'Twitterbot/1.0',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true; // "this" network
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved (224-255)
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // link-local fe80::/10
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // unique local fc00::/7
  if (lower.startsWith('ff')) return true; // multicast
  // IPv4-mapped (::ffff:a.b.c.d) — check the embedded IPv4.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

async function hostnameIsSafe(hostname: string): Promise<boolean> {
  // A literal IP in the URL itself — validate directly, no DNS involved.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return !isPrivateIPv4(hostname);
  if (hostname.includes(':')) return !isPrivateIPv6(hostname);
  if (hostname === 'localhost') return false;

  try {
    const [v4, v6] = await Promise.allSettled([
      Deno.resolveDns(hostname, 'A'),
      Deno.resolveDns(hostname, 'AAAA'),
    ]);
    const addrs = [
      ...(v4.status === 'fulfilled' ? v4.value : []),
      ...(v6.status === 'fulfilled' ? v6.value : []),
    ];
    if (addrs.length === 0) return false;
    return addrs.every((ip) => (ip.includes(':') ? !isPrivateIPv6(ip) : !isPrivateIPv4(ip)));
  } catch {
    return false;
  }
}

/** Reads up to `MAX_BYTES` of the body and stops — never buffers the whole thing. */
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let out = '';
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    out += decoder.decode(value, { stream: true });
  }
  reader.cancel().catch(() => {});
  return out;
}

function metaContent(html: string, ...names: string[]): string | undefined {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`,
      'i',
    );
    const match = html.match(re) ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, 'i'));
    if (match) return match[1];
  }
  return undefined;
}

interface Preview {
  url: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
}

function hasContent(p: Preview): boolean {
  return !!(p.title || p.description || p.image_url);
}

/**
 * One full attempt — follows redirects manually so every hop's target gets
 * the same IP-based SSRF check, all under a single User-Agent. Returns null
 * only when the fetch itself is refused/broken (blocked protocol, unsafe
 * host, network error, non-HTML response); a technically-successful fetch
 * with no OG tags to find still returns a `Preview`, just one `hasContent`
 * will say no to — the caller decides whether that's worth trying the next UA.
 */
async function attemptFetch(startUrl: string, userAgent: string): Promise<Preview | null> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(current);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!(await hostnameIsSafe(parsed.hostname))) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': userAgent },
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('Location');
      if (!loc) return null;
      current = new URL(loc, current).toString();
      continue;
    }

    if (!res.ok) return null;
    const contentType = res.headers.get('Content-Type') ?? '';
    if (!contentType.includes('text/html')) return null;

    const html = await readCapped(res);
    const title = metaContent(html, 'og:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
    const description = metaContent(html, 'og:description', 'description');
    let image = metaContent(html, 'og:image');
    if (image) image = new URL(image, current).toString();

    return {
      url: startUrl,
      title: title?.trim().slice(0, 200) ?? null,
      description: description?.trim().slice(0, 400) ?? null,
      image_url: image ?? null,
    };
  }
  return null;
}

/** Tries each User-Agent in turn, keeping the first attempt that actually found something. */
async function fetchSafely(startUrl: string): Promise<Preview | null> {
  let lastAttempt: Preview | null = null;
  for (const ua of USER_AGENTS) {
    const result = await attemptFetch(startUrl, ua);
    if (result && hasContent(result)) return result;
    if (result) lastAttempt = result;
  }
  // Every UA either failed outright or fetched fine with nothing to show —
  // the latter (a real, content-less attempt) is still a more honest answer
  // than pure failure, so surface it rather than discarding it for nothing.
  return lastAttempt;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  if (!(await requireUser(req))) return json({ error: 'sign-in required' }, 401);

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'expected a JSON body' }, 400);
  }

  const rawUrl = (body.url ?? '').trim().slice(0, 2000);
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return json({ error: 'invalid url' }, 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return json({ error: 'unsupported protocol' }, 400);
  }

  const db = serviceClient();
  const { data: cached } = await db.from('link_previews').select('*').eq('url', rawUrl).maybeSingle();
  // A cache hit only short-circuits the fetch below if it actually has
  // something to show — a row with every field null (a scrape that came
  // back empty: every UA blocked, a since-fixed bug, a page that genuinely
  // never had OG tags) doesn't get to squat on the URL for the full week
  // and block every retry, including the very next real user.
  const cachedHasContent = cached && (cached.title || cached.description || cached.image_url);
  if (cachedHasContent && Date.now() - +new Date(cached.fetched_at) < CACHE_FRESH_MS) {
    return json({
      url: cached.url,
      title: cached.title,
      description: cached.description,
      imageUrl: cached.image_url,
    });
  }

  const preview = await fetchSafely(rawUrl);
  if (!preview) return json({ error: 'could not fetch preview' }, 502);

  await db.from('link_previews').upsert(
    { url: preview.url, title: preview.title, description: preview.description, image_url: preview.image_url, fetched_at: new Date().toISOString() },
    { onConflict: 'url' },
  );

  return json({ url: preview.url, title: preview.title, description: preview.description, imageUrl: preview.image_url });
});
