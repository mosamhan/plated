import { serviceClient } from '../_shared/http.ts';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function validInviteUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string) {
  const escapedCharacters: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => escapedCharacters[character] ?? character);
}

async function sendInvite(email: string, signupId: string, inviteUrl: string, apiKey: string, from: string) {
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `plated-beta-invite-${signupId}`,
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Your Plated beta invite is ready',
      text: `Your seat at the table is ready. Join the Plated beta: ${inviteUrl}`,
      html: `<p>Your seat at the table is ready.</p><p><a href="${escapeHtml(inviteUrl)}">Join the Plated beta</a></p><p>We can’t wait to see what you find.</p>`,
    }),
  });

  return result.ok;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const token = Deno.env.get('BETA_INVITE_ADMIN_TOKEN');
  if (!token || request.headers.get('Authorization') !== `Bearer ${token}`) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const inviteUrl = validInviteUrl(Deno.env.get('BETA_ACCESS_URL'));
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM_EMAIL');
  if (!inviteUrl || !apiKey || !from) return jsonResponse({ error: 'invite email is not configured' }, 503);

  const database = serviceClient();
  const { data: signups, error } = await database
    .from('waitlist_signups')
    .select('id, email')
    .is('beta_invite_sent_at', null)
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) {
    console.error('[send-beta-invites] list failed', error.code);
    return jsonResponse({ error: 'could not load waitlist' }, 500);
  }

  let sent = 0;
  let failed = 0;
  for (const signup of signups ?? []) {
    try {
      if (!await sendInvite(signup.email, signup.id, inviteUrl, apiKey, from)) {
        failed += 1;
        continue;
      }

      const { error: updateError } = await database
        .from('waitlist_signups')
        .update({ beta_invite_sent_at: new Date().toISOString() })
        .eq('id', signup.id)
        .is('beta_invite_sent_at', null);

      if (updateError) {
        console.error('[send-beta-invites] sent marker update failed', signup.id, updateError.code);
        failed += 1;
      } else {
        sent += 1;
      }
    } catch (error) {
      console.error('[send-beta-invites] invite failed', signup.id, error);
      failed += 1;
    }
  }

  return jsonResponse({ ok: true, scanned: signups?.length ?? 0, sent, failed });
});
