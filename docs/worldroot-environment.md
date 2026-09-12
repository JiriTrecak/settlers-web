# Worldroot Hollow environment

Worldroot Hollow is the shipped 256×256 forest battlefield. Its two starting positions, amber deposits, contested Root deposits and ten neutral camps remain authored gameplay data. The scenery pass adds dense forest islands, shoreline rocks, flowers, mushrooms, broad low grass patches, winding packed-earth roads, occasional lantern-and-fence sections and a timber crossing over the western channel.

## Purchased vegetation

The retained source is `art/sources/environment/coniferous-pack/source.blend`, byte-identical to the supplied pack. Its 38 mesh objects are individually exported and catalogued: 21 trees,10 grasses,7 mushrooms. `exports.json` maps source names to files and measured dimensions; `validation.json` verifies every loaded GLB. Tree 14 is `tree_primary` (1365 triangles); tree 13 is `tree_secondary` (740). Worldroot contains 1778 primary and 889 secondary trees.

The source palette atlas is retained and baked to vertex colors for runtime, avoiding repeated embedded 4K textures. Within-face gradients are approximated. All authored geometry remains available in the original Blender file. Grass brush forest cover uses grass_v5_03 and grass_v5_06. Their full/medium/far triangle counts are 504/122/35 and 734/269/99. The terrain toolbar offers “Forest grass · pack 3 + 6”; curve/freehand strokes create spaced persistent forest cover patches in one commit. The foliage eraser recognizes all imported names. Instances are spatially batched and sway through a shared shader clock, with no grass shadow casting.

Primary and secondary trees use the actual TreePlayer harvest controller, with hit 0.6 s,fall 1.8 s,decay 6 s at 1×. Loaded-model tests verify a grounded fall, unchanged size during sinking, and removal at completion. Gallery playback permits visual inspection of both variants.

## Original wayfarer kit

Editable source, palette samples, recipe, comparison and export manifest are in `art/sources/buildings/woodland-wayfarer-kit`. Runtime files are in `assets/environment/wayfarer`.

- Timber bridge: 2168 triangles; individual planks, rails and submerged supports.
- Lantern post: 336 triangles; wood, metal fittings and emissive amber glass.
- Split-rail fence: 128 triangles; modular posts, rails and diagonal brace.
- Waystone outcrop: 190 triangles; clustered stone masses with moss caps.
- Road segment: 2 triangles; seamless 512 px earth/pebble albedo and companion normal texture.

These are static neutral environment assets with no team-color surfaces. The supplied scene informed materials and style; the kit geometry is original. Fine detail is intentionally simplified. The combined studio GLB is a preview, distinct from individual runtime exports. Its road preview uses coarse vertex baking; actual terrain roads use the texture directly.

## Declarative behavior

Catalogue `blocker` footprints drive both simulation navigation and AI map knowledge. Rocks and fences block walking and construction; flowers and small decoration remain passable. `deck` describes the bridge's arched walking surface separately from terrain: water beneath stays water, units follow the deck, buildings cannot occupy it. The western crossing at 110,123 has tested connections between both banks. Bridge/lantern placements assume upright yaw-only orientation.

Catalogue `light` supplies local emitter position,color,strength,range. Four unshadowed lights are reused around camera focus; distant lamps retain emission. This bounds lighting cost.

`road` is a terrain brush layer consumed by renderer, editor controls, editor API, minimap, map preview and wiki map preview. It conforms to terrain and excludes grass. The companion normal texture is exported for reuse; terrain lighting uses existing terrain normals.

## Reproduction and checks

- `python 3 scripts/maps/decorate-worldroot.py`: idempotent kit placement, preserving terrain and gameplay entities.
- `scripts/maps/enrich-worldroot.py`: regenerates natural scenery and invokes decoration; preserves primary/secondary tree selection.
- `node scripts/assets/validate-coniferous-pack.mjs`: verifies all 38 source/export mappings, geometry, palette attributes, grounding and clip durations.
- `node scripts/assets/grass-lods.mjs`: regenerates reduced grass geometry.
- `tests/shared/scenery-collision.test.ts`, `bridge-surface.test.ts`: transformed footprints and deck surfaces.
- `tests/render/scenery-lights.test.ts`, `grass-lods.test.ts`, `purchased-tree-animation.test.ts`: fixed light budget and actual exported runtime geometry/playback.
- Worldroot and Tier 2 map tests: spawn/camp/resource routes, Root access and deterministic gameplay.

Live inspection: `/reference-stage.html?map=worldroot-hollow&x=110&z=123&zoom=1`, `/vegetation-gallery.html`, and the local kit studio on port 8820. Saved Blender validation passes with packed reference and texture; front and rotated side/rear geometry inspected. Map inspection covers forest/camp scenery and the bridge/shore crossing.

## Performance

Native Retina bridge-view samples (2326×2408,soft shadows) measured roughly 89–101 FPS, with noisy short-sample GPU means 7–8.5 ms. These are authored scene measurements, not a 120 FPS guarantee for an active match. Final grass detail tuning reduced all-pass triangles from 5.13M to 3.16M in that view, but the samples do not establish an FPS improvement. The fixture still spends material CPU time updating settlements and submitting draw calls. Foliage generation costs about 2.2 s when rebuilding the map; it is not a per-frame operation. Details and limitations are retained in `experiments/visual_tests/worldroot/performance-notes.md`.
