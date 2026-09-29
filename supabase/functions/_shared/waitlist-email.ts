/**
 * Shared HTML/plain-text builder for every beta-waitlist email — the
 * immediate "you're on the list" welcome and the later real TestFlight
 * invite once BETA_ACCESS_URL is set. One template, called from both
 * waitlist-signup and send-beta-invites, instead of two copies that would
 * drift the moment one of them got a copy tweak and the other didn't.
 *
 * Table layout with a real <style> block (Gmail's app and webmail, Apple
 * Mail, and Outlook.com all support this today — the "Gmail strips <style>"
 * rule is years out of date) so the email actually follows the recipient's
 * system theme via `@media (prefers-color-scheme: dark)`, instead of
 * picking one fixed look. A first pass here only declared
 * `<meta name="color-scheme" content="dark">` with no real dark/light CSS —
 * that just tells a client "don't auto-invert this," it doesn't opt the
 * email into responding to the device theme, so Gmail's own auto dark-mode
 * pass repainted it unpredictably (confirmed live: a real Gmail-app
 * screenshot showed a half-adapted, washed-out result). Every color below
 * mirrors web/public/styles.css's :root (Saffron/light) and
 * :root[data-theme="dark"] (Noir Gold) blocks exactly, not re-derived —
 * inline attributes carry the light values as the fallback for clients that
 * ignore <style>/media queries entirely (Outlook desktop), and the <style>
 * block's dark media query overrides them with !important for clients that
 * do support it.
 */

const SITE_URL = 'https://joinplated.app';
const LOGO_LIGHT_URL = `${SITE_URL}/brand/plated-profile.png`; // orange gradient, for light mode
const LOGO_DARK_URL = `${SITE_URL}/brand/plated-profile-dark.png`; // near-black bg, gold text, for dark mode

const SCREENSHOTS = [
  {
    src: `${SITE_URL}/images/home-feed.jpg`,
    alt: 'The Plated home feed: a rated dish, an Order button, and reorder counts',
    caption: 'Rate every plate',
  },
  {
    src: `${SITE_URL}/images/discover-map.jpg`,
    alt: 'Discover map showing nearby top-rated restaurants',
    caption: 'Discover hidden gems',
  },
  {
    src: `${SITE_URL}/images/platos-reel.jpg`,
    alt: 'A Plato — a short dish video in the reels-style feed',
    caption: 'Watch real Platos',
  },
];

// Light (Saffron) values — the inline/fallback defaults every element
// carries. Dark (Noir Gold) values live only in the <style> block's
// prefers-color-scheme override, keyed to the same classes.
const LIGHT = {
  bg: '#FFFDF8',
  panel: '#FBF3E2',
  text: '#251B10',
  muted: '#79694F',
  border: '#EFE3CC',
  accent: '#B07207',
};
const DARK = {
  bg: '#121110',
  panel: '#1C1813',
  text: '#F5F1E8',
  muted: '#A99F8C',
  border: '#33291B',
  accent: '#D9A441',
};
const ORDER_CTA = '#D9480F'; // identical in both themes, same as the app

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

function screenshotRow() {
  const cells = SCREENSHOTS.map(
    (shot) => `
      <td width="33%" valign="top" style="padding:0 6px;">
        <img src="${shot.src}" width="164" alt="${escapeHtml(shot.alt)}"
             class="pl-shot"
             style="display:block; width:100%; max-width:164px; height:auto; border-radius:14px; border:1px solid ${LIGHT.border};" />
        <p class="pl-muted" style="margin:10px 0 0; font-family:Georgia,'Times New Roman',serif; font-size:13px; line-height:1.3; color:${LIGHT.text}; text-align:center;">
          ${escapeHtml(shot.caption)}
        </p>
      </td>`,
  ).join('');
  return `<tr>${cells}</tr>`;
}

function stepsBlock(betaInvite: boolean) {
  const steps: [string, string][] = [
    ['01', "You're on the list — nothing else to do right now."],
    ['02', betaInvite ? 'Tap the button above to open TestFlight.' : "We'll email you the moment your invite is ready."],
    ['03', 'Install, sign in, and rate your first plate.'],
  ];
  return steps
    .map(
      ([n, copy]) => `
      <tr>
        <td width="34" valign="top" style="padding:0 12px 16px 0;">
          <span class="pl-accent" style="display:inline-block; font-family:Georgia,'Times New Roman',serif; font-size:13px; font-weight:bold; color:${LIGHT.accent};">${n}</span>
        </td>
        <td valign="top" class="pl-muted" style="padding:0 0 16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:14px; line-height:1.5; color:${LIGHT.muted};">
          ${escapeHtml(copy)}
        </td>
      </tr>`,
    )
    .join('');
}

export function renderWaitlistEmail(options: { inviteUrl?: string | undefined }) {
  const inviteUrl = validInviteUrl(options.inviteUrl);
  const betaInvite = Boolean(inviteUrl);
  const safeInviteUrl = inviteUrl ? escapeHtml(inviteUrl) : '';

  const subject = betaInvite ? 'Your Plated beta invite is ready' : "You're on the Plated beta list";
  const preheader = betaInvite
    ? 'Tap below to join the beta on TestFlight — welcome to Plated.'
    : "You're in. We'll email you the moment your invite is ready.";
  const headline = betaInvite ? 'Your seat is ready.' : "You're on the list.";
  const subhead = betaInvite
    ? 'Your Plated beta invite is live — tap below to install on TestFlight.'
    : 'Thanks for joining early. We open the beta in small batches, and we’ll email you the moment yours is ready.';

  const ctaBlock = betaInvite
    ? `
      <tr>
        <td align="center" style="padding:28px 0 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" bgcolor="${ORDER_CTA}" style="border-radius:12px;">
                <a href="${safeInviteUrl}" target="_blank"
                   style="display:inline-block; padding:14px 32px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:16px; font-weight:bold; color:#FFFFFF; text-decoration:none; border-radius:12px;">
                  Join the Plated beta
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${escapeHtml(subject)}</title>
<style>
  /* Belt-and-suspenders dark mode: every element also carries the light
     value inline (above) as the fallback for clients that ignore <style>
     or media queries (Outlook desktop) — this block only has to override
     for clients that do honor prefers-color-scheme. */
  .pl-logo-dark { display: none !important; width: 0 !important; height: 0 !important; max-height: 0 !important; overflow: hidden !important; mso-hide: all; }
  @media (prefers-color-scheme: dark) {
    .pl-bg { background-color: ${DARK.bg} !important; }
    .pl-panel { background-color: ${DARK.panel} !important; }
    .pl-text { color: ${DARK.text} !important; }
    .pl-muted { color: ${DARK.muted} !important; }
    .pl-accent { color: ${DARK.accent} !important; }
    .pl-border { border-color: ${DARK.border} !important; }
    .pl-shot { border-color: ${DARK.border} !important; }
    .pl-logo-light { display: none !important; width: 0 !important; height: 0 !important; max-height: 0 !important; overflow: hidden !important; mso-hide: all; }
    .pl-logo-dark { display: block !important; width: 72px !important; height: 72px !important; max-height: none !important; overflow: visible !important; }
  }
</style>
</head>
<body class="pl-bg" style="margin:0; padding:0; background-color:${LIGHT.bg};">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:${LIGHT.bg};">
    ${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${LIGHT.bg}" class="pl-bg">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:100%;">

          <tr>
            <td align="center" style="padding-bottom:24px;">
              <img src="${LOGO_LIGHT_URL}" width="72" height="72" alt="Plated" class="pl-logo-light"
                   style="display:block; width:72px; height:72px; border-radius:20px;" />
              <img src="${LOGO_DARK_URL}" width="72" height="72" alt="" class="pl-logo-dark"
                   style="display:none; width:0; height:0; border-radius:20px;" />
            </td>
          </tr>

          <tr>
            <td align="center" class="pl-border" style="padding-bottom:28px; border-bottom:1px solid ${LIGHT.border};">
              <p class="pl-accent" style="margin:0 0 10px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:12px; font-weight:bold; letter-spacing:1.5px; text-transform:uppercase; color:${LIGHT.accent};">
                Plated Early Access
              </p>
              <h1 class="pl-text" style="margin:0 0 12px; font-family:Georgia,'Times New Roman',serif; font-size:34px; line-height:1.15; font-weight:bold; color:${LIGHT.text};">
                ${escapeHtml(headline)}
              </h1>
              <p class="pl-muted" style="margin:0; max-width:440px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:15px; line-height:1.55; color:${LIGHT.muted};">
                ${escapeHtml(subhead)}
              </p>
            </td>
          </tr>

          ${ctaBlock}

          <tr>
            <td style="padding:32px 0 8px;">
              <p class="pl-muted" style="margin:0 0 16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:12px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:${LIGHT.muted}; text-align:center;">
                What you're joining
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${screenshotRow()}
              </table>
            </td>
          </tr>

          <tr>
            <td class="pl-panel" style="padding:32px 24px 8px; background-color:${LIGHT.panel}; border-radius:16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${stepsBlock(betaInvite)}
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:32px 0 8px;">
              <p class="pl-muted" style="margin:0 0 8px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:12px; line-height:1.6; color:${LIGHT.muted};">
                <a href="https://instagram.com/joinplatedapp" class="pl-accent" style="color:${LIGHT.accent}; text-decoration:none;">Instagram</a>
                &nbsp;&middot;&nbsp;
                <a href="https://tiktok.com/@joinplatedapp" class="pl-accent" style="color:${LIGHT.accent}; text-decoration:none;">TikTok</a>
                &nbsp;&middot;&nbsp;
                <a href="${SITE_URL}/privacy" class="pl-accent" style="color:${LIGHT.accent}; text-decoration:none;">Privacy policy</a>
              </p>
              <p class="pl-muted" style="margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.6; color:${LIGHT.muted};">
                You're receiving this because you joined the Plated beta waitlist at joinplated.app.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = betaInvite
    ? [
        'Your seat is ready.',
        '',
        'Your Plated beta invite is live:',
        inviteUrl,
        '',
        "What you're joining: rate every plate, discover hidden gems, watch real Platos.",
        '',
        'Instagram: https://instagram.com/joinplatedapp',
        'TikTok: https://tiktok.com/@joinplatedapp',
        `Privacy policy: ${SITE_URL}/privacy`,
      ].join('\n')
    : [
        "You're on the Plated beta list.",
        '',
        "Thanks for joining early. We open the beta in small batches, and we'll email you the moment yours is ready.",
        '',
        "What you're joining: rate every plate, discover hidden gems, watch real Platos.",
        '',
        'Instagram: https://instagram.com/joinplatedapp',
        'TikTok: https://tiktok.com/@joinplatedapp',
        `Privacy policy: ${SITE_URL}/privacy`,
      ].join('\n');

  return { subject, html, text };
}

export { escapeHtml, validInviteUrl };
