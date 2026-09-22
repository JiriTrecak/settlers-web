# Amberleaf Forest / Amberfall Glade

An original autumn biome, available at map creation and in the normal editor. Showcase: `assets/maps/showcase/amberfall-glade.utcmap` (256 × 256). Eight editable procedural layers, seven original scenery models (two harvestable broadleaf trees, two shrubs, stump, fallen leaves, dry grass), original terrain albedo and packed normal/height inputs. Existing approved river/rock assets and previously authored mushrooms/acorns remain shared.

The user requested dry autumn grass: grass geometry is short, bent straw-colored blades; ImageGen edited the original ground tile to replace green grass with dry taupe/straw. Loose leaves are smaller and less dense. The autumn biome uses wider vegetation-driven terrain blending and a softer layer blend. Clear paths remain bare. Ground coverage is derived identically from live and baked placements.

Tree crowns use original ImageGen alpha-cutout clusters on low-poly branches, gold/copper material variants, wind and existing hit/fall/decay animation semantics. Source BLEND, GLB, generated textures and provenance live in canonical per-asset folders under `art/assets`. Published equivalents are in `assets/library`. Grass and leaf litter avoid individual cast shadows. Source-style materials bypass color-to-vertex batching because source vertex colors represent ambient occlusion.

## Reproduction

- `scripts/assets/prepare-autumn-textures.py`: resizes ImageGen originals and packs calibrated terrain channels (requires Pillow/NumPy).
- `scripts/assets/build-autumn-scenery.py`: Blender geometry/source export into `/tmp/utc-autumn-models`.
- `node --import tsx scripts/assets/publish-autumn-scenery.ts`: shared atomic asset publication pipeline.
- `node --import tsx scripts/maps/create-autumn-showcase.ts`: deterministic map authoring and dependency check.

Generation mode: built-in ImageGen, reference-guided original textures, then an edit to remove living green grass. Generation metadata is included with the assets. Soil base and shared HDR lighting remain compatible with the established terrain renderer; generated albedo is calibrated to its reflectance range.

## Fog regression fix

Vegetation underlays replaced `project_vertex`, so the previous visibility patch silently skipped them. Fog now uses the final view-space position at the standard `fog_vertex` hook. Water has explicit visibility hooks and its separate render group is prepared by the renderer.

Verified in an actual Ancient Canopy match at (141,87), with reveal on and off:
- `fog-revealed.jpg`: river, banks, plants visible normally.
- `fog-unexplored.jpg`: same view fully black with actual player fog.
- `fog-visible-edge.jpg`: terrain around the hero remains visible with a smooth fog boundary.

`amberfall-glade.png` is the actual rendered autumn scene, not a concept image. `editor-scene.jpg` is the same authored map in the editor. The hero still uses the game's existing missing-model placeholder; this change authors environment assets.

Validation: 48 tests across 10 focused suites passed (biomes, bake equivalence, masks, source environment materials, batching and fog). TypeScript and production build passed. Browser water/underlay compilation checked without shader errors. Existing Vite bundle-size warnings remain.
