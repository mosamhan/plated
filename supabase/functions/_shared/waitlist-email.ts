/**
 * Shared HTML/plain-text builder for every beta-waitlist email — the
 * immediate "you're on the list" welcome and the later real TestFlight
 * invite once BETA_ACCESS_URL is set. One template, called from both
 * waitlist-signup and send-beta-invites, instead of two copies that would
 * drift the moment one of them got a copy tweak and the other didn't.
 *
 * Table-based layout, inline styles only, no <style> block and no external
 * stylesheet — the only way an email actually renders consistently across
 * Gmail/Outlook/Apple Mail, which each strip or mangle different subsets of
 * modern CSS. Deliberately fixed to a single dark "Noir Gold" look (mirrors
 * web/public/styles.css's :root[data-theme="dark"] block's hex values
 * exactly, not re-derived) rather than following the recipient's own client
 * theme — a handful of clients auto-invert unstyled dark HTML in ways that
 * would otherwise wreck this.
 */

const SITE_URL = 'https://joinplated.app';
const LOGO_URL = `${SITE_URL}/brand/plated-profile.png`;

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
             style="display:block; width:100%; max-width:164px; height:auto; border-radius:14px; border:1px solid #33291B;" />
        <p style="margin:10px 0 0; font-family:Georgia,'Times New Roman',serif; font-size:13px; line-height:1.3; color:#F5F1E8; text-align:center;">
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
          <span style="display:inline-block; font-family:Georgia,'Times New Roman',serif; font-size:13px; font-weight:bold; color:#D9A441;">${n}</span>
        </td>
        <td valign="top" style="padding:0 0 16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:14px; line-height:1.5; color:#A99F8C;">
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
              <td align="center" bgcolor="#D9480F" style="border-radius:12px;">
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
<meta name="color-scheme" content="dark" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0; padding:0; background-color:#121110;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#121110;">
    ${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#121110">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:100%;">

          <tr>
            <td align="center" style="padding-bottom:24px;">
              <img src="${LOGO_URL}" width="72" height="72" alt="Plated"
                   style="display:block; width:72px; height:72px; border-radius:20px;" />
            </td>
          </tr>

          <tr>
            <td align="center" style="padding-bottom:28px; border-bottom:1px solid #33291B;">
              <p style="margin:0 0 10px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:12px; font-weight:bold; letter-spacing:1.5px; text-transform:uppercase; color:#D9A441;">
                Plated Early Access
              </p>
              <h1 style="margin:0 0 12px; font-family:Georgia,'Times New Roman',serif; font-size:34px; line-height:1.15; font-weight:bold; color:#F5F1E8;">
                ${escapeHtml(headline)}
              </h1>
              <p style="margin:0; max-width:440px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:15px; line-height:1.55; color:#A99F8C;">
                ${escapeHtml(subhead)}
              </p>
            </td>
          </tr>

          ${ctaBlock}

          <tr>
            <td style="padding:32px 0 8px;">
              <p style="margin:0 0 16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:12px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#79694F; text-align:center;">
                What you're joining
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${screenshotRow()}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 24px 8px; background-color:#1C1813; border-radius:16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${stepsBlock(betaInvite)}
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:32px 0 8px;">
              <p style="margin:0 0 8px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:12px; line-height:1.6; color:#79694F;">
                <a href="https://instagram.com/joinplatedapp" style="color:#D9A441; text-decoration:none;">Instagram</a>
                &nbsp;&middot;&nbsp;
                <a href="https://tiktok.com/@joinplatedapp" style="color:#D9A441; text-decoration:none;">TikTok</a>
                &nbsp;&middot;&nbsp;
                <a href="${SITE_URL}/privacy" style="color:#D9A441; text-decoration:none;">Privacy policy</a>
              </p>
              <p style="margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.6; color:#5E5240;">
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
