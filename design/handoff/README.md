# Handoff: Explore Map, Wordmark Brand, Ranks Filters, Profile Tabs & Settings

## Overview
This package specifies a batch of design updates for **Plated** (the dish-first food-discovery
app) so they can be implemented for real in the production **React Native / Expo** codebase
(`github.com/mosamhan/plated`). It covers: a redesigned Explore **Map**, the new **wordmark** app
icon/brand, **Ranks** filtering, **Profile** content tabs, relocating **Settings** to Profile, and a
map-scoped settings sheet with **Collections** and **Categories**.

## Latest additions (this revision)
- **Map restaurant detail is an overlay**, not a full modal: transparent backdrop (map stays visible
  behind), an **X** close button in the photo hero, and the map's bottom filter row hides while it's
  open. In React Native use a bottom-sheet at ~82% height over the live map.
- **Named Collections**: starter lists **Want to try** + **Favorites**, plus user-created lists. A
  **Save-to picker** ("Save to…") lets an item join one or more lists. Model items as
  `{type:'restaurant'|'plate'|'plato', id, …}`. Persist per user (Supabase, not AsyncStorage).
- **Save buttons** are app-wide: the restaurant detail's bookmark and each **PlateCard** bookmark
  open the same Save-to picker (state lifted to an app-level store). Wire `PlateCard`'s new
  `onSave?: () => void` prop; when set it opens the picker instead of a local toggle. Extend the
  same to `PlatoTile` for saving platos.
- **Map filter toggle** renamed: **My Table** (your saved) vs **Platers** (all Plated users).
- **Map settings** sheet: Light/Dark map style, directions **Avoid tolls**, and links to Collections
  & Categories.
- **Restaurant detail sections**: location, directions, reserve, Plated's Rating (avg of N),
  **Top Raters**, **Top-rated plates**, **Top Platos here**, **Similar places**, **Platers to follow**.
- **Discover** tab title reads "Discover"; screen titles use **Fraunces** to match the wordmark logo.
- Note: in the web prototype, saves persist to `localStorage['plated.collections']`; production
  replaces this with the real per-user store.

## About the design files
The files in this bundle are **design references created in HTML/React-for-web** — prototypes that
show intended look and behavior. They are **not production code to copy directly**. The task is to
**recreate these designs in the existing Expo/React Native app** using its established patterns:
`useTheme()` tokens, the `@/components/*` primitives, `expo-router` screens, `DataContext` /
`PlatosContext` stores, and Supabase where persistence is needed. Do not port the HTML or the
web-only libraries (Leaflet, ionicons web component, Babel-in-browser) into the app.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and interactions are final and match the
shipping token system in `src/theme/palettes.ts`. Recreate pixel-faithfully with the app's existing
components; only the *new* screens/props below are additions.

## Target-codebase mapping (web prototype → real app)
| Prototype (this bundle) | Implement in the Expo app as |
|---|---|
| `Explore()` map mode | New mode in `src/app/(tabs)/explore.tsx` |
| Leaflet + OSM map | **`react-native-maps`** (Apple/Google provider) or **Google Maps SDK**; apply a custom light/dark map style JSON in the saffron palette |
| `RestaurantDetail` sheet | Extend `src/app/restaurant/[id].tsx` or a bottom-sheet component; reuse `RatingBadge`, `Avatar`, `Button` |
| `ExploreMap` pins | Custom `<Marker>` with a callout view (pill + colored category dot + score) |
| Save / Collections | `DataContext` methods + Supabase table `saved_places` (persist per user, not AsyncStorage) |
| Categories filter | Local screen state; optionally persisted user preference |
| Map settings (light/dark, avoid tolls) | Local + persisted prefs; feed `avoidTolls` into the directions deep-link in `src/lib/external.ts` |
| Full Settings on Profile | Already exists at `src/app/settings/index.tsx`; add the entry point from `profile` |
| Wordmark `Logo showMark={false}` | Add `showMark` prop to `src/components/Logo.tsx` |
| Ranks filters | State + segmented control in `src/app/(tabs)/leaderboard.tsx` |
| Profile tabs | Tab state in `src/components/ProfileView.tsx` |

## Screens / views

### 1. Explore → Map
- **Purpose:** browse Plated-reviewed restaurants on a map, search, filter, save, get details.
- **Layout:** full-bleed map. Top row (inset 14): map-settings gear (left, 44×44 circle), the
  Platos/Discover/Map segmented toggle (center pill), collection bookmark (right, 44×44 circle).
  Bottom row (inset 16): search circle, filter/categories circle, "Hitlisted" pill, "Anyone" pill.
- **Map style:** clean, minimal. Light = warm cream land (`#F3EBD9`), muted parks, white roads.
  Dark = charcoal (`#14120F`). Use a Google/Apple **custom style JSON**, not a CSS tile filter
  (that was a web-only hack). Center: user's city (prototype uses Chicago, 41.8955, −87.643, z13).
- **Pins:** white rounded pill, `#FFFDF8`, 2px border (`#fff`, or accent `#B07207` when saved),
  soft shadow. Left: 20px circle in the category color with a white glyph. Right: bold score
  (`#1A1413`, 13px/800). Saved pins add a gold ★. Category colors/glyphs:
  - loved → `#E4483B`, heart
  - been/tried → `#2E9E63`, checkmark
  - dining → `#251B10`, fork/knife
- **Filters:** search matches name/cuisine/area; categories toggle which types show; "Hitlisted"
  shows saved-only, "Anyone" shows all.

### 2. Restaurant detail (from a pin)
- **Purpose:** decide + act on a restaurant.
- **Content, in order:** name (Fraunces 22/600), cuisine · area; **Plated's Rating** — a large
  `RatingBadge` computed as the **average of all Plated user ratings** for that restaurant, labeled
  "Plated's Rating" with "Average of N Plated ratings"; action row = Directions (secondary),
  Reserve (primary), Save (bookmark toggle, 52px); location line (adds "· directions avoid tolls"
  when that pref is on); **Top-rated plates here** (photo + name + `RatingBadge` rows); **Top
  reviewers** (Avatar + @handle + their `RatingBadge`).
- Directions/Reserve reuse `src/lib/external.ts` (`openDirections`, `openReservation`); pass the
  `avoidTolls` preference into the maps deep-link.

### 3. Map settings sheet (gear on the map)
- Sections: **Map appearance** (Light / Dark segmented) · **Directions** (Avoid tolls switch) ·
  **Saved & filters** (rows → Collections, Categories). Persist all three per user.

### 4. Collections sheet (bookmark on the map)
- Title "Your Collection", "N saved places · synced to @handle". List of saved restaurants (name,
  cuisine·area, `RatingBadge`, remove bookmark). Empty state with bookmark-outline icon + prompt.
- **Growth note:** the prototype stores one flat list; production should support **named
  collections** ("Want to try", "Favorites", "Been"). Model as `collections(id, user_id, name)` +
  `collection_items(collection_id, restaurant_id)`.

### 5. Categories sheet
- Toggleable rows for Loved / Been there / Fine dining (colored circle + label + checkbox). Controls
  which pin types render.

### 6. Ranks (leaderboard) filters
- Segmented **Best Plates / Best Restaurants** + scope chips **Nearby / Global** (location vs earth
  icon). Each combination renders its own `RankRow` list. Nearby uses the user's location; Global is
  app-wide. Back these with real queries (avg rating, ordered).

### 7. Profile tabs + Settings entry
- Header: `Avatar` (72, verified) + name (Fraunces) + @handle · city, and a **settings gear**
  (40×40) top-right → opens the existing `src/app/settings/*`.
- Stats row (`StatPill` ×3). `SocialLinks`. Then an **icon tab bar** (grid / play-circle / star,
  active = accent with a 2px bottom border): **Plates** (2-col `PlateTile` grid) · **Platos** (2-col
  `PlatoTile` grid) · **Reviews** (restaurant review cards: photo, name, their `RatingBadge`, note).

### 8. Brand — wordmark
- The **standard app icon** is now the "Plated" wordmark (Fraunces 600) on the amber-gold gradient
  tile (light) or a charcoal tile with amber text (adaptive). Regenerate `assets/brand/` icon PNGs
  and `app.json` icon/splash from the wordmark. Keep the fork/knife glyph (`PlatedMark`) for tiny
  sizes (favicon, in-map fallback). In-app, `Logo` gains `showMark?: boolean` (default true);
  Home header uses `showMark={false}` (wordmark only).

## Interactions & behavior
- Sheets slide up (`translateY 100%→0`, ~260ms, `cubic-bezier(.22,1,.36,1)`); backdrop
  `rgba(0,0,0,0.45)`, tap-to-dismiss. In RN use the app's existing modal/bottom-sheet pattern.
- Save toggles are optimistic; persist to backend. Category/Hitlist/search re-filter markers live.
- Press feedback: scale ~0.95 spring; buttons lift on hover is web-only — on native use the
  existing `AnimatedPressable` scale-down.

## State
`mode` (platos|discover|map), `selectedRestaurant`, `query`, `searchOpen`, `activeTypes[]`,
`hitOnly`, `mapTheme` (light|dark), `avoidTolls`, `saved[]` (→ server), `showCollections`,
`showMapSettings`, `showCategories`; Profile `ptab`, `showSettings`; Ranks `category`, `scope`.

## Design tokens (authoritative — from `src/theme/palettes.ts`)
- Saffron: bg `#FFFDF8`, surface `#FBF3E2`, card `#FFFFFF`, text `#251B10`, muted `#8C7B61`, border
  `#EFE3CC`, accent `#B07207`, accentSoft `#FBEDCE`, success/ratingHigh `#2E9E63`, ratingMid
  `#D98E0B`, ratingLow `#D9542F`, orderCta `#D9480F`.
- Noir Gold: bg `#121110`, surface `#1C1813`, card `#221C14`, text `#F5F1E8`, muted `#A99F8C`,
  border `#33291B`, accent `#D9A441`, ratingHigh `#6BD98A`, ratingMid `#E0A93E`, ratingLow `#FF7A6B`.
- Category pin colors: loved `#E4483B`, been `#2E9E63`, dining `#251B10`, saved-star `#B07207`.
- Spacing 4/8/12/16/24/32 · radius 8/12/18/26/pill · type Fraunces (display) + system sans;
  hero 30/800, title 22/800, heading 18/700, body 15/500, label 13/600, caption 12/500.
- Rating logic: ≥8.5 high, 6.5–8.4 mid, <6.5 low; ≥9.0 adds a flame. Order CTA always warm orange.

## Assets
- `assets/brand/` — wordmark + glyph marks (SVG). Regenerate app icon/splash from the wordmark.
- Food/avatar imagery in the prototype is Unsplash/pravatar placeholder; production uses real
  user-uploaded photos via `expo-image` + Supabase storage.

## Files in this bundle
- `plated-app.html` — the full click-through web prototype (all screens above). Open in a browser.
- `readme.md` — the design system's brand/tone/visual-foundations + component index (source of truth).
- `SKILL.md` — Agent Skills manifest. To implement: download the **whole Plated Design System
  project** (not just this handoff) and drop it into your repo as a Claude Code skill
  (`.claude/skills/plated-design/`). That folder carries the component source, `styles.css`, and
  `tokens/` — Claude Code reads them alongside this README to build the features in your Expo app.

> Component/token source is intentionally **not duplicated** into this handoff folder (it would
> collide with the live design system). Get it from the design-system project root:
> `components/<group>/*.jsx` + `*.d.ts`, `styles.css`, `tokens/*.css`.
