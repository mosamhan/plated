# joinplated.app — marketing site

Static landing page for Plated, deployed as a Cloudflare Worker with static assets
(the same architecture as Pages, but living in this one Worker so it can share
the `joinplated.app/*` routes already used for OG-unfurl share links).

## Layout

```
web/
├── wrangler.jsonc       # Worker config: assets dir, routes, run_worker_first
├── src/index.js         # OG-unfurl proxy (unchanged logic, just scoped now)
└── public/              # the actual site — served as static assets
    ├── index.html       # hero, feature cards, and beta waitlist
    ├── privacy/index.html
    ├── terms/index.html
    ├── 404.html
    ├── styles.css       # light (Saffron) + dark (Noir Gold) theme variables
    ├── theme.js         # dark-mode toggle click handler
    ├── waitlist.js      # beta waitlist form submission
    └── images/          # real screenshots from a live iOS Simulator run, not mockups
```

Each feature card's screenshot is a real capture from the current `develop`
build (not a mockup) — see the main repo's `web/` commit history for how
each one was captured (several needed a temporary, reverted-before-commit
local state flip on the simulator to reach a screen with no direct deep
link; a couple used a plain `plated://order/<id>`-style deep link once the
real record id was looked up in Supabase). If the app's UI changes in a way
that makes one of these stale, recapture from a real running build rather
than hand-editing or reusing an old screenshot — that's what went wrong the
first time these were added, using screenshots from an Aug-dated design
handoff folder that predated three merged feature branches.

## Why one Worker instead of a separate Pages project

`joinplated.app/*` and `www.joinplated.app/*` already had live Workers routes
pointed at a script called `share-preview` (see `supabase/functions/share-preview`)
that builds Open Graph cards for shared plate/plato/restaurant/profile links so
they unfurl correctly in iMessage/Slack/X. Workers routes take priority over
anything else bound to a zone, so a separate Pages project on the same domain
would never actually be reached — the existing route would keep intercepting
every request first.

Rather than touch DNS or re-point those routes, this Worker keeps the same
name (`share-preview`) and gets a `public/` assets directory added to it, with
`assets.run_worker_first` scoped to just the four share-link path shapes
(`/p/*`, `/plato/*`, `/r/*`, `/@*`). Everything else — `/`, `/privacy`,
`/terms`, images — is served straight from `public/` with no Worker
invocation at all. `src/index.js` is otherwise identical to what was already
deployed.

## Content sync

`public/privacy/index.html` and `public/terms/index.html` are static copies of
`src/app/legal/privacy.tsx` / `terms.tsx`'s `SECTIONS`. The in-app privacy
screen notes "a public web copy is required for store submission" — if the
in-app copy changes, update these two files in the same change.

## Dark mode

`styles.css`'s `:root` and `:root[data-theme="dark"]` blocks mirror
`src/theme/palettes.ts`'s `saffron` (light) and `noir` (dark) palettes
exactly — same hex values, pulled from that file directly, not
re-derived. If the app's palette values change, update both blocks to
match; `accent`/`order-cta` are deliberately identical across themes in
both the app and here.

The theme is set by a small blocking inline `<script>` at the very top of
each page's `<head>`, before the stylesheet loads: an explicit choice in
`localStorage['plated-theme']` wins, otherwise it falls back to
`prefers-color-scheme`. That script has to stay inline and un-deferred (not
moved into `theme.js`) or there's a flash of the wrong theme on load.
`theme.js` only wires up the toggle button's click handler.

## Local dev

```bash
cd web
npm install
npm run dev       # wrangler dev — serves public/ + proxies share-link paths
```

## Deploy

```bash
cd web
npx wrangler login   # first time only, on this machine
npm run deploy
```

## Beta waitlist email setup

The waitlist writes to `public.waitlist_signups` through the Supabase Edge
Function `waitlist-signup`. Its migration is `0073_beta_waitlist.sql`. Apply the
migration and deploy the functions before enabling live signups:

```bash
supabase db push
supabase functions deploy waitlist-signup --no-verify-jwt
supabase functions deploy send-beta-invites --no-verify-jwt
```

Before exposing the anonymous signup endpoint, configure Cloudflare Turnstile:

- Create a managed widget for `joinplated.app` and `www.joinplated.app`.
- Put its public site key in the `data-sitekey` attribute of
  `#waitlist-turnstile` in `public/index.html`.
- Set the private secret as the Supabase Function secret `TURNSTILE_SECRET_KEY`.

The form stays disabled while the site key is blank, and the Edge Function
rejects submissions unless Cloudflare validates the one-time token, hostname,
and `waitlist_signup` action. The origin and honeypot checks remain as
additional safeguards, not substitutes for Turnstile.

Set these Supabase Function secrets after verifying the sender domain in Resend:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` (for example, a verified `beta@joinplated.app` sender)
- `RESEND_NEWSLETTER_SEGMENT_ID` (optional until a newsletter segment exists)
- `BETA_ACCESS_URL` (leave unset until a real TestFlight invite URL exists)
- `BETA_INVITE_ADMIN_TOKEN` (long random secret for one-time batch invitations)
- `TURNSTILE_SECRET_KEY`

Use a server-only Resend API key with email-sending and contact/segment access;
store it only as a Supabase Function secret, never in the browser.

The site stores beta signups separately from newsletter consent. Only people
who check the optional newsletter box are added to the Resend segment. New
waitlist signups receive a confirmation when the Resend API key and sender are
configured but `BETA_ACCESS_URL` is unset; once a real TestFlight URL is set,
new signups receive that invite. To send invites to people already waiting,
call `send-beta-invites` with the admin token after setting the real invite URL.
Use Google Workspace for a branded human inbox, Resend for beta and explicitly
opted-in newsletter email, and Stripe's billing emails for Stripe transactions;
keep receipts outside the newsletter flow. Configure the `privacy@joinplated.app`
mailbox or alias before publishing the privacy policy.
