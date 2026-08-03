# Plated — Deployment & Store-Readiness Checklist

Research-backed checklist (June 2026) for getting Plated onto TestFlight, the App Store, and
Google Play. Items are ordered; blockers are marked ⛔.

## 0. Naming — do this before anything irreversible

⛔ **"Plated" is an uncleared codename.** Before first store submission:
1. USPTO trademark search (ideally with an attorney) — the old Plated meal-kit mark is owned by
   Albertsons and may not be abandoned.
2. App Store + Play search for collisions (a food-inventory "Plated" already exists on iOS).
3. Domain + social handles.

`ios.bundleIdentifier` / `android.package` are currently `com.samhan.plated`. These become
**permanent on first release** (display name stays freely changeable). If the brand name changes,
update these BEFORE the first store upload.

## 1. Accounts (start now — verification takes days)

- [ ] Apple Developer Program — $99/yr. Needed for TestFlight + App Store.
- [ ] Google Play Console — $25 one-time. ⚠️ New **personal** accounts must run a closed test with
      **12 testers for 14 consecutive days** before production access. An **organization** account
      (needs D-U-N-S number) skips this — worth it anyway since creator payouts imply incorporating.
- [ ] Expo account + `npm i -g eas-cli` + `eas login`.

## 2. In-app compliance features — DONE ✅ (required before review)

- [x] Report content (Apple 1.2) — reason picker, confirmation, 24h-SLA messaging (`src/app/report.tsx`)
- [x] Block users (Apple 1.2) — from profiles; content filtered everywhere; managed in Settings (`src/app/settings/blocked.tsx`)
- [x] Terms acceptance gate at sign-up, with zero-tolerance + CSAE clauses (`src/app/legal/terms.tsx`)
- [x] Account deletion (Apple 5.1.1(v)) — Settings → Account → Delete account
- [x] Contact route — support@plated.app in Settings
- [x] FTC 16 CFR 465 (Reviews Rule) compliance: commission labels on creator content,
      disclosure before order hand-off, earnings decoupled from rating sentiment

## 3. Legal web presence (required even with no backend)

- [ ] Static site with `/privacy`, `/terms`, `/delete-account` (public HTTPS, no login —
      Play Data Safety requires the deletion URL). Mirror the in-app drafts in `src/app/legal/`.
- [ ] Designate a child-safety contact (safety@plated.app) — Play Child Safety Standards.

## 4. Store metadata & assets

- [ ] App icon ✅ (generated — `assets/images/icon.png` + Android adaptive set)
- [ ] 5–8 iPhone screenshots at **1320×2868** (6.9"): feed → rating → Plated's Rating →
      order hand-off → leaderboard. Take from a real device/simulator in the Saffron theme.
- [ ] Play: 512×512 icon + 1024×500 feature graphic.
- [ ] Privacy nutrition labels (Apple) and Data Safety form (Play) — declare: Contact Info,
      User Content, Identifiers, Usage Data. **Must agree with the privacy policy exactly.**
- [ ] Age rating questionnaires (Apple's new mandatory one + Play IARC) — declare UGC + user
      interaction honestly; expect 13+/Teen.
- [ ] Keep `supportsTablet: false` (already set) — avoids the iPad screenshot/layout burden at v1.

## 5. Build & submit flow

```bash
eas build --profile development --platform ios   # dev client for device testing
eas build --profile preview --platform all       # shareable internal builds
eas build --profile production --platform all    # store builds (autoIncrement on)
eas submit --platform ios                        # after filling ascAppId/appleTeamId in eas.json
# Android: upload the FIRST .aab manually in Play Console, then eas submit works
```

TestFlight sequence: internal testing (instant, up to 100 testers) → external public link
(first build goes through ~1-day Beta App Review — report/block must already work in that build).
Run the Play 14-day closed test in parallel, not after.

## 6. App Review notes (preempt the stalls)

- [ ] Seeded demo account credentials in the review notes (auth-gated app = instant stall without).
- [ ] Note that ordering is a **hand-off to third-party providers for physical goods** —
      exempt from IAP under guideline 3.1.5(a); no payments occur in-app.
- [ ] Note creator commissions apply to physical-goods orders (also 3.1.5(a) territory) and that
      commission-bearing content is labeled in-feed.
- [ ] Describe the moderation plan: in-app reporting → 24h human review → removal/ban.

## 7. Monetization plumbing (post-TestFlight)

- [ ] Join Impact.com as a mobile publisher → DoorDash/Uber Eats CPA bounties (new-customer only).
- [ ] Append `subId1=creatorId, subId2=plateId, subId3=sessionId` to outbound provider links
      (stub lives in `OrderProviderSheet.handlePick`).
- [ ] Stripe Connect Express for creator payouts; collect W-9 before first payout
      (1099-NEC threshold: $2,000 for 2026 payments). Never pay earnings as in-app currency.
- [ ] Never incentivize the *ordering* user (no points/cashback for tapping provider links) —
      affiliate networks terminate publishers for incentivized traffic.

## 8. API key hygiene — one step left ⚠️

Foursquare and Google Directions are now proxied by Edge Functions
(`supabase/functions/{places,directions}`), so neither key is in the JS bundle
and both require a signed-in user. **Verified by grepping a production Hermes
export**, not just the source.

The remaining gap: `EXPO_PUBLIC_GOOGLE_MAPS_KEY` and `GOOGLE_MAPS_IOS_API_KEY`
are currently **the same key value**, and the Maps-SDK one is necessarily baked
into `ios/Plated/Info.plist` in the shipped binary. So the secret now sitting in
`GOOGLE_DIRECTIONS_KEY` is still extractable from the app — the proxy closed the
JS path but not the native one. Two Console steps close it for good:

- [ ] **Create a second Google key for Directions.** Restrict it to the
      **Directions API only**, and store it as the function secret:
      `supabase secrets set GOOGLE_DIRECTIONS_KEY=<new-key>`. It never ships
      anywhere, so nothing can extract it.
- [ ] **Restrict the iOS Maps SDK key** (`GOOGLE_MAPS_IOS_API_KEY`): Application
      restrictions → **iOS apps** → bundle id `com.samhan.plated`; API
      restrictions → **Maps SDK for iOS** only. Extraction from Info.plist then
      buys an attacker nothing.
- [ ] **Restrict the Android Maps SDK key** (`GOOGLE_MAPS_ANDROID_API_KEY`):
      Application restrictions → **Android apps** → package `com.samhan.plated`
      + the release SHA-1; API restrictions → **Maps SDK for Android** only.

> Why the split is necessary: application restrictions (bundle id / referrer)
> only work for client SDKs. Directions is a **web service** API, and those
> accept **IP restrictions only** — impossible for a phone on a cell network.
> A proxy is Google's own documented answer, which is why one key can't do both
> jobs safely.
> https://developers.google.com/maps/api-security-best-practices

> Why iOS and Android can't share one key either: **API** restrictions are a
> multi-select (one key can enable many services), but **Application**
> restrictions are a single radio — None / HTTP referrers / IP / Android / iOS.
> Google: *"If you place an application restriction on an API key, you cannot
> use it on other platforms."* A shared key would have to be
> Application-restricted **None**, and it ships in plaintext inside
> `Info.plist` / `AndroidManifest.xml` — i.e. anyone who unzips the app can bill
> your project. Two keys is the only configuration where both platforms are
> restricted. Don't merge them.

## Known deferrals (intentional)

- FlashList v2 — pointless at mock-data scale; adopt when real data ships.
- expo-symbols (SF Symbols) — Ionicons + Reanimated effects cover the demo cross-platform.
- expo-router formSheet for the order sheet — current Modal works on all targets incl. web preview.
- Canonical dish picker in create flow — needs a real dish data model; next phase with backend.
