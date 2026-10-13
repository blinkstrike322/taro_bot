# Ritual v4 — disposable prototype report

13 October 2026. Authorized visual refinement only; no product code, API integration, paid calls, or commits. v3 is preserved.

## Files

- `ritual-v4.html` — phone shell, 12-plane scene composition, fresh-boot splash, external design board and exploded-plane study.
- `ritual-v4.css` — layout, material composition, full-card rendering, reading dock, responsive and reduced-motion rules.
- `ritual-v4.js` — prepared content, eight spreads, local v4 sessions and continuous reading behavior.

Read before implementation: binding `mockup-v4-brief.md`, frontend-design skill, v3 source, `scene-v4-design.md`, `flow-v4-review.md`, concept audit, and original `concept-premium-mobile.png`. The newest brief supersedes earlier baked-frame and cropped-art instructions.

## Design decisions and brief review

Keep the inherited Forum inscriptions and Plex interface/reading typography. Reading prose is 16px with 1.8 line height. Palette: void `#050505`, material `#0B0A09`, ash `#514F4C`, engraved bronze `#6F5B3D`, rare metal `#B99965`, text `#E8E3D9`. The memorable object remains the small crescent and narrow axis; controls and text have quiet, stable alignment.

The phone composition is axial on home/table, then left-aligned in prose. The board explains the actual route: question → table → card chapters → inline overall meaning → inline discussion → journal. Positions and optional layout belong in a bottom sheet. The scene uses overlapping materials rather than extra decorative UI containers. No additional typographic redesign or generic step numbers were introduced.

## Implemented behavior

- One stable `.reading-surface` contains a selected `#chapter` and a persistent `#continuation`. Chapter selection updates only the chapter. Completed reading stays beneath it.
- A two-control thumb dock always offers positions/progress and an explicit continuation. It opens the next unopened position only after a click. All positions remain available in any order through a scrollable sheet with targets at least 44px.
- When the last card is opened, its complete interpretation and guide note remain in place. The summary and discussion are appended below. There is no automatic summary scroll or mandatory return to the table.
- The dock changes to overall meaning when every card is open, then to discussion when the summary is in view. These actions scroll within the existing document. The discussion action focuses the existing composer only after the click.
- Revisited chapters retain their local offset. Returning from the summary to a card retains a summary return anchor. Session restore uses semantic section + offset and selected card. Journal completion opens continuous reading. Guide snapshots stay fixed per session.
- Daily and single-card readings use “На что обратить внимание” and an applicable takeaway instead of repeating a one-card synthesis.
- All eight spread definitions and their 1/3/6/7-card geometries remain. A completed reading is never inferred from the active index; it depends on the opened set.
- Discussion replies are prepared local fixtures. Updating messages does not replace the reading document. Composer focus hides the dock; the submit action is in the composer.
- v4 uses `arcanum-disposable-ritual-v4`, with no migration or overwrite of v3 sessions.

## Card assets

Moon, Hermit, and Fool use their new `*-complete.v004.webp` fronts, followed by the shared genuinely transparent `card-frame.v004b.png` overlay. Artwork occupies the complete2:3 canvas; the shared frame is104% to clear printed captions and use `object-fit: contain`. The number and Cyrillic title are inside the supplied art, with no duplicated large card-name heading. The position is the reading heading. Accessible card names retain numeral and title.

Other cards retain complete original PNGs without cropping, recoloring, filters, or additional frame overlays. They are identified as temporary on the external board. The sample card array starts Moon → Hermit → Fool, followed by the four legacy cards without duplicates. The existing SVG back is retained.

## Scene and entrance

Eleven environmental planes plus the stable UI make twelve logical planes: void, far material, vignette, rear arcs, side veil, shaft, relic, foreground axis/arcs, receiving surface/contact light, near fragments, grains, UI. They are grouped into three pointer-responsive containers with maximum offsets 1/3/5px. Rear arcs disappear beneath the opaque crescent silhouette and surface; transparent foreground material adds independent near occlusion.

Home shows the full depth. Question compresses the same relic. The table quiets the axis and relic. Reading removes parallax and uses an opaque black field beneath prose. There is no perpetual ambient animation, no orientation sensor, and no repeated grain repaint. Hidden/offscreen state stops scene response. Reduced motion preserves composition while disabling displacement and chapter/deck transitions.

Fresh document boot presents a nominal 1000ms splash: mark emerges during 0–200ms, rests 200–600ms, then dissolves during 600–1000ms. The actual restored reading is rendered and placed beneath it before reveal. No navigation or visibility event repeats the splash. It has no focusable controls; application inert state is removed at completion. Reduced motion uses a static mark with a simple fade.

The external board has a “Показать планы” exploded stack and individual material/arcs/light/occlusion toggles. These are prototype review controls outside the product flow.

## Verification performed

- `node --check docs/design-work/ritual-v4.js` passed after implementation and the chapter-anchor correction.
- Source inspection confirmed the eight spread counts: daily 1, single 1, yesno 3, three 3, mfd 3, shadow 6, pentagram 6, horseshoe 7.
- Fixture inspection confirmed seven unique card IDs and first sample Moon, Hermit, Fool.
- All six new external asset paths were present at verification.
- No old `card-number`, `card-name`, `card-corners`, or `art-window` selectors/markup remain in v4.
- No fetch, XMLHttpRequest, WebSocket, or sendBeacon call exists in the v4 script.
- Source review traced last-card append, arbitrary card selection, closed-card name protection, sheet focus loop/return, journal restoration, preserved guide, and one-time boot behavior.
- Root agent owns CUA/browser visual and interaction verification. That evidence should be recorded separately; source/syntax checks do not establish screenshot quality or mobile-webview performance.

## Known limitations

This remains a prepared prototype with seven example card images and fixed illustrative readings, no backend/network/loading-error simulations. The crescent is a layered native SVG material study rather than a generated photographic relic. The external exploded view is a schematic of the twelve logical planes grouped for clarity. Mobile keyboard behavior and performance still need validation on a real Telegram mobile webview; responsive CSS and reduced motion are implemented but are not a substitute for that device review.


Root browser check before v5: all8 spread types reached inline continuation; order3→1→2 retained full last-card reading with scroll0; discussion and its scroll restored on reload; selected guide persisted while old reading retained Keeper. No missing images or horizontal overflow in the checked flows. Width320 seven-position sheet fit; splash observed1s CSS duration and1143ms including reload, no repeat on navigation. Evidence: `screenshots/v4-*.jpg`, `screenshots/v4-flow-checks.json`. All this is prototype evidence only.
