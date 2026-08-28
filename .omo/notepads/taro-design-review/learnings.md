# Taro Bot — Design Review Learnings

## Stack
- **Backend**: Python 3.12+, aiohttp (web server), aiogram 3.x (Telegram bot), SQLite (aiosqlite)
- **Frontend**: Next.js 15 (static export), React 19, TypeScript, Tailwind CSS v4, PostCSS
- **LLM**: DeepSeek Flash via OpenCode Zen / OpenRouter
- **Deployment**: amvera.yaml (Amvera Cloud), GitHub Actions (auto-build static webapp)
- **Icons/Fonts**: Google Fonts (Pixelify Sans, VT323, Press Start 2P), No icon library

## Architecture
- Single Python process runs both aiohttp server (port 8080) and aiogram polling
- Frontend is built as static export via `next build` → `static/webapp/`
- aiohttp serves static files and provides JSON API endpoints (`/api/spread`, `/api/character`, `/api/readings`, `/api/disk`)

## UI Surfaces
1. **Telegram Bot** (@amotaro_bot) — primary interaction surface
   - Commands: /start, /subscribe, /my
   - Inline menus for character selection, main navigation
   - Zalgo/cursed text effects in bot responses
2. **Telegram WebApp** — rich card interaction (served at `/`)
   - Welcome animation (terminal boot sequence)
   - Daily card pick, 1-card spread, 3-card spread
   - Reading result display
   - Modals: Catalog (spread selection), Settings (guide selector), Calendar (reading history), Error
3. **Offer/Legal Page** — static HTML at `/offer/`

## Visual Design Language
- **Theme**: Pixel-art CRT terminal aesthetic, dark monochrome with single-accent color per guide
- **Color Palette**: Pure black (#000) background, pure white (#fff) foreground, single accent per guide:
  - Shadow Walker: Purple (#7B2D8E)
  - Ruin Keeper: Gold (#B8860B)
  - Spark of Chaos: Red (#E63946)
- **Typography**: 3 pixel/monospace fonts — Pixelify Sans (UI), VT323 (CRT text/logs), Press Start 2P (headers)
- **Layout**: Full-screen Telegram WebApp (100dvh), flex column with header-guidebar-content-footer
- **Effects**: CRT scanlines (::before/::after), rolling scanline animation, dither/halftone patterns, glitch animations, card flip (3D CSS), noise texture (SVG turbulence), ambient floating symbols, particle systems (procedural CSS)
- **Card Flip**: 3D perspective transform, glitch RGB-shift animation, particle burst on flip
- **Card Art**: Pixel-art dither-filtered PNGs, 2:3 aspect ratio, per-guide card backs
- **Accessibility**: `aria-hidden` on decorative elements, `aria-label` on interactive cards, `role="alertdialog"` on error modal — but no focus management, no keyboard navigation beyond Escape, no reduced-motion support

## Card Assets
- 78 tarot cards (22 Major + 56 Minor), each with PNG in 3 variants:
  - `web/public/cards/` — dev source
  - `static/webapp/cards/` — production static export
  - `static/pixel/` — backend-referenced pixel art
  - `static/default/` — alternate card art set
- 3 card back variants (per-guide): `back_shadow_walker.png`, `back_ruin_keeper.png`, `back_spark_of_chaos.png`
- 3 guide portraits: `shadow_walker.png`, `ruin_keeper.png`, `spark_of_chaos.png`
- All assets are PNG, unoptimized (Next.js config has `images.unoptimized: true`)

## Design Gaps
1. **No responsive breakpoints beyond basic sm/lg** — no tablet-specific layout, no landscape optimization
2. **No dark mode toggle** — only dark mode exists (by design for CRT theme, but no user preference)
3. **No reduced-motion media query** — animations cannot be disabled for accessibility
4. **No focus indicators** — keyboard users cannot navigate modals (no focus trapping)
5. **Offer page** has completely different visual identity (serif/gold theme) from WebApp (pixel/CRT)
6. **Bot messages** are plain text with zalgo — no formatting, no rich media beyond inline keyboards
7. **Card art duplication** — 4 copies of 78 card images across different directories
8. **No loading skeleton** for reading history — just text "ЗАГРУЗКА..."
9. **No hover states on mobile** — hover effects exist for desktop but TG WebView is mobile-only
10. **Font loading from Google Fonts** — requires external connection, no local fallback fonts
# Taro Bot Design Review — Learnings

## Project State
- Telegram WebApp (Next.js 15 static export) + Python aiohttp/aiogram backend.
- Current web UI is overloaded: CRT scanlines, colored glows, particles, noise, floating symbols, many fonts.
- Existing `docs/DESIGN.md` demands strict monochrome B&W (`#000000`, `#FFFFFF`, `#666666` disabled), no effects, no radii, ALL CAPS.
- Current implementation diverges from DESIGN.md (glows, colors, extra fonts/effects).

## Reference Images (workspace/temp/refs1)
- All three refs are grayscale dark-mode mobile UI mockups (wireframe-style).
- Shared patterns: pure black canvas, centered single column ~85% width, bottom nav, card-based zones, two-prominent-element vertical hierarchy, sans-serif, generous negative space.
- Refs do NOT show CRT/pixel/occult effects; they emphasize clean structure, spacing, and hierarchy.

## Open Design Questions
- `docs/DESIGN.md` wants strict B&W austerity; `docs/TARO_BOT_CONTEXT_PACK.md` suggests optional directions (Dark Mystic, Cyber Occult, Grimoire, Minimal Dark) and allows ONE muted accent color.
- User must choose: align with DESIGN.md strict monochrome, or revamp with one of the concept directions while keeping references' clean layout language.

## Constraints From Docs
- Next.js static export; no server components.
- Keep `web/src/lib/api.ts` and backend untouched.
- Preserve 3D card flip, spread types (daily/1/3), character system, reading history.
- No new npm dependencies preferred.
- No emojis, no gradients, no shadows, no rounded corners (per DESIGN.md).
