/**
 * Expo push relay.
 *
 * Called only by the database (0025_push_notifications.sql) with the service
 * key, never by the app. The client's job stops at registering its token; who
 * gets woken up is decided by a trigger, because a sender that could also
 * name the recipients is a spam vector.
 *
 * Expo's push API needs no secret of its own — a token *is* the address — so
 * this function exists for two other reasons: it keeps the service key out of
 * anything client-shaped, and it batches. Expo caps a request at 100 messages.
 *
 * Deploy:  supabase functions deploy push --no-verify-jwt
 *          (auth is the service-key check below, not verify_jwt — see _shared/http.ts)
 */

import { CORS, json } from '../_shared/http.ts';

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100;

interface Payload {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // The only caller is the database, holding the service role key. Anything
  // else is refused before we look at the body.
  const auth = req.headers.get('Authorization') ?? '';
  const expected = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`;
  if (!expected.endsWith(' ') && auth !== expected) {
    return json({ error: 'forbidden' }, 403);
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'bad request' }, 400);
  }

  // Only Expo-shaped tokens go upstream. A malformed one poisons the whole
  // batch, and Expo answers with a single error rather than per-token detail.
  const tokens = (payload.tokens ?? []).filter(
    (t) => typeof t === 'string' && t.startsWith('ExponentPushToken['),
  );
  if (tokens.length === 0) return json({ sent: 0 });

  let sent = 0;
  for (let i = 0; i < tokens.length; i += BATCH) {
    const messages = tokens.slice(i, i + BATCH).map((to) => ({
      to,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      sound: 'default',
      // Collapse repeats from one conversation instead of stacking ten pings.
      ...(payload.data?.conversationId
        ? { collapseId: String(payload.data.conversationId) }
        : {}),
    }));

    const res = await fetch(EXPO_PUSH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    if (res.ok) sent += messages.length;
    else console.warn('[push] expo rejected batch', res.status, await res.text());
  }

  return json({ sent });
});
