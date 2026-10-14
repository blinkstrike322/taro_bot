# Assets for the disposable ritual v3 mockup

13 October 2026. These are design candidates, not the production deck.

## Moon study

`mockup-assets/moon-study.png` — original built-in ImageGen output, 1024×1536. `moon-study.webp` — 768px-wide delivery encoding, quality90, no artistic modifications. Source: `/Users/omr/.codex/generated_images/01a1321b-d61f-7e22-a251-ffdb4a994339/exec-47b40eac-f4c8-4cfb-9718-21ed6193c4f3.png`. Generated using built-in tool, not a paid OpenRouter call.

Classic Moon composition preserved: lunar disk/profile/rays, two towers, dog/wolf, winding path, crayfish/water. Frame, XVIII and Russian title remain separate UI elements. This is one image study; no claim that all78 cards have been redrawn. Remaining seven prototype slots use existing repository images as visibly temporary examples.

Prompt (verbatim):

> Use case: stylized-concept. Asset: a single original tarot illustration style study, the Moon, portrait 2:3, art only without frame, numbers or lettering (these are composed in interface separately). Preserve the classic Rider-Waite-Smith Moon composition and iconography: a large lunar disk high at center with a subtle calm face in profile and fine alternating rays; two distant square stone towers left and right; a pale domestic dog on the left and a dark wolf on the right howling upward; a small crayfish emerging from dark water at the bottom; a narrow winding path between the animals and through the two towers into distant cold hills. Every defining symbol must remain clearly distinguishable when small. Reinterpret as extremely refined dark hand-etched intaglio and mezzotint, incised silver lines on blackened vellum, aged copperplate illustration with a sparse touch of tarnished divine gold. Palette almost black #050505, ash silver and antique parchment, a tiny muted gold #B99965 on lunar rays and path, shadow olive underpainting barely perceptible. Strong shapes, crisp meticulous crosshatching, quiet mystery, emotionally gentle, not frightening. Keep most of sky and shadow near black, bright elements restrained but readable, do not make gold fog or sepia wash. Physical etched line texture and charcoal pools, no smooth digital painting, no 3D render, no CGI, no fantasy concept-art landscape, no photorealism, no sparkle overload. Symmetrical axial composition faithful to original tarot. Keep outer 6 percent uncluttered so a UI frame can surround it. No text, title, numeral, border, watermark or logo.

## UI layers

The prototype scene uses separate DOM/SVG layers: void, `grain.svg`, geometrical planes, lunar relic, narrow light/reflection, particles, card objects, text. Grain/geometry/light are separately toggleable from the design board. No existing full-scene premium background is used. Final material quality still requires visual acceptance.

## Type

`Forum-Regular.ttf`: https://github.com/google/fonts/tree/main/ofl/forum — Denis Masharov, accompanying `forum-OFL.txt`.

`IBMPlexMono-Regular.ttf`: https://github.com/google/fonts/tree/main/ofl/ibmplexmono — IBM, accompanying `ibmplexmono-OFL.txt`.

Both files are bundled locally. Exact typeface of the raster concept is unknown; this pairing is an interpretation.

## v4 — whole artwork with inscriptions, separate frame

Latest user correction supersedes v3 above: generate the number at top and Cyrillic title at bottom INSIDE the image; use a separate shared frame asset. No cropping or duplicate DOM inscriptions. Three generated candidates now used in v4:

- `mockup-assets/moon-complete.v004.webp`: XVIII / ЛУНА.
- `mockup-assets/hermit-complete.v004.webp`: IX / ОТШЕЛЬНИК.
- `mockup-assets/fool-complete.v004.webp`: 0 / ШУТ.
- `mockup-assets/card-frame.v004.png`: common transparent overlay. Applied only to new images; old art already contains its own frame.
- `mockup-assets/scene-far.v004.webp`: distant stone recess material; no crescent/geometry/interface baked in.
- `mockup-assets/scene-near.v004.png`: transparent foreground fragments for independent overlap.

All six were generated with built-in ImageGen, not OpenRouter. Exact prompts and original output paths: `v4-asset-prompts.json`. Each original is retained beside delivery files as `*.v004.master.png`. Delivery versions are resized to768px width and encoded with Sharp (WebP quality90 or alpha-preserving PNG), with no artistic retouching. Source artwork is1024×1536. Frame and near plane have real alpha verified in metadata and pixel statistics. Visual symbol/text inspection performed on full images; mobile composite inspection recorded in the v4 report. These are style probes, not a finished78-card deck. Remaining four distinct illustrations are legacy placeholders.

The v4 scene uses these two raster planes plus independent vector geometry/relic, light, material veils, surface, contact shadows, card groups and static UI. No claim that every scene layer is a separately generated image.


## v4 frame refinement / v5 English captions — 14 October 2026

Mobile composition showed the first frame too close to the caption. `card-frame.v004b.png` is the revised common overlay, with smaller corner ornament, rendered at104% around the intact artwork. Its source is `card-frame.v004b.master.png`; exact edit prompt/source are in `v4-frame-refinement.json`. This supersedes the first v004 frame, which is retained as a study.

Latest user direction: captions on the artwork are English regardless of future app locale. New selected assets:

- `mockup-assets/moon-complete.v005.webp` — XVIII / THE MOON.
- `mockup-assets/hermit-complete.v005.webp` — IX / THE HERMIT.
- `mockup-assets/fool-complete.v005.webp` — 0 / THE FOOL.

Each has a1024×1536 original `*.v005.master.png` beside it; delivery is768px WebP quality90, no crop or artistic pixel editing. Built-in ImageGen localized the captions from the v004 art. Exact prompts/source paths are recorded in `v5-asset-prompts.json`. Art was inspected for caption accuracy and overall symbol preservation; image-generation edits are not a pixel-identical guarantee. Four legacy placeholders already have English captions. The generated78-card deck and a language selector remain future implementation, not delivered here.

## Product v5 persona portraits — 2026-10-14

Three generated original portraits, separate from scene materials and guide accent color. Deliveries: `web/public/premium/ritual-v5/{spark_of_chaos,shadow_walker,ruin_keeper}.v001.webp` (768px wide); full PNG masters in `mockup-assets/`. Exact prompts and native sources: [guide-portrait-prompts.v001.json](guide-portrait-prompts.v001.json). No new deck artwork beyond the three accepted v5 cards is claimed. Production copies come from the Next static build.
