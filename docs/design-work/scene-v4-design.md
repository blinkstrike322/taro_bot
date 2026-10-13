# Scene v4 — black chamber, separate materials

13 October 2026. Design refinement for an authorized disposable mockup; not a production implementation or an approved replacement spec. Values below are designer proposals, to judge in the next visual sample.

## What the original reference does

Viewed `Downloads/arcanum-project/assets/references/concept-premium-mobile.png` and compared with `ritual-v3.html`. The reference has a worn elliptical recess, engraved arcs disappearing into black, a physically textured crescent, a narrow vertical light and a small reflection below. The cards overlap that space and have crisp independent edges. Bright text sits outside the brightest material. V3 preserves the axis but its single SVG carries most forms at the same sharpness; the global grain cannot distinguish distant wall, suspended object and foreground table.

Keep that axial composition and quiet scale. Give each material its own silhouette, mask and contrast. Depth must be visible in a static screenshot through overlap, local sharpness and contact shadows; parallax only reinforces it. A background image is allowed as one material plane, not as a completed scene containing moon, rings, beam and cards.

Palette: void `#050505`; material black `#0B0A09`; cold ash `#514F4C`; engraved bronze `#6F5B3D`; rare metal `#B99965`; text `#E8E3D9`. Guide accents remain v3's small amethyst/brass/carmine accents. No olive full-screen tint. Forum inscriptions and the existing compact interface type remain; no typography redesign in this scene pass.

## Twelve logical planes

`z` is CSS stacking order, not a claim of physical distance. Motion is the maximum horizontal/vertical offset from a normalized pointer or one shared transition input; nothing requires device sensors. Ranges are for a 390px viewport and scale down with width. Normal alpha composition is the default. The same illumination direction—top centre, slightly left—applies to all materials.

| z | Plane and material | Mask, overlap and light | Motion cap / treatment |
|---|---|---|---|
| 0 | Black void | Opaque full viewport; the negative space between everything | Fixed |
| 2 | Far recess: rough charcoal stone, narrow uneven ellipse | Separate raster, mostly black; side shoulders visible near x=15–30% and 70–85%; centre and outer edges fade to true black. No crescent, rings or beam baked in | ±1px x, ±1px y; 1.02 scale to hide edges; static texture |
| 4 | Rear engraved arcs and small radial ticks | SVG, incomplete circles, 0.5–0.8px optical strokes. Far portions lose contrast; some arcs disappear behind crescent/table. Structure colour at .16–.30 alpha, not one equally bright target | ±2px x, ±1.5px y; no spinning |
| 6 | Air between recess and object: two asymmetrical veils | Small pre-rendered alpha patches confined to side shoulders; clear black axis and clear text corridors. Ash at .04–.08 alpha. No full-screen fog | ±2.5px x, ±2px y; static at rest |
| 8 | Axial slit light behind relic | Narrow vector core, 1–2px; soft shoulder only 8–16px wide. Discontinuous above/below the crescent. Short masked strike on table, not a radial wash | Follows axis ±3px x, ±2px y; static brightness; brief response to draw only |
| 10 | Suspended crescent / relic: worn antique metal | Independent transparent raster, sharp inner curve, uneven outer metal edge, etched pits. Light on upper-left rim; bottom/right stays black. It occludes beam and rear arcs | ±3px x, ±2px y; rotation ≤.4°; no breathing scale |
| 12 | Table plane: dark basalt/vellum, shallow oval perspective | Independent lower raster, low horizontal abrasion and a broken thin lit ridge. Its top overlaps lower recess and rear arcs; beam reflection is masked to this surface | ±3.5px x, ±2px y; scale 1.00–1.02 only during stage change |
| 16 | Contact shadows for relic/deck/cards | Dark oval/path shapes below each object, local to the table. Shadow narrows as object lands; it moves with that object. Small relic reflection is a separate masked child, .06–.12 alpha | Object-linked; card shadow offset 3–8px, soft edge pre-rendered or static CSS |
| 20–29 | Deck / dealt cards: layered paper, etched borders and art | Each card is an isolated group: shadow, whole uncropped artwork with baked numeral/title, separate shared transparent frame. All internal parts travel together. Crisp bronze rim, dark inner edge, distinct 1–2px paper thickness. Existing art retained | ±4px x, ±3px y scene input; selected object can lift 6–10px, rotate ≤1.2°, scale ≤1.025 |
| 32 | Near lip / dark side occluders | Two irregular foreground fragments cropped beyond scene edges, opaque black with ≤2px worn rim. Cut off only a few rear arcs/table edges; never a card target or text | ±6px x, ±4px y; foreground readable by occlusion, not brightness |
| 36 | Sparse foreground dust | 4–6 unequal points max, 1px, mainly over scene, .10–.24 alpha. No starfield; none near text and none drawn over card art | ±5px x, ±3px y; no perpetual particle loop |
| 50–70 | Sharp interface and reading shield | Layout/text/UI in one stable coordinate system; an opaque `#050505` reading field masks all scene layers beneath prose. Nav and sheet above atmosphere. Interactive targets ≥44px | Fixed; no text parallax |

Do not add twelve full-screen promoted GPU surfaces: these are logical planes, mostly cropped small assets and static shapes. A card's internal layers are not twelve independent moving nodes.

## Depth through the ritual

| State | Relationship that changes | Time / limits |
|---|---|---|
| Home | Crescent hangs before recess; table ridge is low and narrow; full axis surrounded by black. One strong focal object | Static after entrance; optional scene response only while pointer is active |
| Question | Same relic moves to a small seal above writing; recess spreads upward and dims. Foreground lip/table stays low, so the writing field feels opened inside the same chamber | 420–520ms; motif translation up to 100px, scale .35–.45; no fake zoom through text |
| Draw | Relic contracts into the deck's central insignia. Table becomes visible where cards will land; contact shadow establishes their arrival. Rear arcs remain behind the deck | 500–650ms total mockup transition, triggered by draw; product later waits for confirmed fixed draw |
| Table | Crescent recedes and is mostly occluded by cards. Table widens; arc endpoints and side shoulders remain visible between cards. Actual 1/3/6/7-card layouts stay intact | 350–450ms; geometry alpha .12–.20, slit .10–.18; no new ambient glow |
| Card detail | Selected card travels as one object into reading position, its shadow softens while it lifts. Remaining cards reduce to stable navigation. Recess remains only beside upper art | 320–450ms; atmosphere behind prose goes fully black; all parallax stops once reading begins |
| Synthesis / discussion | Small tableau retains the table relationship; axis reduced to a quiet engraved mark above it. Prose dominates | ≤250ms opacity transition; no motion on scrolling text |
| Journal / guides | Journal retains a faint cropped engraving; guides use the same relic/material with small accent and light-temperature changes | No tinted whole-screen replacement; guide change ≤200ms |

Return reverses the same relationship and restores the exact card arrangement. Layer motion never changes semantic card order or accessibility order.

## Separate asset generation briefs

Common art direction for all panes: refined hand-etched mezzotint and worn physical material, near-black shadows, low saturation, scarce aged brass, emotionally calm, no neon, bloom, fantasy landscape, starfield, letters, numerals, logo, card frame or complete UI. Generate separate files; compositing and precise engraving stay in UI-native code. These are briefs only; no image service call is part of this research task.

1. **Far recess (`recess-material`)**: portrait 3:4 master, dark eroded stone/black vellum forming the sides of an incomplete shallow oval chamber. Leave central 40% nearly empty and black. Very fine directional scuffs on side shoulders, hard fragments in a few places, broad surrounding darkness. Cold ash undertone. No masonry arch, moon, circles, vertical beam, table or glowing centre. Delivery ~780×1040 WebP on black, faded by scene mask.
2. **Crescent (`crescent-relic`)**: isolated slender antique brass crescent, tips upward, frontal view; engraved abrasion and minute pitting, ivory/brass highlight only on upper-left curved rim; heavy dark body and inner cut-out. No halo, beam, surroundings, shadow or stars. Transparent background; 600×600 master, ~320px delivery. Reject a smooth flat icon or a luminous yellow crescent.
3. **Table (`table-material`)**: isolated wide shallow ellipse in perspective, nearly black basalt/vellum, low horizontal scratches and discontinuous thin ridge, tiny muted reflection at centre upper edge. No cards, engravings, vertical light or architectural background. Transparent outside ellipse; 1200×500 master, ~780×325 delivery.
4. **Side veils (`air-patches`)**: two isolated narrow translucent ash-smoke ribbons, one left, one right, highly sparse, more negative space than material, no luminous cloud. Transparent 600×900 master; crop individual patches to ~160×360 delivery. Keep optional: delete them if they erase material edges.
5. **Near fragments (`foreground-fragments`)**: separate left/right cropped black stone edges, opaque almost-black body, a tiny cold worn edge with one antique-brass fleck, irregular contour. No central object. Transparent 400×900 master, ~160×360 delivery; no recognisable fantasy pillars.

A generated asset is accepted only after viewing it composited at phone scale. If black edges become milky, deepen its local mask rather than dimming the whole UI. Do not let asset generation introduce rings that duplicate vector engraving.

## Restraint and mobile budget

- Black remains the main mass: aim for ≥70% of scene pixels below sRGB channel value 20, excluding text and card illustrations. This is a proposed QA target, not a measured property of the reference. Bright atmospheric area stays roughly ≤3% of viewport; light may strike one local surface, never every outline.
- Scene occupies the hero/table region, not the scrolling page. Clip assets to that box and author ≥16px overscan. Alpha masks are static; animate only transforms/opacity of a shared scene input. No animated blur, noise filter, backdrop filter, continuously repainted grain or blend-mode stacks.
- Aim for ≤1MB initial scene downloads, ≤12MB decoded raster scene assets excluding card art, and at most three active moving scene containers. These are practical budgets to verify on a real Telegram mobile webview, not documented guarantees. Use raster textures for material, SVG for precise lines. Retain basic raster-free fallback.
- No autonomous idle animation is necessary. Pointer response optional, fine-pointer only; do not hijack touch scrolling or request gyroscope permission. Stop scene updates on detail, hidden tab and offscreen prototype. Layers use `pointer-events:none` and `aria-hidden`.
- With reduced motion: zero parallax, zero card lift/rotation, no traversal or particle movement; instant placement or ≤120ms crossfade. Static overlap, texture, sharpness and shadows must still explain depth.
- Prototype review at 320/390px: inspect home, question, three-card table, six/seven-card layouts and long reading. Toggle recess/engraving/table/near occluders independently. A removal should reveal a spatial role; if it only reveals another brown tint, cut that layer.

## Primary-source grounding

The following document game techniques; the numeric ranges and ARCANUM art direction above are our adaptation, not their recommendations.

- [Godot stable: 2D Parallax](https://docs.godotengine.org/en/stable/tutorials/2d/2d_parallax.html) explains depth from different layer movement rates, independent layer children, and coverage problems when textures are smaller than the viewport. Transfer: a few clear depth groups and asset overscan; ARCANUM does not need infinite repetition.
- [Unity: sorting renderers within a sorting group](https://docs.unity3d.com/cn/current/Manual/sprite/sorting-group/sort-renderers-within-sorting-group.html) explains preserving internal order when a group is sorted against other objects. Transfer: whole card artwork, its separate frame and local effects stay one moving object, with explicit stable scene order.
- [Unity 6: SpriteMask API](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/SpriteMask.html) describes masks with a custom sorting range and locality to a sorting group. Transfer: each material/light mask affects its intended plane or object, not the text and entire scene. No Unity/Godot dependency is proposed.
