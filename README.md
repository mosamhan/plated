<div align="center">

<img src="assets/images/icon.png" width="104" alt="Plated app icon" />

# Plated

**Rate the dish, not the restaurant — then order the exact plate someone vouched for.**

A social food-discovery app where the unit of rating is the individual **dish**, not the venue.
Browse a feed of real plates people loved, see a restaurant's cumulative **"Plated's Rating,"**
and hand off to DoorDash / Uber Eats / pickup to order the specific dish — not just the spot.

[![Expo SDK 56](https://img.shields.io/badge/Expo-SDK_56-000020?logo=expo&logoColor=white)](https://docs.expo.dev/)
[![React Native 0.85](https://img.shields.io/badge/React_Native-0.85-61DAFB?logo=react&logoColor=white)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Expo Router](https://img.shields.io/badge/Expo_Router-v6-000)](https://docs.expo.dev/router/introduction/)
[![Platform](https://img.shields.io/badge/iOS_·_Android_·_Web-lightgrey)](#)

</div>

> **Status:** live Supabase backend (Postgres + RLS + Realtime + Edge Functions), ~100%
> TypeScript, runs on iOS / Android / web from one codebase. "Plated" is a working codename
> pending trademark clearance. Built to demonstrate production-grade mobile architecture, design
> systems, and app-store/FTC compliance — not a static demo.

---

## 📱 Screens

<table>
  <tr>
    <td align="center"><img src="assets/screenshots/home.png" width="200"/><br/><b>Home feed</b><br/><sub>Dish-first social feed</sub></td>
    <td align="center"><img src="assets/screenshots/plate-detail.png" width="200"/><br/><b>Plate detail</b><br/><sub>Reorder count · creator · order CTA</sub></td>
    <td align="center"><img src="assets/screenshots/restaurant.png" width="200"/><br/><b>Restaurant</b><br/><sub>Cumulative "Plated's Rating"</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="assets/screenshots/explore.png" width="200"/><br/><b>Explore</b><br/><sub>Filterable plate grid</sub></td>
    <td align="center"><img src="assets/screenshots/creator.png" width="200"/><br/><b>Creator dashboard</b><br/><sub>Attributed-order earnings</sub></td>
    <td align="center"><img src="assets/screenshots/leaderboard.png" width="200"/><br/><b>Leaderboard</b><br/><sub>Best restaurants / plates / creators</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="assets/screenshots/profile.png" width="200"/><br/><b>Profile</b><br/><sub>Stats, socials, creator card</sub></td>
    <td align="center"><img src="assets/screenshots/themes.png" width="200"/><br/><b>Live theming</b><br/><sub>5 palettes, instant switch</sub></td>
    <td align="center"><img src="assets/screenshots/dark-mode.png" width="200"/><br/><b>Noir Gold</b><br/><sub>Premium dark mode</sub></td>
  </tr>
</table>

---

## ✨ What makes it different

Most food apps rate **restaurants**. Plated rates the **dish** — which changes the whole data model
and unlocks features a venue-rating app structurally can't offer:

- **🍽️ Dish-level ratings** — every "plate" is photographed, rated 1–10, and individually orderable.
- **📊 "Plated's Rating"** — a restaurant's score is the *cumulative average of every plate* rated
  there, not a vibe score.
- **🔁 The Reorder signal** — the highest-praise action in food. Plates track how many people
  ordered them *again* — a trust metric no rating app captures today.
- **🤝 Creator economy** — food creators earn on **attributed orders** from their plates
  (decoupled from rating sentiment — FTC 16 CFR 465 compliant), with a full earnings dashboard.
- **🛵 Order hand-off, not payments** — a provider sheet deep-links to DoorDash / Uber Eats /
  pickup. Discovery is the product; logistics stay a commodity.
- **💬 Real-time messaging** — 1:1 and group chats over Supabase Realtime: voice notes, photo
  albums, GIF search (Giphy), rich link previews for pasted URLs, @mentions, message
  edit/pin/reply, typing presence, read receipts, and per-conversation streaks.
- **🗂️ Shared collections** — a collection owned by a conversation instead of one person: any
  member (group or 1:1) can add plates/Platos/restaurants to it from anywhere in the app, the same
  way they'd save to their own list. It shows up in each member's profile as **Shared**, private to
  the conversation until its creator opens it up publicly.

---

## 🧱 Tech stack & architecture

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Expo SDK 56 + React Native 0.85** (New Architecture) | One codebase → iOS, Android, web |
| Routing | **Expo Router v6** (file-based) | Typed, deep-linkable, native stack + custom tab bar |
| Language | **TypeScript** (strict) | End-to-end type safety, zero `any` in domain code |
| Backend | **Supabase** (Postgres + RLS + Realtime + Edge Functions) | Auth, live data, and >60 migrations under `supabase/migrations/`; see [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) |
| State | **React Context** stores (`DataContext`, `AuthContext`, `MessagesContext`, …) | Selector-based, backed by Supabase; falls back to seeded mock data with no keys configured |
| Animation | **Reanimated 4** + **Gesture Handler** | 60fps entrance/press/like micro-interactions on the UI thread |
| Theming | Custom token system + `useTheme()` | **5 palettes**, persisted via AsyncStorage, instant app-wide switch |
| Vectors | **react-native-svg** | The logo mark renders identically to the app icon at any size |
| Images | **expo-image** | Blurhash placeholders, disk cache, cross-fade |
| Build/Ship | **EAS Build & Submit** | `development` / `preview` / `production` profiles configured |

**Design system:** every color comes from a theme token — no hardcoded colors — so all five themes
(Saffron, Coral, Fresh Teal, Midnight, Noir Gold) restyle the entire app instantly. Rating-badge
text color is computed for contrast (WCAG-aware), and the order CTA stays warm in every theme
because cool tints suppress appetite.

### Project structure

```
src/
├── app/                      # Expo Router routes (screens)
│   ├── (auth)/               # sign-in / sign-up (+ terms gate)
│   ├── (tabs)/               # home · explore · leaderboard · profile + custom tab bar
│   ├── order/[id].tsx        # plate detail + comments + order hand-off
│   ├── restaurant/[id].tsx   # "Plated's Rating" + plates here
│   ├── messages/              # inbox, thread, group/chat info, invite links
│   ├── creator.tsx           # creator earnings dashboard
│   ├── report.tsx            # UGC reporting (Apple 1.2)
│   ├── legal/                # terms (CSAE/zero-tolerance) + privacy
│   └── settings/             # appearance (themes), blocked users, delete account
├── components/               # PlateCard, OrderProviderSheet, RatingBadge, MessageBubble, …
├── theme/                    # palettes (5), ThemeContext, fonts, rating logic
├── store/                    # DataContext, AuthContext, MessagesContext, PlatosContext, …
├── lib/                      # haptics, cross-platform dialogs, invite/FTC helpers, Giphy/link-preview clients
└── data/                     # typed domain models + seeded mock data (used when no backend keys are set)

supabase/
├── migrations/                # sequential, idempotent — see CONTRIBUTING.md
└── functions/                 # Edge Functions proxying billable keys (Foursquare, Giphy, Google) and scraping link previews
```

---

## 🚀 Getting started

```bash
npm install
npx expo start
```

Then:
- **iOS Simulator** — press `i` (requires Xcode)
- **Android** — press `a` (requires Android Studio)
- **Phone** — scan the QR code with **Expo Go**
- **Web** — press `w`

> Mock images load from Unsplash / pravatar, so an internet connection is needed at demo time.

---

## ✅ Engineering quality

This prototype was built to a shippable bar, not just a demo:

- **App Store readiness** — UGC content reporting, user blocking, account deletion (Guideline
  5.1.1(v)), terms-acceptance gate, and child-safety (CSAE) policy are all implemented in-app.
  See [`DEPLOYMENT.md`](DEPLOYMENT.md) for the full submission checklist.
- **FTC compliance** — creator commissions are disclosed *before* every order action and on every
  surface that shows monetized content; earnings never depend on positive ratings.
- **Cross-platform correctness** — e.g. `Alert.alert` is a no-op on react-native-web, so all
  destructive confirms route through a platform-aware dialog helper.
- **Adversarially reviewed** — the codebase was put through a multi-lens review (correctness, UX,
  compliance) and the confirmed findings fixed.

---

## 🗺️ Roadmap

- [x] **Backend** — Supabase (Postgres + RLS + Realtime), live restaurant data (Foursquare Places)
- [x] Push notifications & real-time messaging (1:1, groups, mentions, link previews, GIFs)
- [ ] Real device-contact-graph friend discovery — "In your contacts" matching currently runs
      against seeded mock contacts (`src/data/contacts.ts`), not a real `expo-contacts` permission
      request against the device's address book
- [ ] Real affiliate attribution for order hand-offs (Impact.com → DoorDash/Uber Eats)
- [ ] TestFlight → App Store / Google Play submission — see [`DEPLOYMENT.md`](DEPLOYMENT.md)
- [ ] Trademark clearance & final brand name

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for how new work gets branched, committed, and documented.

---

<div align="center">
<sub>Built with React Native, Expo, and TypeScript. Designed, themed, and shipped as a portfolio project.</sub>
</div>
