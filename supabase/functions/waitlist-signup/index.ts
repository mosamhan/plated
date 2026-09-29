import { serviceClient } from '../_shared/http.ts';

const ALLOWED_ORIGINS = new Set([
  'https://joinplated.app',
  'https://www.joinplated.app',
  'http://localhost:8787',
  'http://127.0.0.1:8787',
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(body: unknown, status: number, origin: string | null) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  });

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers', 'content-type');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }

  return new Response(JSON.stringify(body), { status, headers });
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

function validInviteUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

async function verifyTurnstile(token: unknown, expectedHostname: string) {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secret) return 'unavailable';
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return 'invalid';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error('[waitlist-signup] Turnstile verification unavailable', response.status);
      return 'unavailable';
    }

    const result = await response.json() as {
      success?: boolean;
      hostname?: string;
      action?: string;
      'error-codes'?: string[];
    };
    if (!result.success || result.hostname !== expectedHostname || result.action !== 'waitlist_signup') {
      return 'invalid';
    }
    return 'valid';
  } catch {
    console.error('[waitlist-signup] Turnstile verification request failed');
    return 'unavailable';
  } finally {
    clearTimeout(timeout);
  }
}

async function sendEmail(email: string, signupId: string, inviteUrl: string | null) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM_EMAIL');
  if (!apiKey || !from) return false;

  const betaInvite = Boolean(inviteUrl);
  const safeInviteUrl = inviteUrl ? escapeHtml(inviteUrl) : '';
  const subject = betaInvite ? 'Your Plated beta invite is ready' : 'You’re on the Plated beta list';
  const text = betaInvite
    ? `Your seat at the table is ready. Join the Plated beta: ${inviteUrl}`
    : 'Thanks for joining the Plated beta list. We’ll email you as soon as beta access is ready.';
  const html = betaInvite
    ? `<p>Your seat at the table is ready.</p><p><a href="${safeInviteUrl}">Join the Plated beta</a></p><p>We can’t wait to see what you find.</p>`
    : '<p>Thanks for joining the Plated beta list.</p><p>We’ll email you as soon as beta access is ready.</p>';

  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `plated-waitlist-${signupId}-${betaInvite ? 'invite' : 'welcome'}`,
    },
    body: JSON.stringify({ from, to: [email], subject, html, text }),
  });

  if (!result.ok) console.error('[waitlist-signup] transactional email failed', result.status);
  return result.ok;
}

async function enrollNewsletter(email: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const segmentId = Deno.env.get('RESEND_NEWSLETTER_SEGMENT_ID');
  if (!apiKey || !segmentId) return false;

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  const contactUrl = `https://api.resend.com/contacts/${encodeURIComponent(email)}`;

  async function updateExistingContact() {
    const updateResponse = await fetch(contactUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ unsubscribed: false }),
    });
    if (!updateResponse.ok) {
      console.error('[waitlist-signup] newsletter contact update failed', updateResponse.status);
      return false;
    }

    const segmentResponse = await fetch(
      `https://api.resend.com/contacts/${encodeURIComponent(email)}/segments/${encodeURIComponent(segmentId)}`,
      { method: 'POST', headers },
    );
    if (!segmentResponse.ok) console.error('[waitlist-signup] newsletter segment add failed', segmentResponse.status);
    return segmentResponse.ok;
  }

  const contactResponse = await fetch(contactUrl, { headers: { Authorization: headers.Authorization } });
  if (contactResponse.ok) return updateExistingContact();
  if (contactResponse.status !== 404) {
    console.error('[waitlist-signup] newsletter contact lookup failed', contactResponse.status);
    return false;
  }

  const createResponse = await fetch('https://api.resend.com/contacts', {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, unsubscribed: false, segments: [{ id: segmentId }] }),
  });
  if (createResponse.ok) return true;

  const racedContactResponse = await fetch(contactUrl, { headers: { Authorization: headers.Authorization } });
  if (racedContactResponse.ok) return updateExistingContact();

  console.error('[waitlist-signup] newsletter contact create failed', createResponse.status);
  return false;
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') {
    const headers = new Headers({ 'Vary': 'Origin' });
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Headers', 'content-type');
      headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    }
    return new Response(null, { status: 204, headers });
  }
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return jsonResponse({ error: 'origin not allowed' }, 403, origin);
  if (request.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405, origin);

  let body: { email?: unknown; newsletterOptIn?: unknown; website?: unknown; turnstileToken?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'expected a JSON body' }, 400, origin);
  }

  if (typeof body.website === 'string' && body.website.length > 0) return jsonResponse({ ok: true }, 200, origin);

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return jsonResponse({ error: 'enter a valid email address' }, 400, origin);
  }

  const turnstileStatus = await verifyTurnstile(body.turnstileToken, new URL(origin).hostname);
  if (turnstileStatus === 'unavailable') {
    return jsonResponse({ error: 'secure signup verification is unavailable' }, 503, origin);
  }
  if (turnstileStatus !== 'valid') {
    return jsonResponse({ error: 'complete the secure signup check' }, 403, origin);
  }

  if (!Deno.env.get('SUPABASE_URL') || !Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return jsonResponse({ error: 'waitlist service unavailable' }, 503, origin);
  }

  const database = serviceClient();
  const { error: insertError } = await database
    .from('waitlist_signups')
    .upsert({ email }, { onConflict: 'email', ignoreDuplicates: true });
  if (insertError) {
    console.error('[waitlist-signup] insert failed', insertError.code);
    return jsonResponse({ error: 'could not save signup' }, 500, origin);
  }

  if (body.newsletterOptIn === true) {
    const { error: consentError } = await database
      .from('waitlist_signups')
      .update({ newsletter_opt_in: true, newsletter_opt_in_at: new Date().toISOString() })
      .eq('email', email);
    if (consentError) console.error('[waitlist-signup] consent update failed', consentError.code);
  }

  const { data: signup, error: readError } = await database
    .from('waitlist_signups')
    .select('id, newsletter_opt_in, newsletter_enrolled_at, welcome_email_sent_at, beta_invite_sent_at')
    .eq('email', email)
    .single();
  if (readError || !signup) {
    console.error('[waitlist-signup] read failed', readError?.code);
    return jsonResponse({ error: 'could not confirm signup' }, 500, origin);
  }

  let newsletterEnrolled = Boolean(signup.newsletter_enrolled_at);
  if (signup.newsletter_opt_in && !signup.newsletter_enrolled_at) {
    newsletterEnrolled = await enrollNewsletter(email);
    if (newsletterEnrolled) {
      await database
        .from('waitlist_signups')
        .update({ newsletter_enrolled_at: new Date().toISOString() })
        .eq('id', signup.id)
        .is('newsletter_enrolled_at', null);
    }
  }

  const inviteUrl = validInviteUrl(Deno.env.get('BETA_ACCESS_URL'));
  let betaInviteSent = Boolean(signup.beta_invite_sent_at);
  if (inviteUrl && !betaInviteSent) {
    betaInviteSent = await sendEmail(email, signup.id, inviteUrl);
    if (betaInviteSent) {
      await database
        .from('waitlist_signups')
        .update({ beta_invite_sent_at: new Date().toISOString() })
        .eq('id', signup.id)
        .is('beta_invite_sent_at', null);
    }
  } else if (!inviteUrl && !signup.welcome_email_sent_at) {
    const welcomeEmailSent = await sendEmail(email, signup.id, null);
    if (welcomeEmailSent) {
      await database
        .from('waitlist_signups')
        .update({ welcome_email_sent_at: new Date().toISOString() })
        .eq('id', signup.id)
        .is('welcome_email_sent_at', null);
    }
  }

  return jsonResponse({ ok: true, betaInviteSent, newsletterEnrolled }, 200, origin);
});
