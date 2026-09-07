# Reference landscape reconstruction

The supplied crossing and ruins screenshots are the visual targets. Current editor studies are not an accepted match. Measurements below use normalized image coordinates (left/top = 0, right/bottom = 1), so they remain valid at either original or preview resolution.

## Shared visual language

- Perspective: elevated orthographic view, roughly 50–55° downward, no visible horizon. Large objects overlap their ground footprints; position their bases, not canopy centers.
- Lighting: broad warm key from upper left; lavender-brown occlusion; softer distant shadows. Sunlit sand is pink beige, not yellow-green. Preserve trunk and plank detail inside shadows.
- Terrain: gently rolling continuous ground, sculpted riverbeds, narrow irregular grass-to-sand transitions. Grass-capped cliffs are separate broad faceted rock shelves; a smooth hill is not a substitute.
- Stone: low frequency rose-gray facets, layered edges, darker cracks, occasional green caps. Avoid noisy tiled cliff textures and uniformly rounded piles.
- Ground cover: broad bent grass blades in low spreading tufts, straw and pale sage colors; varied small clusters and larger patches. Bare gaps remain. Root shadows blend into olive ground. No identical radial needles, black card backs, uniform carpets, or evenly spaced dots.
- Flowers: mostly tiny white clusters; smaller quantities of lavender, yellow, and red. Many flowers per patch; individual giant five-petal flowers are not the dominant detail.
- Trees: long drooping willow strands; dense tiered conifers with visible brown trunks; rounder small deciduous shrubs. Gold and red accents are sparse and concentrated. Pine bases are not flush conical solids.
- Water: slate-blue river centers, pale desaturated shallow edges, soft depth transition, streaks aligned with the river flow. Shore foam is uneven and translucent. Avoid a uniform cyan strip and an unbroken white outline.
- Night: recognizable blue moonlit version of these materials, with readable sand, wood, trunks, and foliage. Avoid an exposure-only darkening of the daytime image.

## Crossing: visible composition inventory

1. Main river enters near (0.26, 0.10), turns through (0.25, 0.30), (0.31, 0.43), passes under the bridge near (0.43, 0.56), then flows through (0.64, 0.63), (0.79, 0.75), exiting lower right.
2. Narrow tributary enters from the left at y≈0.28 and joins the main channel near (0.24, 0.28). Reeds occupy both sides.
3. Bridge footprint runs southwest to northeast, approximately (0.36, 0.61) to (0.51, 0.46). Brown curved rails, separate transverse planks, open rail gaps, visible feet.
4. Upper willow base near (0.36, 0.25); canopy extends to top edge. Broad cliff shelf below it occupies x≈0.30–0.45, y≈0.22–0.35, with exposed roots and pink rock face.
5. Smaller willow beside southwest bridge landing, base around (0.29, 0.56), drooping canopy reaching (0.28, 0.44).
6. Red directional sign immediately below that willow, near (0.29, 0.59).
7. Lower-right willow base near (0.67, 0.87), canopy over riverbank around (0.68, 0.72). Another large willow clips the right edge around (0.94, 0.76).
8. Upper-right forest contains several distinct tall pines around x≈0.49–0.95, y≈0.10–0.43. Canopies overlap in groups, separated by visible ground pockets.
9. Gold accent tree at (0.82, 0.41), red/gold birches near the far right and top right. Small round sage shrubs fill selected gaps.
10. East-side path comes off bridge and curves via (0.57, 0.39), (0.63, 0.32), then toward the upper-right edge. It is not a straight horizontal road.
11. Two short wood fences flank the eastern approach: upper fence near (0.59, 0.34), lower fence near (0.56, 0.43). Bush growth partially overlaps them.
12. Southwest landing connects to broad pale paths toward (0.20, 0.71) and toward bottom-center. Grass islands separate the routes.
13. Low irregular stone wall extends from left edge around y≈0.59 toward (0.25, 0.69).
14. Another stone wall runs from (0.35, 0.67) toward (0.46, 0.96), with small stones and plant clumps at its feet.
15. Left meadow layered boulder at (0.13, 0.48); smaller layered boulder on west river edge at (0.21, 0.36).
16. Angular stones crowd the river beside small willow (0.32, 0.50), beneath bridge (0.43, 0.61), east bank near (0.69, 0.61), and far-right bend (0.80, 0.79).
17. Thin reeds form short irregular ribbons near bridge landing, shallows, and tributary. Their height and density differ from meadow grass.
18. Foreground is a mosaic of sage patches, straw tufts, white flower colonies, path clearings, small lavender stems, and scattered pebbles.
19. A few visible fallen leaves provide orange/gold specks. Pebbles collect along paths and banks rather than being equally distributed everywhere.
20. Background top edge is enclosed by grass-capped faceted rock formations, with trees occluding portions of the ridge.

## Ruins: visible composition inventory

1. Tall broken arch stands just left of center, base near (0.41, 0.48), with two separate rectangular pillars and a segmented curved arch.
2. Moss covers upper ledges and crevices. Pillars are warm rose-gray; neither charcoal nor bright white.
3. Separate standing pillar near (0.59, 0.59), casting a long lower-right shadow.
4. Broken columns and plinths trail diagonally across the clearing from (0.43, 0.54) to (0.54, 0.61), some upright, some horizontal.
5. Narrow grassy remnant under the ruins contrasts with open sand around it.
6. Two raised shelves frame the clearing: left x≈0.12–0.32/y≈0.15–0.32; right x≈0.61–0.78/y≈0.17–0.37. Both have broad olive tops and tall layered rose stone faces.
7. Tall pines and low round shrubs sit on shelf tops; placement must account for top-surface height.
8. Dead spindly trunks flank the ruin near (0.23, 0.50) and (0.70, 0.51).
9. Broad sandy routes pass behind the arch, descend from the top center, and split around the foreground grass islands.
10. Large angular boulder formation dominates right-center around (0.84, 0.64), with a pointed upper silhouette and multiple subordinate rocks.
11. Flat layered boulder foreground left-center near (0.34, 0.65); similar layered rocks at both shelf approaches.
12. Snow patch crosses the upper-right edge with a soft irregular boundary. Snow-covered pine foliage is lavender-white; trunks remain brown.
13. Small reed pond clips the right edge near y≈0.44–0.60 with clustered lily pads.
14. Gold and rust deciduous accents near upper middle and lower middle-right; willow foliage clips bottom-left.
15. Low stone walls break the lower meadow at (0.37, 0.89) and (0.60, 0.81). They have visibly irregular courses and gaps.
16. Dense but low straw grass clusters, white flower patches, lavender stems, round sage shrubs, loose pebbles, and scattered sticks occupy grass/sand boundaries.

## Color measurement notes

Colors sampled from the screenshot are display-referred sRGB, already affected by lighting, shadows, and grading. They must be matched in rendered output, not copied blindly into linear shader uniforms.

Crossing samples (11×11-pixel median at normalized coordinates):
- Foreground pale path at (0.611, 0.912): #c4a99a.
- River center at (0.258, 0.341): #545a62.
- Lighter river surface at (0.650, 0.645): #70727d.
- Shadowed bank stone at (0.833, 0.702): #504456.
- Bridge planks at (0.436, 0.513): #614a3f.

These are local targets, not universal material colors. Additional samples should be taken at equivalent lit/shadowed surfaces after the camera and geometry align.

## Golden Standard river garden — live reconstruction

Canonical reference: `assets/visual_tests/golden-standard.jpg` (1892 × 1064). Editable map: `assets/maps/showcase/Golden-Standard.utcmap`. This reconstruction is unfinished; matching assets does not by itself establish identical geometry, camera, materials, lighting, or pixel output.

Open `/visual-compare.html` for side-by-side, wipe, overlay and difference views, detail crops and display-sRGB pixel inspection. It loads the latest MCP screenshot from `/tmp/editor-shot.jpg`; production builds accept a saved capture through the file picker. Keep the capture at the reference aspect ratio. Current authored view: x/z 126/126, zoom 25, yaw 0°, pitch 53°.

MCP validation includes fractional object placement, projected landmark/bounds measurements, terrain landforms, saved cover palettes, map export/reload, and day/midnight rendering. An explicit browser reload was needed after the dev-server restart: scene changes were reaching MCP while renderer modules were stale. Reload before judging shader edits when HMR is disconnected.

Current remaining differences: canopy silhouettes and branching; local bank heights and river width; shoreline and water-surface variation; grass fan sizes and colony distribution; foreground rock silhouette; lighting/palette balance and smaller ground details. The reference watermark is excluded from the intended scene. Difference view is a diagnostic, not a similarity score.

The garden now uses the pack’s modeled `synty-plant-reeds-01/02` blades. Their palette-swatch UVs cannot use a grass cutout: the renderer removes that map and applies a root-to-tip vertex gradient, preserving seasonal lighting. Reed clusters use fractional positions and varying scales. The foreground boulder uses the pack’s `synty-rock-pile-02`, selected through a live catalog silhouette study; the procedural substitute is now in the archive. Bank rocks have explicit elevation offsets to expose their submerged volume. Pink foliage uses a softer peach-pink tint.

The current solar arc uses a 78° peak elevation and a −202° azimuth offset. This reduces shadow reach while retaining upper-left morning light, but the central canopy still shades too much of the reference’s lit bank. Further canopy geometry/composition work is needed; changing the horizontal sun direction alone did not resolve that discrepancy. Live MCP captures verified the reed material repair, bank rock exposure and revised light. The build and 103 regression tests passed during this pass.

The pink willow uses the catalog’s full-crown variant, which layers a slightly rotated copy of the existing leaf mesh while preserving the trunk. The shared mesh stays in the existing instance batch. The authored tree is at x/z 150.8/137, scale 2.4, yaw 5.7 and roll −0.16 radians. The full-crown asset is an artistic reconstruction variant, not a claim that the original Unity scene used this arrangement. Willow materials retain source normals and add limited leaf transmission; daytime and blue midnight were checked live.

Foreground terrain has a broad 1.6 m rise centered at 122/145, with a cleaned and adjusted path. Five round shrubs were removed from the trail; small stones now use the repaired pack rock palette. Broad low grass tufts make up 55% of grass instances. Flowers use seven separated heads with broad petals, and the densest authored colonies have reduced flower frequency. The foreground pack boulder is at 125/148, scale 1.5, yaw 4.45, elevation −0.65.

Water surface brightness uses smoothly warped multiscale noise rather than a repeated sine-product pattern; two drifting normal samples reduce visible repetition. A 45° camera study exposed more trunk but worsened the established scene alignment, so the saved reference camera remains 53°.

The central island bank was recessed with an MCP landform cut centered at 126/121.8 (10 × 5 m radii, −2.2 m, plateau 0.3, roughness 0.18, seed 820), after one 9 m-radius smoothing pass along each river centerline. Both operations are baked into the saved height field; do not apply them again on load. This opens the crossing channel and removes the former long straight bank segment. A normalized live broadleaf study retained the giant tree: the smaller generic tree had oversized leaves and lacked the reference’s spreading fork.

Cutout foliage now uses MSAA alpha-to-coverage and preserves anisotropic filtering through the grayscale texture bake. Offscreen MCP captures explicitly export opaque alpha, matching the editor canvas: resolved leaf/grass RGB was previously darkened by partial target alpha during JPEG encoding. A live PNG capture verified alpha is 255 throughout. Golden willow variants use muted peach-ochre rather than the birches’ bright yellow.

The giant tree’s dead-branch cards are now excluded from living foliage tint and wrapped normals. Their alpha silhouette uses the trunk’s bark color, preserving brown branches through seasons. With those branches visible, a new live pose comparison selected yaw 2.0 radians: it exposes the left branch and trunk fork and shifts the low canopy to the right, improving the central bank lighting. The 1.1-radian trial hid the trunk; 2.3 lowered the left branch too far.

The channel-junction rocks now use convex `synty-rock-02` meshes with saved vertical proportions; the right-bank stone has a small lean. These replace the former flat center slab. Lily pads use muted gray-olive color and mostly single-pad meshes in smaller authored groups, with the right cluster repositioned around the reeds.

Golden Standard water now saves `causticStrength: 0`, removing the fine repeating caustic pattern absent from the reference. Older maps retain their previous 0.4 strength when the field is omitted. The MCP water action accepts the optional control, and save/reload plus invalid-value tests cover it.

Garden reeds have narrower horizontal scale (0.68 × previous scale) and heightScale 1.75, producing upright beds rather than splayed clumps. Reed normals receive limited sky-facing fill while retaining the root gradient. An extra crossing-rock clump was removed, and the two central beds shifted 0.8 m left and 1.1 m upstream. These are saved transforms, not load-time multipliers.

Willow value-map conversion now uses 0.25 + 0.75 × source luminance. The previous generic gain clipped approximately 75.6% of visible willow texels to white, erasing painted leaf variation (the generic tree atlas clipped only 6.4%, so it retains its existing conversion). Summer and pink willow tints compensate for the restored texture shading without clipping it again.

Foreground flower scatter is reduced in the broad cover patches and concentrated into two smaller colonies (110.4/139.6, radius 2.2; 108/146, radius 2.7; density 2.4). Sand is slightly less orange. At reference pixel 710/950, the 11×11 median moved from #e7bea0 to #e2bea4 toward reference #ddbeaa; at 760/680 it moved from #ebc0a0 to #e5c0a6 toward #d7b7a3. These local checks do not establish whole-scene fidelity.

A matched-size medium-willow trial had oversized leaves and did not match the reference; the large model remains active. The left green willow is now x/z 108.5/117.35, elevation −1.4, heightScale 1.025, retaining scale 2.8/yaw 4.7. This reduces the exposed root flare with little crown-height change. One overlapping fern was moved to 109/118.5 at scale 1.8 to frame the trunk base.

Water now supports actual planar reflections, rendered at 768×768, distorted by the water normal texture, softened with five samples, and composited after water lighting. The water hides during its reflection pass to avoid recursion. Golden Standard saves reflectionStrength 0.14; older maps omit it and skip the reflection pass. This adds one reflected scene render when enabled; it is not screen-space refraction or a measured frame-rate guarantee.

The top-left mountain now faces yaw 0.15 at x/z 94/80.5, retaining scale 1.18 and elevation −3. This gives a more continuous diagonal cliff silhouette above the willow. Shadow casting/receiving is enabled; the face remains too bright relative to the reference (sampled reference RGB around 98–108/72–86/72–98 versus current 151–173/123–140/120–133 before the small z shift). No global rock tint change was made for this local discrepancy.

Latest palette/ground-cover pass: the left background mountain uses a saved `slate` stone variant. The imported tiling texture was rejected because it introduced small facets absent from the reference. Golden Standard cover patches use `grassScale: 0.85` and `broadRatio: 0.3`; other maps retain legacy proportions. Grass casts alpha-cutout shadows. These changes improve local appearance but do not establish a complete reference match.

River-junction pass: replaced the layered pile at the foreground crossing with three separately posed angular pack rocks, including a shallow ledge. Lowered the central bank pair and adjusted their proportions. Reed foliage now uses a warmer pale-straw tint; river shallows/depths use a cooler blue-gray base. The river remains too regular and its local brightness still differs from the reference; these are unfinished visual adjustments.

Shoreline pass: three saved MCP landforms raise the western foreground shelf (+1.2m at 103/139) and gently recess two eastern bank sections (-0.5m at 133/137, -0.4m at 132/148). These are baked into the map heightfield, not operations to reapply on load. The pink willow is slightly wider (scale 2.6, heightScale 2.4/2.6) while retaining its prior height and yaw. A 4.7-radian yaw trial exposed a larger crown gap and was rejected.

Willow material pass: cutout threshold is 0.2 to retain more fine hanging strands at the authored camera distance. Pink foliage uses a modest texture-masked rosy fill (0.1) to reduce gray shadow patches while preserving its pale diffuse palette. This does not solve the remaining crown gaps or reproduce the reference lighting exactly.

Full willow crown geometry: its existing inner leaf layer now rotates 0.5 radians and scales to 0.92, reducing the central opening. A stronger whole-tree roll of -0.32 was rejected because it made the hanging strands unnaturally diagonal; the saved roll remains -0.16.

Flower asset repair: restored `synty-plant-flowers-01` from the archive after replacing its three atlas swatches with separate green stem/leaf and lavender blossom vertex colors. Eight small stalks form four accents beside the foreground path and rocks. The original mesh is retained and grounded through the existing import-offset normalization.

Water flow pass: surface value noise is averaged along the local river-flow vector rather than using only an isotropic sample. World coordinates remain continuous through bends. Roughness is 0.48 for softer highlights. Large lighting/reflection patches remain a reference mismatch and require further work.

Water shadow isolation: the large canopy-shaped patches remained with reflections, ripples, foam, and cloud variation disabled, and disappeared when directional water shadows were removed. Golden Standard now saves `shadowStrength: 0.25`; legacy maps retain 0.6. All surface effects were restored after the isolation test.

Central canopy pass: Golden Standard uses the separate `synty-tree-generic-giant-01-open` variant, reusing the pack mesh with its leaf layer raised 0.8 local units. Its scale is 2.7 and heightScale 2.45/2.7. This widens the crown and reveals more fork structure; the original giant tree is unchanged. A 2.9 scale trial overhung too much of the bank and was rejected.

Summer ground palette pass: grass tint is `#978e56`. At the open-ground comparison patch centered on reference pixel (210,270), a 13×13 median moved from rendered RGB (169,159,110) to (166,154,106), toward reference (149,138,82). This is a local improvement only; other tested coordinates often crossed different materials or shadows and were excluded as color evidence. Sand was unchanged.

Open-crown lighting: this variant retains imported leaf normals, uses the two-sided Lambert response, and adds a 0.45 upward fragment-normal bias. Unmodified imported normals were too dark; the former generic normal treatment was too even. Other broadleaf assets retain their existing lighting treatment. The reference canopy still differs in silhouette, local brightness, and branch placement.

Comparison landmark ruler: enable **Measure landmarks** in the comparison page, optionally name the landmark, then click the reference point and its matching editor point. Markers follow the detail crop while retaining full-image normalized coordinates. The readout reports editor-minus-reference Δx/Δy and distance in reference pixels. Undo, clear, and JSON export are available. Markers are manual and must be remeasured after scene changes; they are not an automatic similarity score. Browser verification covered paired clicks, zero/nonzero offsets, crop changes, and clearing markers.

Left bank stack: moved to 96.5/131.1, scale 1.2, heightScale 1.15, keeping yaw 0.6 and elevation -0.8. Its top and base align more closely in the new **Left bank** comparison crop. Yaw 0 and 1.2 trials worsened the side-rock arrangement and were rejected. The adjacent reference bank is much steeper and rockier than the current terrain.

Left-bank refinement: the Golden Standard map now includes a broad raised shoulder centered at (78, 130), radii 20 × 23, height +4, plateau .65, roughness .1, seed 930. A sand curve through (80,127), (88,127.5), (95,129), radius 5 and opacity .7 exposes the bank. These are baked into the saved map; do not reapply. The cairn elevation compensates for its ground-height change. Live MCP trials rejected an isolated narrow mound. The bank surface remains lighter and smoother than the reference.

Upper-right river: moved the first two flow/bank control points to (137,89.189954) and (140,103.589334). Filled the former straight source with a radius-10 flatten curve at height 2, then carved the new upper four-point curve at radius 4.8/depth 1.8 and smoothed once at radius 7. The baked height field and three full river centerlines are saved; no duplicate partial flow curve remains. MCP capture confirms that the river now emerges beneath the canopy instead of entering openly from the top edge.

Restored `synty-plant-grass-02` from the archive after live close-range inspection. Its 238-triangle modeled blades now render without the erroneous cutout texture, with straw color, root gradient and sky-facing light fill. Five authored clumps beside the foreground boulder supplement the existing meadow. Their saved ids begin `golden-grass-modeled-blade-`. The larger meadow remains texture-based; this is not a wholesale replacement or a proven full grass match. Production build passes.

Central canopy/bank pass: the open giant variant lifts leaf meshes by local Y +1.2 (supersedes +.8; +1.6 exposed too much of the upper branches). Added a narrow sand stroke through (128,122), (134,125), (138,127), radius 3.3 and opacity .9. A wider stroke reaching the trunk was rejected for removing too much vegetation. The canopy silhouette is more open; the central bank still receives a broader shadow than the reference and is not yet matched.

Willow shelf refinement: `c23007f7-a06d-4755-9782-5fb75ed4de7b` now sits at (101.5,117), uniform scale 2.3, heightScale .65, widthScale .8, depthScale 1, elevation -.9, yaw 1.57. Independent local-axis footprint scaling is available through `editor_move`; at this yaw local X shortens the shelf toward the foreground. Live MCP move/export and canonical reload verify the controls. Save/reload validation: 4 lean/scale tests passed; production build passed.

Reproducible visual capture: canonical calls now use animationTime 12 seconds and PNG. Two consecutive fixed-time PNG responses had identical SHA-256 (9ce8cb6a7f7e705603251070135f0a77961051650077736128c2a5e89ff08243), establishing stable water/wind phase for these comparisons. The comparison now follows the newest-format manifest; PNG captures previously left the JPEG preview stale. Golden water reflectionStrength is .24 and cloudStrength .07, with shadowStrength .25 retained. Higher reflection .32 made the upper-left channel too dark; .24 balances the darker right channel against that regression. Water remains unmatched spatially. Production build passed after capture/tool changes.

Left shoreline detail pass: added three saved rocks (willow-bank boulder and two low foreground waterline stones) and shifted the lower-left rock pile right/up in the composition. The boulder uses rock-02 after flatter rock-03 trials failed to match its fuller silhouette. Vertical offsets compensate for terrain-height changes during alignment. All placements were inspected through fixed-time PNG MCP captures. Final transforms:
- {"id": "07c59014-a81e-44fc-8b2b-38c8879c6c5b", "asset": "synty-rock-pile-03", "x": 87.5, "y": 150.5, "yaw": 0.5, "scale": 1.1, "elevation": -1.115}
- {"id": "golden-willow-bank-boulder", "asset": "synty-rock-02", "x": 92, "y": 142, "scale": 7.5, "yaw": 1.1, "heightScale": 1.15, "elevation": -0.2025, "roll": 0}
- {"id": "golden-low-shore-stone-2", "asset": "synty-rock-03", "x": 92.7, "y": 153.2, "scale": 7, "yaw": 0.8, "heightScale": 0.45, "elevation": 1.657}
- {"id": "golden-low-shore-stone-3", "asset": "synty-rock-02", "x": 90.5, "y": 154.8, "scale": 5, "yaw": 0.9, "heightScale": 0.4, "elevation": 1.559}

Foreground planting: widened the lower-left gold birch with widthScale/depthScale 1.35 and moved it to x100.5. Added a rust shrub group at (102,157) and (104.4,157.4), plus a seeded straw/flower colony at (103.5,157), radius 3.4, density 2.7, flowers .15, grassScale 1, broadRatio .55, seed 941. Fixed-time MCP trials aligned the group with the reference foreground; the first shrub positions were too low and were raised into view.

Willow tonal pass: base/green willow leaves use a separate cached value curve min(1,.04 + 1.25*y^2.7); pink, gold, red and snow variants retain the previous leaf value map. Gold-willow tint is now #ffbd71. In the fixed-time green-crown crop x450..650/y80..300, luminance percentiles 10/25/50/75/90/99 changed from [88,105,123.5,152.9,168.9,183.6] to [62.5,80.5,107.7,137.2,163.9,192.6], versus reference [63.1,76.8,99.7,129.6,154.5,196.4]. This supports local tonal improvement, not spatial or total fidelity. Gold crop median improved from RGB [127,91,53] to [145,105,60], reference [170,111,69]. Build passed after variant-aware material changes.

Open giant lower-branch refinement: a smooth local selection (negative X, Z around zero, below Y6.5) bends the lower branch by up to (-.25,0,+.5), shifting its visible crown right. Connected leaf-card components translate rigidly, preserving their shapes; the trunk deforms smoothly and recomputes normals. Only the open giant variant receives this operation. The first selection affected the upper-right lobe and was rejected; per-vertex leaf deformation stretched cards and was replaced. A larger bend opened too many gaps, so the smaller final bend is retained. Fixed-time MCP captures verified the current silhouette; the broad bank-shadow mismatch remains unresolved.

Central relief and grass refinement: baked the MCP landform at (133,123), radius 5 on both axes, height +2, plateau .2, roughness .12, seed 950. The front face reads more clearly; its overly broad cast shadow remains unresolved. Open-giant leaf vertex values now transition smoothly from .55 to 1.55 over local Y2..8, with RGB multipliers (1,1.07,.86), separating the yellow-green crown from darker lower foliage. Meadow tufts are narrower (thin X/Z .8; broad .85) and upright (Y1.05); straw base lightness is .47, ochre .5, sage .43, with .09 variation. The first eight broad Golden Standard cover patches have 1.5 times their former density. Fixed-time MCP PNG captures inspected these changes; none establishes an exact match.

Water shoreline pass: foam strength now scales both foam color and opacity, including the small shore-wave term; opacity is clamped. Shallow coverage fades over depth .015.. .2, replacing the continuous pale rim. Water terrain sampling now uses HeightMesh’s a-c-b / b-c-d triangle interpolation rather than bilinear interpolation. Reflection filtering uses a normalized nine-tap 2D kernel (UV footprint .012 by .009). MCP fixed-time captures inspected the shader; the first .45-depth fade was too wide and reduced to .2. River shape and overall water fidelity remain incomplete.

Open-giant silhouette pass: disabled the dead-leaf card draw range for the open variant only, preserving modeled wood branches and living foliage. MCP capture showed the oversized twig tangle over the left channel removed. Left-channel lily alignment trials were rejected: +1.6 Z placed them too low, and (-1,-.5) X/Z hid them under the willow. Original placements retained. This is a local composition correction, not proof of full reference fidelity.

Measured cliff palette pass: slate stone tint is now #aa9eaa (previous #b2a9ba). A lighter #d2c4c2 trial was rejected after pixel measurements contradicted the visual impression. Fixed-time 21-pixel-square median RGB samples at (200,50), (300,60), (100,100): reference [99,75,77], [108,86,98], [100,75,78]; final [103,77,81], [105,78,81], [106,78,82]. Facet geometry and lighting still differ, especially at the middle sample; these are local palette observations, not a scene fidelity score.

Pink willow proportions: saved x150.1, z136.5, heightScale .8, widthScale1.25, depthScale1, preserving scale2.6/yaw5.7/roll-.16. Initial equal horizontal scales1.15 added excessive projected height; retaining local depth1 and widening X gives a closer outline. In a restricted pink-color mask x1330..1670/y350..840, reference X2/50/98 percentiles [1351,1504,1626], Y [429,565,726]; final X [1341,1492,1627], Y [425,569,754]. Color masks include some non-leaf pixels and are alignment aids only. Lower foliage remains too dense/low. Fixed-time MCP captures visually inspected all three proportion trials.

Pink foliage tone pass: willow pink tint #ffada8 and pink emission #ff6872 at .16; pink-willow leaf shader lifts red in darker lit leaves and adds pale green/blue highlights above linear red .55.. .95, with a small red highlight roll-off. Shadow lift fades to zero with incoming radiance. Restricted crown RGB10/50/90 observations: reference [175,86,78]/[210,125,116]/[242,182,167]; before [148,103,95]/[199,140,126]/[246,174,156]; revised [164,81,79]/[197,123,113]/[244,186,168]. Mask membership changes with color, so this is a tonal guide only. Live MCP renders verified the shader and build passed.

Foreground shoreline inlet: applied and exported an MCP landform at x100,z143, radiusX3,radiusZ2.5,height-.8,plateau.15,roughness.15,seed963. This creates a small water indentation above the foreground gold birch instead of the uninterrupted round bank. The height change is baked in the canonical map; do not reapply. Fixed-time MCP captures inspected the shoreline; further rock/plant placement remains.
