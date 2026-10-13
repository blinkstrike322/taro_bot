# Ritual v5 — dots, gestures and English artwork

14 October2026. Authorized disposable design revision. Product code and existing API remain untouched; no paid calls. v3/v4 files and storage preserved. Independent builder check on the updated spec returned “nothing important left”.

## User changes implemented

- Three new image versions have baked English captions: THE MOON, THE HERMIT, THE FOOL. Separate common frame remains; full artwork uses contain without crop. Russian interface and accessible names remain independent of art. No new language switch is claimed.
- Bottom positions/next dock removed. Right-side dots correspond exactly to1/3/6/7 positions, with44×44px hit areas and accessible labels that conceal unopened card identities. Active uses guide accent; opened/closed states differ.
- The user confirmed normal downward page scrolling (finger upwards). Reading scroll stays native. A new gesture started after reaching the chapter end opens one next unopened card in sequence, wrapping to earlier unopened positions. A gesture begun above the end cannot advance. Wheel inertia is guarded; active input and text selection are protected. A quiet “Продолжи вниз” control at the end offers the same action without a fixed menu.
- Left swipe returns to the existing table, preserving opened cards and chapter place. Top arrow is its keyboard/button equivalent. Dots allow direct card selection. After all cards open, scrolling continues into full summary and discussion without advancing another card.
- One-second boot still restores the real destination; no splash on navigation. Layered scene and fourth-tab-only guide preference remain.

## Evidence collected

- Fresh Node syntax check and PostCSS parsing passed; browser error console empty.
- CUA browser walkthrough covered all8 spreads:1/1/3/3/3/6/6/7 dots; no bottom dock; full last-card text and inline summary; no missing images; no automatic scroll to summary. Evidence `screenshots/v5-flow-checks.json`.
- Native browser scroll from top to bottom retained card0; a separate continued downward scroll opened card1 at scroll0. A horizontal pointer drag left returned to table with2 cards still open. These are desktop browser gesture checks, not a claim of real touch-device validation.
- After completion, further scroll retained current card and reached continuation. Prepared follow-up persisted; reload restored reading, same card and scroll1667.5. Intro observed present with CSS duration1s over the underlying reading.
- Widths320/360/390/430: no horizontal reading overflow; all7 dots within phone; each target44px; whole-image contain maintained. Screenshot `screenshots/v5-moon-390.jpg`.
- Existing v4 guide persistence/frozen voice verified before v5; v5 preserves that code, but no new server-side claim.

## Remaining limits

Prepared readings and local storage only; seven example images, four still legacy. Full API integration, generated78-card deck, pricing, real model quality and Telegram deployment remain separate product work. Touch inertia, left gesture and keyboard safe-area behavior must be checked on actual Telegram iOS/Android. The crescent is still a layered SVG material study. The exploded board is explanatory, not an exact3D rendering of the DOM stack.

Asset sources/prompts: `ASSETS.md`, `v5-asset-prompts.json`. Design: `docs/superpowers/specs/2026-10-14-ritual-v5-design.md`.
