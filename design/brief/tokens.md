# Plated — Design Tokens

Extracted verbatim from `src/theme/palettes.ts`. These are the real values the
shipping app uses today — hand them to Claude Design as ground truth, not as
a starting guess.

## Color palettes

Plated ships two hand-tuned themes, switchable live in-app. Every screen reads
colors through a `useTheme()` hook — nothing is hardcoded per-screen.

### Saffron (light, default)

| Token | Hex | Use |
|---|---|---|
| `background` | `#FFFDF8` | App background |
| `surface` | `#FBF3E2` | Raised surfaces — section backgrounds, inputs |
| `card` | `#FFFFFF` | Cards / feed items |
| `text` | `#251B10` | Primary text |
| `textMuted` | `#8C7B61` | Secondary / muted text |
| `border` | `#EFE3CC` | Hairline borders & dividers |
| `accent` | `#B07207` | Brand accent |
| `accentSoft` | `#FBEDCE` | Tinted accent background (chips, soft buttons) |
| `accentText` | `#FFFFFF` | Text/icon on top of `accent` |
| `success` | `#2E9E63` | Positive / verified |
| `ratingHigh` | `#2E9E63` | Rating score ≥ 8.5 |
| `ratingMid` | `#D98E0B` | Rating score 6.5–8.4 |
| `ratingLow` | `#D9542F` | Rating score < 6.5 |
| `shadow` | `#3A2A0E` | Shadow tint (iOS) |
| `orderCta` | `#D9480F` | Order call-to-action (always warm) |
| `orderCtaText` | `#FFFFFF` | Text on `orderCta` |

### Noir Gold (dark)

| Token | Hex | Use |
|---|---|---|
| `background` | `#121110` | App background |
| `surface` | `#1C1813` | Raised surfaces |
| `card` | `#221C14` | Cards / feed items |
| `text` | `#F5F1E8` | Primary text |
| `textMuted` | `#A99F8C` | Secondary / muted text |
| `border` | `#33291B` | Hairline borders & dividers |
| `accent` | `#D9A441` | Brand accent |
| `accentSoft` | `#2E2415` | Tinted accent background |
| `accentText` | `#1A1304` | Text/icon on top of `accent` |
| `success` | `#5BD08A` | Positive / verified |
| `ratingHigh` | `#6BD98A` | Rating score ≥ 8.5 |
| `ratingMid` | `#E0A93E` | Rating score 6.5–8.4 |
| `ratingLow` | `#FF7A6B` | Rating score < 6.5 |
| `shadow` | `#000000` | Shadow tint |
| `orderCta` | `#D9480F` | Order call-to-action — same warm orange in BOTH themes by design (research: cool tints suppress appetite) |
| `orderCtaText` | `#FFFFFF` | Text on `orderCta` |

## Spacing scale

| Token | Value |
|---|---|
| `xs` | 4 |
| `sm` | 8 |
| `md` | 12 |
| `lg` | 16 |
| `xl` | 24 |
| `xxl` | 32 |

## Corner radius scale

| Token | Value |
|---|---|
| `sm` | 8 |
| `md` | 12 |
| `lg` | 18 |
| `xl` | 26 |
| `pill` | 999 |

## Typography scale

| Token | Size | Weight | Letter spacing |
|---|---|---|---|
| `hero` | 30 | 800 | -0.5 |
| `title` | 22 | 800 | -0.3 |
| `heading` | 18 | 700 | -0.2 |
| `body` | 15 | 500 | — |
| `bodyStrong` | 15 | 700 | — |
| `label` | 13 | 600 | — |
| `caption` | 12 | 500 | — |

Typeface: **Fraunces** (via `@expo-google-fonts/fraunces`) for display/serif
moments (logo, headings); system sans for body text. Fraunces is a soft-serif
display face — it's doing a lot of the "upscale" feel here, worth preserving.

## Rating color logic

Ratings are 0–10. Color follows the score, not a fixed palette:
- ≥ 8.5 → `ratingHigh` (green)
- 6.5–8.4 → `ratingMid` (amber)
- < 6.5 → `ratingLow` (red/orange)
- ≥ 9.0 also gets a flame icon — "meaning survives grayscale & colorblindness"
  is an explicit design requirement already encoded in the app.

Badge text color is computed per-background via YIQ luma (not hardcoded
white), since rating colors shift between themes.
