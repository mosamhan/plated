/**
 * Shared plumbing for Plated's Edge Functions.
 *
 * `places` and `directions` front a billable third-party key that must not
 * ship in the app bundle; the monetization functions (affiliate-click,
 * stripe-*) front money instead of a key. Different reason, same shape of
 * problem — one signed-in-user check and one bypass-RLS client, defined once
 * rather than drifting across N copies.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/**
 * Resolve the caller to a real signed-in user, or null.
 *
 * This is the actual auth boundary — `verify_jwt` is not. That flag only proves
 * a token was signed by this project, and the public anon key is such a token,
 * so with verify_jwt on an anon caller still got a 200 (measured, not assumed).
 * `getUser()` is what separates a user from the shipped public key, and it holds
 * even if that flag is ever turned off.
 */
export async function requireUser(req: Request): Promise<{ id: string } | null> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;

  const auth = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  );
  const { data: { user }, error } = await auth.auth.getUser(jwt);
  return error || !user ? null : { id: user.id };
}

/**
 * A client authenticated as service_role — bypasses RLS. Only for writes the
 * client has no policy to make itself (money ledgers, webhook-driven state);
 * never constructed from anything a request sent, never returned to the client.
 */
export function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

/** A finite latitude/longitude pair, or null if the client sent junk. */
export function coord(v: unknown): { lat: number; lng: number } | null {
  const p = v as { lat?: unknown; lng?: unknown } | null;
  const lat = Number(p?.lat);
  const lng = Number(p?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
