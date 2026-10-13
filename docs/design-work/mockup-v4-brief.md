# Ritual v4 — authorized disposable design refinement

Work from v3 but save a sibling `docs/design-work/ritual-v4.html`; optional separate `ritual-v4.css` and `ritual-v4.js`. Preserve v3. This is design-spike work, not production code. User feedback explicitly authorizes revising the mockup. Product migration still follows design agreement/SDD later. Read frontend-design skill and v3, original concept, and v4 research reports once present. No changes outside v4 prototype files/report.

## User corrections (binding)

1. LATEST USER STEERING: correct number and Cyrillic title are generated INSIDE card image; FRAME is a SEPARATE COMMON ASSET overlaid on the image. No crop, no UI numeral/title layered onto images. Do not duplicate the visible card name as a large heading beneath it. Accessibility name remains. Earlier request for baked frame is superseded.
2. Ritual must flow seamlessly; reaching overall reading must not require returning to the table. Think beyond changing a button label.
3. More depth and texture: coherent 2D-game-like environmental planes, independent material/light/occlusion. Background images allowed. All assets harmonious, black remains dominant, interface readable. Number of layers itself is not a quality measure.
4. New user request: add a 1second intro splash that smoothly becomes interface. Total nominalduration1000ms: mark/title emerge first200ms, quiet200–600ms, dissolveintoactualappscene600–1000ms. Only freshdocumentboot, not navigation/resumevisibility. Restore targetreading before reveal if saved; no forcedhome detour. No fake progressindicator, no audio. Reducedmotion keepsbriefstaticmarkwithsimplefade, no transform. Splash has nofocusable controls and applicationcontrols becomeavailable immediatelywhen complete; no trappedfocus.

## Flow decision

One stable reading surface after selecting a card. The enlarged whole card, position heading, interpretation and guide note form a chapter. Other positions available through a bottom sheet chooser; no dominant `К раскладу` button. Header has a quiet close/return to home preserving session; layout is available through dock chooser.

At bottom a compact thumb dock with two controls: positions/progress on left, next unopened card on right. Next acts only on explicit click; never auto-reveal/auto-advance. The dock must be reachable without scrolling to end of the chapter. When all cards opened, the same document appends the overall-reading section under the LAST CARD'S FULL READING. Do not replace/skips its content, do not auto-scroll. User can scroll naturally into summary. Optional dock action `Общий смысл` scrolls to that existing section, it does not navigate to a new page. When summary is in view, contextual dock action becomes `Обсудить` and scrolls/focuses existing composer. Keep consistent DOM/animation at chapter changes. Any-order opening remains; opened cards can be revisited without resetting progress or closing access to summary.

For daily/single, avoid repeating a generic synthesis of1card: continuation is `На что обратить внимание` with a practical takeaway then discussion. For3/6/7, summary under full lastcardreading includes compact whole-card tableau and coherent text. Saved completed journal opens this continuous reading; navigation/refresh restores chosen card and scroll/anchor. Guide snapshot fixed.

No actual paid calls/API in this prototype. All8spreads remain. Reusing old fixed prepared text is okay, but write meaningful positional bridge copy and avoid generic sequence labels/extra stepnumbers. Existing no-gate/guideonlyfourthtab constraints remain.

## Whole-card assets

Root is generating these files under `docs/design-work/mockup-assets/`:
- `moon-complete.v004.webp`
- `hermit-complete.v004.webp`
- `fool-complete.v004.webp`

Use these for Moon/Hermit/Fool and ensure first3-card sample includes these3 (reorder existing CARDS list without duplicateentries). Other cards retain their existing complete original PNG, render uncropped, no CSSfilter/recolor/reframing. They are explicitly temporary outside the phone. Each new front is an art `<img>` (contains numeral/title) plus a shared overlay `<img src="mockup-assets/card-frame.v004.png" aria-hidden="true">`, both preserving same2:3canvas with `object-fit:contain`. Root provides genuinely transparentframeasset. Do not overlayframe on legacyimages that already haveoldprintedborder. No `.card-number`, `.card-name`, `.card-corners` or clipped `.art-window` on FRONTs. A subtle external castshadow is okay. No bright outline/highlight around image; interaction light beneath it. Back may remain existing SVG until separately generated.

## Scene assets and depth

Root provides `scene-far.v004.webp` (far atmospheric material/background only) and `scene-near.v004.png` (transparent occluding foreground fragments). If not yet available, implement references and inform root, no invented fake finished assets.

Use 10–12 logical planes GROUPED into a few transforms: void; far environmental plate; soft far vignette; far fine rings; middle obscuring veil; back-light/shaft; lunar relic; foreground fine axis/ring arcs; low receiving surface/contactlight; foreground edgefragmentcutout; sparse grains/motes; UI. Scene report will give fullintendedstack. Reuse quiet geometricSVGsource; add occlusion so back arcs disappear behind relic/foreground instead of all drawings blended together. The strongest bright elements few crisp points. Material images subdued but visible enough to give patina. Do not build generic temple backdrop or fullbrightamberwash.

Home shows mostdepth. Question compresses SAMErelic and layers recede. Table environment quiets; cards have physicalshadow and light under selection. Reading silences atmosphere under text. Independent depth speeds around1px far /3pxmiddle /5pxnear, only hover/pointer slow response on scene, no device orientationpermissions, no constant oscillation ofalllayers. Reducedmotion disables displacement/reveal transitions while keepingfullflow. Background/inactive tab stopsambientmotion. Keepphone320–430 withoutoverflow, targets44px and16pxreading.

## Board outside phone

Update v4 title/explanation/map: question → table → continuousreading with cardchapters → inlinecommonsense → inlineconversation → journal. Distinguish optional tablepositionchooser. Add scene exploded/depth view or a switch `Показать планы`: only the scene planes separate/labeled on theboard, notproductflow. Show how occlusion and parallax create depth, notjustexisting3togglebuttons. Existing mode notice outsidephone: preparedtexts/certaincardsstilltemporary.

## Verification/report

Read source and self-check majorflows; root does CUA browserverification. Use Node syntaxcheck, no new tests fordisposablevisualspike. Ensure methods declared before use and externalassetsrelativepaths. Never overwritev3/sessions (new localStoragekey v4). Report `docs/design-work/mockup-v4-report.md` with what changed and knownlimitations. No commits.
