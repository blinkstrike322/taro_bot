# Dithered Divinations

> Category: Mystical · Monochrome
> Tarot-reading Telegram WebApp. Cinema-black canvas, monochrome austerity, monumental display type. Inspired by Bugatti.com's visual discipline — pure `#000000`, pure `#FFFFFF`, and nothing else.

## 1. Visual Theme & Atmosphere

The app behaves like a digital oracle — a ceremonial terminal. The canvas is pure `#000000`, the only color that ever appears is white, and the entire interface is carried by typographic moments laid over card imagery. There are no decorative backgrounds, no glowing auras, no gradients, no shadows. It is one continuous cinema-black channel, interrupted only by the cards themselves and a few ALL CAPS monochrome labels.

The single most distinctive move is **contrast at scale**. Typography runs from monumental headings to fine-print captions, all in pure white on black. The cards are high-contrast B&W dithered illustrations. Everything else is silent so the reading can speak.

**Key Characteristics:**
- Cinema-black `#000000` canvas — no gradients, no tints, no accents
- Monochrome-only palette: `#000000` (canvas), `#FFFFFF` (text, borders), `#666666` (tertiary/disabled only)
- Pure white B&W card illustrations with dithering texture
- ALL CAPS monospace for UI labels and headers
- Serif for card names (the only typographic ornament)
- Rectangular everything — no border-radius anywhere

## 2. Color Palette

Strict. No exceptions.

| Token | Hex | Role |
|---|---|---|
| Canvas | `#000000` | Background, fills |
| White | `#FFFFFF` | Text, borders, button labels |
| Gray | `#666666` | Disabled text, tertiary labels only |
| (none) | — | No mid-tones beyond `#666666`. No accent colors. |

**Rules:**
- Every pixel is either `#000000`, `#FFFFFF`, or `#666666` (disabled only).
- No `rgba()`, no opacity tricks for creating colors.
- No gradients anywhere. No glow effects. No box-shadows.

## 3. Typography

| Role | Font | Weight | Size | Case |
|---|---|---|---|---|
| Display / headings | `'Pixelify Sans', 'Courier New', monospace` | 700 | 24px / 20px | UPPERCASE |
| Card names | `'Times New Roman', serif` | 400 | 20px | UPPERCASE |
| Body / labels | `'Courier New', 'Courier', monospace` | 400 | 12-14px | UPPERCASE |
| Interpretation | `'Courier New', 'Courier', monospace` | 400 | 14px | mixed case |

- **Letter-spacing:** `0.1em` for uppercase headings, `0.05em` for labels
- **Line-height:** 1.6 for body, 1.2 for headings
- **Font smoothing:** `-webkit-font-smoothing: none` for pixel fonts, `auto` for serif card names
- Google Fonts: `Pixelify Sans` (loaded, keep existing link)

## 4. Layout

- **Single column**, centered. Max-width: 400px.
- **Vertical stacking** with 24-32px gaps.
- **Content is top-biased** — card result sits at 25% from top, not center.
- Padding: 16px sides, 24px top/bottom.
- No sidebars, no multi-column.

### Screen flow
1. **Card pick** — 3 face-down cards in a row (12px gap). Title "ВЫБЕРИ КАРТУ" above.
2. **Card reveal** — clicked card flips (3D rotateY). Others fade out.
3. **Result** — revealed card (top third), card name below (serif, uppercase), interpretation block with dashed border below, then minimal navigation.

## 5. Components

### Cards (face-down)
- 120×180px, `perspective: 800px`
- Background: B&W mandala pattern from `/cards/back.png`, `image-rendering: pixelated`
- Border: 2px solid `#FFFFFF`
- No border-radius, no shadow
- Hover: `scale(1.05)`, no shadow, no glow

### Cards (face-up / revealed)
- Fills container proportionally
- Background: B&W card art from `/cards/{name}.png`, `background-size: cover`
- Border: 2px solid `#FFFFFF`
- `image-rendering: pixelated`

### Buttons
- **Style:** Rectangular, 2px solid `#FFFFFF` border, transparent background, white text
- **Hover:** White fill, black text
- **Active:** White fill, black text, 2px inset border
- **Size:** 44px height, padding 12px 24px, font 12px ALL CAPS monospace, `0.1em` letter-spacing
- No border-radius, no shadows

### Interpretation block
- Dashed border (2px white, 4px dash gap)
- Padding 16px
- White text, Courier New, 14px, line-height 1.6
- `white-space: pre-wrap`

### Calendar (B&W version)
- Same black canvas, white text
- Calendar grid: 7 columns, 2px gap
- Days: white text, `opacity: 0.4` for non-active, `opacity: 1` for today/has-reading
- Has-reading indicator: 4×4px white dot below date
- Nav buttons: same as .btn style
- Reading overlay: full-screen black overlay, white border, serif card name, mono interpretation

## 6. Depth & Elevation

None. Zero. No shadows, no z-index layering beyond basic stacking.

- The only visual hierarchy comes from:
  - Stroke weight (2px borders vs 1px rules)
  - Type scale (24px heading vs 12px label)
  - Active vs inactive opacity (1.0 vs 0.4)
- Cards on hover: `scale(1.05)` only. No shadow, no glow.

## 7. Animation

- **Card flip:** 3D rotateY, 0.6s ease-in-out
- **Card fade (unselected):** 0.5s fade + scale(0.8)
- **Screen transitions:** instant (no animation, just class toggle)
- **Button hover:** instant swap of fill/text color
- No loading spinners, no particle effects, no twinkling

## 8. Responsive

- **Mobile default:** 100% width, 16px padding sides
- **3 cards row:** flex, center, 12px gap
- **Card size:** 100×150px minimum, scales up to 120×180px on larger screens
- **Layout is the same at every width** — centered column, max 400px

## 9. Design Rules (Do/Don't)

- ✅ Pure B&W only. `#000000` and `#FFFFFF`.
- ✅ ALL CAPS for all labels and headings. Monospace for UI, serif for card names.
- ✅ Square corners everywhere. No border-radius.
- ✅ `image-rendering: pixelated` on card images.
- ✅ Let contrast and scale do the work. Big typography, simple layouts.
- ❌ No colors. Not a single pixel.
- ❌ No shadows, no gradients, no glowing auras.
- ❌ No rounded corners.
- ❌ No decorative backgrounds, particle effects, twinkling stars.
- ❌ No emojis in UI copy.
- ❌ No loading spinners — either the content is there or it isn't.

## 10. Implementation Notes

- Card images: `/cards/{card-id}.png` (B&W dithered, 1086×1810, mode=1)
- Card back: `/cards/back.png` (B&W geometric mandala, 262×390, mode=1)
- Fonts: Pixelify Sans (Google Fonts) for headings, Times New Roman for card names, Courier New for body
- Card flip: `.card-back.flipped .card-inner { transform: rotateY(180deg) }`
- Card hover: `.card-back:hover { transform: scale(1.05) }`
- All `.star`, `.stars-container`, `@keyframes twinkle` removed from CSS
- All color CSS variables replaced with `#000000` and `#FFFFFF`
