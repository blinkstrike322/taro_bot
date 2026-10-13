# Design spike v3 — requirements for the visual prototype

This is a disposable, explicitly requested design mockup, not production implementation. Create `docs/design-work/ritual-v3.html` plus any `docs/design-work/mockup-assets/` dependencies. No product code changes. All visible copy in Russian.

## Intent

Return to `/Users/omr/Downloads/arcanum-project/assets/references/concept-premium-mobile.png`: a nearly black ceremonial instrument, a fine vertical light axis, much empty space, and a precise framed tarot object. The user rejected the current premium UI as generic, too bright, weak typography and weak flow. Elden Ring is a material/palette influence only. Women 25–40; calm private ritual and deep reading.

## Visual decisions for this spike

- Base #050505, surface #0B0A09, text #E8E3D9, secondary #B1A89A, structure #6F5B3D, old gold #B99965. Near-black space must dominate. No olive-gray full-screen wash.
- Guide accent only at light/sigil/selected state: shadow #ADA5D3, keeper #C7A369, spark #C87879. Default keeper for first visual sample; choosing another persists across the prototype.
- Typography: Forum regular for inscription-like Cyrillic headings, generous but restrained letter spacing only in title/card name. IBM Plex Mono regular for compact interface copy, reading body 15–16px/1.75. Download official font files from google/fonts with OFL license into mockup-assets/fonts and @font-face. Do not use Cormorant or Manrope. Exact original font unknown: label this an interpretation outside the phone, never claim identification.
- Separate layers: black void; tiny subtle material grain (SVG procedural noise okay); far geometry at low opacity; central moon/relic SVG; narrow directional beam and few dust motes; foreground card objects; sharp typography. Elements retain identity and move between screens. No large background landscape bitmap. Stars are scarce.
- New UI-native SVG ornaments, precise not decorative overload. Card borders UI-rendered, numbers and Russian captions separate from illustrations. Use app's existing classic cards as interim image slots, not newly invented fantasy landscapes. Root will provide a newly generated classic Moon style study. Moon src should be `mockup-assets/moon-study.webp` with existing local classic fallback. Do not depend on production /premium art.
- Screen width 390, min320; on desktop phone on left and explanatory design map on right, optional full-width board overview. On mobile prototype fills viewport; design map below. Outside phone clearly mark 'Макет ритуала · v3' and 'Тексты и карты в этом макете подготовлены'. Do not put demo gates, logins, technical mode copy inside product flow.

## The connected flow

Four persistent tabs at rest: Главная / Расклады / Журнал / Проводники. Only fourth tab changes guide. Default is immediately usable.

Home: compact wordmark АРКАНУМ near top (not huge generic headline). Center narrow engraved light/moon axis ~340px high surrounded by black. One small sentence and primary Задать вопрос; quiet Карта дня secondary. No dashboard cards, feature badges, guide chooser, numbered stages.

Question: the SAME center motif moves up and shrinks into a seal above an inline writing space. Headline 'Что тебя занимает?' Textarea has no filled card box. One quiet invitation, no chips/templates. Entered text persists. Footer shows selected spread 'Три карты · изменить' and primary 'Разложить карты'. Changing spread opens bottom sheet with all8spread names, count, purpose and diagram. No standalone configuration page. Catalog entry preselects its spread then enters this same question state. Daily skips question.

Begin: center relic contracts and becomes card back, deck comes together then deals. No fake long timer. Prototype can use brief 500–700ms transition. Product version waits for actual fixed server draw, animates only after confirmation.

Spread: centered title, actual question under/table near lower area; 1/3/6/7-card layouts preserve physical arrangement. Three cards side by side in reference. Pentagram has center+5; horseshoe is a U, shadow vertical paired progression, not universal tilegrid. Every card has a 44px minimum target. Card tap flips and the SAME selected card enlarges into reading position; NOT flip-all followed by separate disabled reading button. Other cards become subtle position rail. Cards open in any order. Keep backside until explicitly opened. Return retains exact table and progress.

Reading detail: large card near upper half with roman number/title in frame, position label, short per-card reading and distinct guide note below. Next unopened position action and clickable position rail. Swipe optional, never sole navigation. Return control to full spread. Last card leads to synthesis sheet under a compact tableau: 2–3 short paragraphs and 'Обсудить расклад' composer; no separate endless chat screen. Prepared response on followup marked as prototype only outside phone.

Journal: real prototype session snapshots, opens exactly saved spread/text/progress; empty state offers first question. State persists under separate prototype-only localStorage key, does not read existing application session. No backend/live calls. Guide tab shows one focus panel and selectable3guide names/voice sample, persistent choice. Changing guide affects future reading, existing session retains its guide. Cannot alter active session guide accidentally.

## Prototype coverage

All8spreads using existing canonical names/counts/positions in web/src/lib/spreads.ts; prepared text enough to walk through each. Include question edit/back, reload return, daily revisit same day, last opened detail, 1/3/6/7cards, 3guide accents and style voice examples. Catalogue at-rest and inline selector same contents. Keep interaction lightweight and organic, hide navigation during focused reading but offer obvious back/close retaining session.

## Right-hand design map

Explain with connected nodes: Home → Question (spread sheet branch) → Deck → Table ↔ Card detail → Synthesis ↔ Discussion → Journal. Daily short branch skips question. Fourth-tab guide persists globally for future sessions. Add layers explainer with toggles (grain/geometry/light) demonstrating independent assets, not flat background. Include few exact design decisions and remaining work, do not overdecorate board.

## Delivery

Single file runnable under static HTTP plus local asset files; no external JS libraries. Visually verify using Playwright if available. Root will serve this via Superpowers visual companion `/files/` assets. Write a concise report `docs/design-work/mockup-report.md` describing interactions tested, visual limitations, and files. No production edits or commits.
