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
    ├── index.html
    ├── privacy/index.html
    ├── terms/index.html
    ├── 404.html
    ├── styles.css
    └── images/
```

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
