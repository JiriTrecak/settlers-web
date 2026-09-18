# Building the world beneath the canopy

The battlefield occupies the forest floor. Ancient trunks, buttress roots, fallen branches and stones establish its scale; smaller conifers remain harvestable timber. Open soil identifies roads, construction pads and combat clearings. Ferns, brambles and grass collect at their margins. Decorative foliage is passable; large obstacles have explicit collision footprints.

## Current implementation

Canopy Clearing is the first playable art-direction fixture. Its deterministic recipe is `scripts/maps/canopy-clearing.ts`. It includes two settlements, amber mines, corrupted roots, dense timber groves and paths around a forest puddle. The scene is still undergoing visual refinement. The prologue now uses the kit, dense harvestable groves and clearer road margins. Lantern Hearth (mission 2) introduces settlement building and archers; The Bitter Root (mission 3) introduces Rootworks, the Great Mound and Hunters. Worldroot Hollow and Four Crowns retain their strategic layouts with the new environment dressing. These remain a first art and gameplay pass, not final campaign balance.

### Overhead shade and shafts

**Environment → Overhead canopy** stores an optional `environment.canopy` declaration with the map. Height places an invisible shadow-casting plane above the floor. Scale, coverage and seed control its repeating canopy pattern; sway and speed control wind movement. Passing-cloud shade slowly modulates the same directional sun used by both surfaces and volumetric shafts. Speed zero freezes the effect.

The mask combines broad openings with finer foliage clusters; indirect fill keeps shadowed units readable. The overhead layer writes neither visible color nor scene depth. Its alpha-tested foliage pattern enters the ordinary sun shadow map, so patches on the ground and the volumetric beams agree. Enable **Volumetric mist & light shafts** and a shadow mode to see the beams. **Light shaft tint** controls their warmth independently from the ambient mist color. The optional map field `environment.atmosphere.sunTint` defaults to soft golden `#ffe3b8`; `#ffffff` restores untinted scattering. It multiplies the current sun color, so the day/night lighting still contributes. Maps without a canopy declaration retain their previous behavior. The built-in **Under the Canopy** lighting preset provides warm openings and cool fill without overwriting a user's Forest preset.

Cloud shade is a lighting animation, not a rendered volumetric cloud simulation. The sky's existing day/night cycle still controls the direction and time of day. These effects do not alter simulation, weather rules, line of sight or fog of war.

### Units behind large scenery

The renderer creates a small 192 × 108 depth/coverage mask from the presented positions of already-observed living units. Large scenery and building color materials sample it and open a soft, dithered window only where a unit is behind their surface. The shader checks the final scaled height: a small rock stays opaque; a hugely enlarged rock can receive the same treatment as a tree.

The mask supports an arbitrary number of subjects, and stationary units avoid repeated texture uploads. Hidden enemies are never supplied to it. The actual collision mesh rules and shadow materials remain solid; seeing an ant through a trunk does not let that ant walk or see through it. HUD portraits use independent opaque materials.

This is a visibility aid rather than physical mesh slicing. Edges can show stippling, especially at low resolution. It does not reveal units that the observation system has hidden, and it does not make the entire obstacle transparent.

### Wind in authored foliage

A static GLB may declare `foliageWind` in its node extras, containing `amplitude` (0–0.5 metres, positive) and `speed` (0–3 cycles/second). The studio's `foliage_wind` configuration exports that declaration. The renderer bends foliage tips while pinning the base, with world-position phase variation so adjacent clumps do not move in unison. Both the visible material and shadow-depth material use the same clock and deformation. Fern Thicket and Bramble Thicket opt in.

## Environment kit

Editable masters, reference images, sampled palettes and deterministic recipes live under `art/sources/environment/`. Published GLBs live under `assets/models/environment/` and their records under `art/records/`. The original kit contains ten models, extended by the crossing and heartwood kits below:

- Ancient Canopy Trunk and Fallen Canopy Bough, with packed bark texture.
- Fern Thicket and Bramble Thicket, with authored wind.
- Ochre Mushroom Colony and Curled Forest Leaf.
- Fallen Acorn and Forest Splinter Pile.
- Mossy Boulder Bank and Interwoven Root Bank.

Trunks, boughs and banks have independent, authored ground footprints. Rounded obstacles use `blocker.shape: "ellipse"`; other footprints remain rectangular. The collision stays independent of visual detail and camera cutaways. Small decorations have no blocker.

The studio accepts `--category environment`. `preserve_textures: true` keeps authored UVs and texture materials during static GLB export; otherwise the existing vertex-color bake remains available. `merge_static_materials: true` merges equivalent neutral material states after baking while preserving ownership and distinct surface properties. `viewer_light_scale` optionally calibrates the interactive preview’s lights when a very large Blender scene uses unusually powerful area lights; it does not change the exported game materials.

Rebuild a model with `node experiments/building-studio/launch.mjs build <slug> --category environment --quick`. Publish the kit with `node --import tsx scripts/assets/publish-canopy-models.ts`, followed by `npm run assets:compile`. Rebuild the showcase with `node --import tsx scripts/maps/canopy-clearing.ts`. Rebuild the prologue with `node --import tsx scripts/missions/vanguard-prologue.ts`, chapters 2/3 with `node --import tsx scripts/missions/vanguard-settlement.ts`, and the remaining skirmish art passes with `node --import tsx scripts/maps/rebuild-canopy-skirmish.ts`. Worldroot’s original strategic layout is preserved at `art/sources/maps/worldroot-hollow-layout.utcmap`; Four Crowns regenerates from its tactical recipe before dressing. Road cover exclusions follow sampled curves, keeping grass out of the full path between control points.

## Checks

The focused suite covers canopy roundtripping, bounded cloud movement, cutaway depth and mask behavior, large armies, malformed wind metadata, matching foliage/shadow deformation, and rounded collision. A simulation flood-fill checks both showcase bases, every building/resource entrance and reachable timber boundaries against the actual terrain, collision and trees. It caught a trunk blocking one house entrance; that placement was moved. Full-map checks also cover all three campaign routes, Four Crowns’ 48 camp arenas and ramps, and Worldroot’s bridges and resource approaches. Campaign stage tests cover construction, recruitment, scripted raids, victory/defeat and save restoration. A scripted attack-move avoids dropping a raid order merely because its destination is initially outside enemy sight.

The Blender validator `scripts/assets/validate-canopy-blends.py` checks all ten editable masters for finite geometry, nondegenerate faces, material slots and missing referenced images. The final regression run passed all 770 tests across 181 files. Browser inspection checked shader compilation, the three campaign menu entries, mission launches and the visual result. These checks complement playtesting; they do not establish final campaign balance or visual completion.

### Dense-scene measurements

On the development Mac, the fixed Canopy Clearing view at `(101,159)`, zoom 1.5, with Medium atmosphere and a 2674 × 2408 native canvas measured approximately **11.61 ms mean / 12.49 ms p95 GPU** with soft shadows and **11.13 / 12.34 ms** with filtered shadows. Half resolution measured **6.84 ms mean GPU** with soft shadows and **5.74 ms** with filtered shadows. CPU render submission was approximately **2.4–3.2 ms mean**. The scene submitted about 7.1 million triangles across all passes; grass was the largest visible geometry contributor. Settings were restored after the test.

The rebuilt Four Crowns view at `(89,93)`, zoom 1.5, measured **9.54 ms mean / 11.12 ms p95 GPU** at native resolution with soft shadows, with **5.67 ms mean CPU submission**. Half resolution measured **4.12 ms mean GPU**. The final measurements include the low-resolution fog denoising pass.

These are warmed fixed-scene observations from September 15, 2026, not a live campaign or army battle benchmark. GPU frame timings are more useful here than browser presentation FPS. The benchmark uses 120 sampled frames for the reported timing statistics; occasional outliers occurred during the run. Further asset and terrain changes require a new measurement.


## Crossing into the hollow tree

**The Hollow Gate** is a 256² outdoor travelling-party chapter: 5,236 harvestable trees, a winding stream, timber and stone bridges, a walkable arched root, optional cache fights, and a guarded hollow-stump entrance. **The Heartwood Vault** is the connected indoor chapter: five carved chambers, a root crown above a separate lower route, resin lighting, an underground stream, side rewards and a final matriarch encounter. Both remain an art/balance pass, not a claim of final campaign tuning.

Deterministic recipes are `scripts/missions/hollow-gate.ts` and `scripts/missions/heartwood-vault.ts`, with Lua beside them. Both declare staged objectives and a travelling company. Continue from the outdoor victory screen to retain surviving companions, XP, learned abilities and items.

The additional neutral assets are Hollow Stump Gate, Arched Root Walkway, Woodland Timber Bridge, Moss Stone Bridge, Heartwood Wall, Amber Resin Sconce and Living Resin Wellspring. Sources, comparisons and geometry reports live under `art/sources/environment/<slug>/`. Crossings publish through `scripts/assets/publish-crossing-kit.ts`; interior pieces through `scripts/assets/publish-heartwood-kit.ts`; then run `npm run assets:compile`. Their real exported triangle counts are 4,690 / 1,304 / 4,232 / 6,684 / 3,276 / 1,042 / 4,960 respectively. Paving gaps are cosmetic; the declared navigation floors are continuous.

The wellspring marks the eastern chamber's recovery beat with a root basin, a textured amber pool, moss and shelf fungi. Its basin has a neutral elliptical blocker and a warm light declaration. The optional material extra `resinShimmer: {strength, speed}` animates highlights using the shared prop clock; it adds no texture sampler, geometry, light or simulation work. It is not a fluid simulation.

### Interior rendering and lighting

The Environment panel and `editor_landscape` accept `interior`, `floorMaterial` (`forest` or `heartwood`) and `preset`. An interior fixes gameplay lighting at the authored hour; ordinary outdoor matches retain the ten-minute cycle. Heartwood uses a dedicated generated 1024² worn-floor albedo and darker grain on steep faces, with no outdoor shoreline sand. The source image and complete imagegen prompt are in `art/sources/textures/heartwood-floor/`.

Four nearby point lights illuminate models. Additional diffuse lamp bounce is baked at authoring/load time into the spare RGB channels of the terrain contact texture; its red channel retains contact shading. This adds no sampler or per-pixel light loop. Terrain walls occlude the bake; decorative meshes do not cast baked local-light shadows. Editing terrain or lamps invalidates it. It complements the live lights rather than representing physically accurate global illumination.

Interior terrain can use the same observed-unit cutaway as large scenery. Its scope is disabled outside, and hidden enemies are still excluded. Both entity visibility and material fog respect stacked floors. Exploration is saved per navigation node. A compact height/visibility atlas keeps the ground dark below an opaque revealed deck, or the crown dark above a revealed lower passage. Non-overlapping decks reuse atlas tiles, and blur stays within connected deck footprints. The minimap and atmospheric mask intentionally use a flat union. Decorative geometry outside a deck footprint uses the underlying floor's fog.

### Validation of the new chapters

Tests cover every authored objective and crossing, eight-unit bridge traffic and indoor travel, over/under routing, scripted stages, mid-mission save checksums, company transfer/restart, terrain-blocked light bounce and interior declaration validation. Browser checks confirmed eight units crossing the outdoor stone bridge, units above and below the root at the same horizontal position, the chapter victory action, and a seven-survivor transfer and restart retaining a Barkguard and XP. The browser transfer check used an explicit local victory fixture; it is not a claim of a complete manual combat playthrough.

### Journey validation and indoor readability

The Hollow Gate → Heartwood Vault playthrough now exercises actual movement, combat, learned spells, focus fire, loot pickup, item use and survivor transfer. The deterministic test skips dialogue presentation time, but does not teleport units, grant combat items, kill enemies or force victory. Both chapters complete; this proves one playable route, not final balance. The secured resin chamber restores surviving company members once. Lost members remain lost, and recovery does not reset cooldowns or consumable charges.

Neutral camp perception now uses the same surface-aware sight query as player units. A sentry below a root cannot acquire a unit on its crown until that unit is visible at the appropriate height. A focused regression checks both hidden and visible cases.

The indoor floor uses quieter grain and a stronger indirect fill, while the wall kit has a shallow uneven crown. Ground lamp bounce is packed with contact shading, and road/moss masks share a texture, keeping the actual fog-enabled terrain shader within the available sampler budget.

The complete regression after layered fog and the wellspring comprises 842 tests across 199 files: 838 passed in the sandbox, and the four local WebSocket/MCP tests passed separately with localhost listener access. An additional cinematic-floor isolation test also passes. The production build and wiki generation pass. Live inspection checked normal fog from both above and below the root crown, with no shader errors.

The CPU-only `scripts/bench/layered-fog.ts` fixture uses a 512² map and 16 bridges (2,688 sparse deck cells). With separate bridges, the two-tile atlas occupies 2 MiB of texture storage and updates in 0.38 ms mean / 0.53 ms p95. With four overlapping floors, five tiles occupy 6 MiB and update in 0.87 / 1.17 ms. These development-Mac measurements exclude GPU upload and rendering; they are not frame-rate claims. The fragment shader bypasses deck lookups outside their combined bounds or below their minimum elevation.

### Fungal alcove landmark

Lanterncap Grove gives the optional western chamber a distinct teal silhouette and cool local light. Its six mushrooms share a mossy root base, with generated cap/stalk albedo and existing bark/moss textures. Two scaled instances sit at the room margins. The surrounding amber sconces are omitted from this chamber, and indoor cover no longer adds outdoor flowers. The map has 628 scenery stamps after this pass.

The exported asset contains 12,792 triangles, one mesh and six material primitives (2,004,408 bytes). Source, reference samples, exact image prompts, recipe, comparison and validation are retained under `art/sources/environment/lanterncap-grove/`. The live studio is on port 8900. Its elliptical blocker is declared alongside its light in the asset catalogue.

A new regression checks that every unit spawn remains walkable and reachable from the entrance, while the two grove bases and resin wellspring remain solid. The full ordinary-order two-chapter combat journey also passes with this dressing. The fungal room was inspected in the actual game renderer. The final chamber received the dedicated Bitter Heart landmark described below; enlarged legacy root-bank props were rejected during visual review.

### The Bitter Heart

The final chamber now has a dedicated corrupted-heart landmark at its northern end. A split red resin pod sits between two uneven root curls, backed by a third buttress, with broad roots spreading onto the floor. It replaces the incidental neutral mine in this army-only chapter. The Heart Keeper remains the combat objective; the landmark is scenery. Northern amber sconces are omitted so its copper-red light can define this end of the room.

The editable master, concept, sampled colors, exact generation prompts and comparison live under `art/sources/environment/bitter-heart/`. The published GLB is 14,804 triangles, one mesh and six material primitives, 1,637,980 bytes. Its resin material uses the existing declarative shared-clock shimmer. Its solid footprint is an ellipse in the scenery catalogue. The map now has 614 scenery stamps and 18 entity placements.

The new `root-rot` decal is a generated RGBA surface stain with fully transparent outer edges, resized to 1024² with its aspect ratio preserved. It follows the exact terrain triangles, receives ordinary lighting and creates no navigation obstacle. It is available through the editor's decal pattern list and `editor_decals`; the MCP enum now consumes the shared pattern declaration. Two patches blend the heart into its chamber. Original image and prompt: `art/sources/textures/root-rot/`.

Blender geometry/image validation, front/rear orbit, actual game rendering, every unit spawn and authored landmark collision, ordinary-order campaign combat, resin material behavior and decal serialization are checked. The model is static geometry; it has no destruction animation.

The warmed, fixed final-chamber rendering benchmark measured GPU mean/p95 of 10.03/12.25 ms with full-scale soft shadows and 3.36/4.20 ms at half scale. Filtered shadows measured 9.74/11.80 ms and 3.38/4.26 ms respectively. CPU means ranged from 1.19–1.69 ms. These are local fixed-scene measurements, not a live battle or multiplayer benchmark; original rendering settings were restored.

### Unit-scale inspection

A spyglass command now cycles RTS, third-person and first-person views of a selected unit. The Heartwood Vault opening uses a scripted first-person shot from an archer toward the Marshal. This also exposed and fixed oversized close-up health labels, indoor sky leakage and floor holes caused by applying the overhead cutaway mask at eye level. Close views follow the rendered pose on raised surfaces; local camera changes leave gameplay visibility and orders intact. These views make low-poly character detail easier to inspect. The authored indoor ceiling is described below.

### Stone crossing material pass

The outdoor stone bridge now uses a generated weathered-limestone albedo, staggered paving and modest block-to-block tints. Its 6,684 triangles and single 1024² image export to an 806,172-byte GLB. The broad walk profile is unchanged: 54 Blender ray samples stay within 3.5002 cm of it. The final GLB was inspected in the studio and in the level, including verification that Blender’s tint multipliers survive export. Eight focused crossing and campaign tests pass, including the normal-orders two-chapter journey. The full imagegen prompt and unmodified source are retained under `art/sources/textures/weathered-limestone/`.


### Current integration and rendering check

A two-peer Room/Lockstep integration test exercises the published arched root: a lower walker travels underneath, an archer climbs onto it, upper-floor arrows damage a lower target, visibility differs by floor, and one peer resumes a JSON save mid-climb. Peer checksums and both players’ floor visibility arrays remain equal throughout 1,100 ticks. This complements the ordinary-order two-chapter campaign journey test.

The current broad regression run covered 848 tests: 845 passed initially; the three failures were stale renderer mocks missing `unitCamera`. Those fixtures were corrected and their tests rerun successfully, including explicit camera reset on save load and no camera work while the page is hidden. The four socket tests also passed separately. Subsequent targeted tests cover ceiling geometry, declaration validation, camera poses, mission shots and the new layered lockstep case.

Fixed-view, warmed rendering measurements at a 2560×1440 drawing buffer (1280×720 CSS) used the last 120 samples of 360-frame runs. Hollow Gate at the stone crossing averaged **6.11 ms GPU**, **6.74 ms p95**, and **2.04 ms measured CPU scopes** with full resolution and soft shadows. Heartwood Vault at the northern chamber averaged **4.39 ms GPU**, **5.47 ms p95**, and **1.73 ms CPU scopes** under the same mode. These are scene measurements, not battle benchmarks or a guarantee for other hardware. They were collected before adding the close-camera ceiling, which remains hidden in these RTS views.

Interior close views now support a map-authored `environment.ceilingHeight`. The Vault uses 18 metres, above the elevated root walkway. The ribbed heartwood underside appears only in first/third person and obeys normal fog; RTS retains its open cutaway. This closes the camera-facing enclosure without adding navigation surfaces or simulation work.


### Living ground and final validation

Twenty-four irregular mycelium beds now connect the smaller foliage clusters around the Vault’s room margins. Their generated 1024² RGBA texture retains its master, exact prompt and asset record under `art/sources/textures/mycelium-bed/` and `art/records/asset.textures.decals.mycelium-bed/`. The detail remains porous, fades off steep faces and water, and creates no navigation blocker. It is available in the ordinary decal picker and MCP declaration. Drifting spores give the indoor air slow movement in one bounded batch of 384 billboards.

The final gallery measurement at `(130,144)`, zoom 1.4, 2560×1440 buffer and full-scale soft shadows was **4.26 ms mean / 4.81 ms p95 GPU**, with **2.00 ms measured CPU scopes**. This is a fixed-view local measurement, not a battle benchmark. No shader errors were reported. The normal rendering settings were restored afterwards.

The final complete suite passed **859 tests in 204 files**. A subsequent editor regression exposed and fixed inherited bridge links disappearing when a height-only override was edited; the 11 relevant editor/selection/crossing tests then passed, including the added regression. Production build and all 19 editable environment-master checks pass. The published catalogue validates all 362 current records. See [the goal validation record](/development/expansion/canopy-goal-validation) for requirement-specific evidence and limitations.

Asset publication no longer restarts the dev server: the authoring endpoint loads map validators through Vite’s module loader so the runtime manifest is not bundled into the server configuration. A controlled publication and an unchanged authoring save both passed. This follows the separation between [Vite’s bundled config dependencies](https://vite.dev/config/) and runtime modules.
