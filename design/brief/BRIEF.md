# Plated — Design Brief for Claude Design

## What this is

Plated is a **Beli-style dish-rating app** — a mobile social feed for rating and
discovering specific plates/dishes (not just restaurants). "Plated" is a
working codename, not cleared for release.

This brief is for handing to **Claude Design** to prompt a better visual design
for the app — not a design-system sync. Plated is a React Native/Expo app
(native iOS/Android), so its actual component code can't render inside Claude
Design's browser-based tool. Instead, use the real token values below plus
the attached screenshots as ground truth for what exists today, and prompt
fresh screen designs against them.

## Current structure (5-tab app)

1. **Home** — a vertical feed of dish posts from people you follow. Each card:
   creator avatar + name + restaurant, a verified checkmark, an "Earns
   commission" affiliate-disclosure pill, the dish photo, dish name, a
   flame-badged rating score (e.g. "🔥 9.5"), reorder count, caption, and a
   row of like / comment / save icons plus a prominent orange "Order" CTA.
2. **Explore** — toggles between:
   - **Discover**: a 2-column grid of trending/top-rated/most-reordered/nearby
     dishes, each tile showing photo, rating badge, dish name, restaurant + creator handle.
   - **Platos**: a full-screen, TikTok/Reels-style vertical video feed of
     short creator clips about a specific dish — pull-down to reshuffle, right-side
     rail for like/comment/order/share, creator + dish info pinned near the
     bottom just above the tab bar.
3. **Create (center `+` button)** — opens an action sheet: "Rate a plate" or
   "Post a Plato" (record/upload a short vertical video, tag a restaurant via
   place search, name the dish, write a caption, set a 0–10 rating via a
   segmented bar + numeric input).
4. **Ranks** — leaderboard (not pictured in this batch).
5. **Profile** — has Plates / Reviews / Platos tabs (not pictured in this batch).

## Brand feel

Warm, upscale, food-forward — "premium" without being cold or corporate.
Two live-switchable themes: **Saffron** (cream + amber-gold, light) and
**Noir Gold** (charcoal + warm gold, dark). See `tokens.md` for exact values.
Fraunces (a soft-serif display face) carries the logo/headings — it's core
to the "upscale" read and should probably survive any redesign.

One deliberate constraint already encoded in the app: the **Order CTA is
always warm-orange in both themes** (cool tints were found to suppress
appetite), and **top-rated dishes (≥9.0) always get a flame icon**, so meaning
survives grayscale/colorblind viewing. Worth respecting these in any redesign
rather than treating them as arbitrary color choices.

## What "better design" might mean — worth clarifying with whoever prompts this

The current UI (see screenshots) is functional and on-brand but fairly
standard social-feed chrome. Open questions to resolve before/while prompting:
- Is the ask sharper typography/spacing polish within the current structure,
  or a more fundamental layout rethink?
- Any specific screens that feel weakest today? (My read: the Discover grid
  tiles are dense/generic; the New Plato form is a long plain scroll of
  stacked fields with no visual hierarchy.)
- Any competitor apps/screens to point at as a reference for the target bar?

## Attached screenshots (real device, current build)

All from the **Noir Gold (dark)** theme — no Saffron (light) screenshot was
captured this pass, so light-mode contrast/spacing should be spot-checked
against `tokens.md` rather than assumed identical in feel.

1. `01-app-icon.png` — app icon (fork/knife mark on amber-gold)
2. `02-home-feed.png` — Home feed, dish card anatomy
3. `03-explore-discover.png` — Discover grid
4. `04-platos-reel.png` — Platos vertical video reel
5. `05-new-plato-video-step.png` — New Plato: empty video-picker state
6. `06-new-plato-form.png` — New Plato: restaurant/dish/caption/rating form

## Suggested opening prompt for Claude Design

> Plated is a warm, upscale food-rating app (like Beli, but per-dish). Here's
> our real palette, type scale, and spacing tokens (tokens.md), plus
> screenshots of our current Home feed, Discover grid, video-reel feed, and
> post-creation flow. Keep our two themes (Saffron light / Noir Gold dark),
> our Fraunces display type, and the rule that the Order button is always
> warm-orange and 9.0+ ratings always get a flame — everything else is open
> to a sharper take. Start with [the screen/flow you most want redesigned].
