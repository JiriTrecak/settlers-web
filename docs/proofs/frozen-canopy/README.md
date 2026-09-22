# Frozen Forest and living canopy — verification

This pass adds a second biome and two authored test maps. The imported winter pixels are from the authorized Scouring pack; the brush algorithms, forest recipes and new forest-floor meshes are ours.

## Open the maps

- [Frozen editor](http://127.0.0.1:5173/?screen=editor&map=frostwater-hollow)
- [Temperate editor](http://127.0.0.1:5173/?screen=editor&map=ancient-canopy)
- [Frozen game](http://127.0.0.1:5173/?map=frostwater-hollow)
- [Temperate game](http://127.0.0.1:5173/?map=ancient-canopy)

Both maps are single-player custom/showcase maps, with one hero, nine editable procedural layers, a curved river, a painted lake with a subtracted island, two giant-tree landmarks, and forest-floor objects. The hero retains the approved missing-model placeholder. These are environment studies, not campaign missions.

## What is implemented

- `src/content/biomes.ts` owns biome names, terrain sets, minimap colors, default weather/lighting/canopy, and the generator and scenery choices exposed by the editor. No separate season selector was introduced.
- Frozen Forest uses actual winter soil/grass/dirt/rock tiles, winter macro color and day LUT, the source winter day values, directional snow on the source fir/rock/log meshes, and dedicated winter grass textures. Shared night and transition looks remain unchanged.
- Frozen forest, meadow, bank, quiet meltwater and fast glacial stream recipes are independent published assets. Winter rivers generate snowy banks without temperate lily pads. Native rivers pass color, clarity, ripples, reflection, caustics and cloud settings to the same source-style water shader. Maps without authored profiles retain its original defaults.
- New-map creation includes weather; biome selection supplies its default, which can be overridden. Weather & lighting exposes Clear, Rain, Snow and Drifting spores, intensity and wind. These values live in the map document.
- Minimap terrain uses compiled grass/forest coverage, biome colors and local water elevation. It includes painted lakes, subtraction holes and curved river courses. Standing tree silhouettes remain distinct from low decoration.
- Living pine forest and Leafy woodland combine harvestable trees, smaller decorative edge vegetation, mushrooms, acorns, twigs, rocks and undergrowth. Details do not reserve space as blocking trees do. Full-size source firs, frozen firs and the new broadleaf tree become actual resource entities; decorative saplings and floor objects do not. Bake preserves placements and resources.
- The giant-tree model has roots, boughs, collision and vegetation clearance and uses the existing observed-unit camera cutaway path. Animated overhead canopy affects sun shadows and volumetric light. Cloud transmission is applied from the authored sun intensity, preventing cumulative dimming while the day look is held.
- Six original scenery models have canonical `geometry.glb` and `source.blend` files. The broadleaf tree has hit/fall/decay clips and one mesh with three material surfaces. A wider crown's decay depth is derived from its bounds. New color swatches are calibrated to the reference HDR light range during publication.
- The terrain shader now shares its underlay sampler between vertex and fragment stages. Shader sampler counts are available in renderer diagnostics, alongside the device limits.

## Verification

- New-map dialog: switching Vibrant Forest → Frozen Forest selects Snow; overriding with Drifting spores reaches the created map unchanged. Frozen water tools expose the two frozen river presets and Paint lake / Line / Curve.
- Saved Frostwater Hollow with Rain, reopened and checked Rain; restored Snow, saved and reopened again. The agent-only creation draft was discarded and the showcase restored.
- Both maps loaded in the game. Generated resources were also checked in a real simulation instance, including live wood amount and felling HP.
- Focused tests cover biome round trips, tile selection, generator dependencies, live resource creation, bake equivalence, local water/profile data and painted island holes, held winter lighting, non-accumulating cloud shade, canopy animation, cutaways, tree animation/felling, water authoring and the existing circular Add/Subtract workflow.
- Final focused run: 104 tests across 19 files passed. Production TypeScript + Vite build passed.
- Live frozen renderer reports zero failed assets and a maximum of 16 active samplers (device budget 16); winter plants use 13. No new sampler warnings appeared after the shared-underlay fix.
- An earlier live temperate capture at 1280×720 measured main-thread frame work about 3.7 ms mean / 4.3 ms p95 and GPU frame about 4.8 ms mean / 6.0 ms p95. Presented intervals were about 20.5 ms; this is not a claim of 120 FPS. The saved report predates the final reduction of oak draw surfaces and final sampler fix.

## Reproduction

1. Run `scripts/assets/import-frozen-forest.py` with Pillow available to stage the authorized winter imports, then `node --import tsx scripts/assets/publish-frozen-forest.ts`.
2. Run Blender in background with `scripts/assets/build-canopy-scenery.py`, then `node --import tsx scripts/assets/publish-canopy-scenery.ts`. This uses current source bark/branch textures and publishes canonical folders through the shared transaction/validation pipeline.
3. Run `node --import tsx scripts/maps/create-biome-showcases.ts` to regenerate the two saved map documents. This replaces those two showcase files; it does not touch browser drafts.

Winter import must precede canopy publication because the latter adds detail passes and harvesting metadata to frozen recipes/models. Geometry import preserves source topology, UVs and harvest clips. Snow is directional material shading, not a physical snow or freezing simulation.

## Images

- `ancient-canopy.png`: temperate forest floor, giant trunk and small details.
- `leafy-woodland.png`: broadleaf variant and forest-floor recipe.
- `frostwater-hollow.png`: snowy clearing and frozen pines.
- `frozen-river.png`: frozen bank, painted pool and island.

Renderer captures use 1600×900, noon and a fixed animation time of 12 seconds, with normal post-processing. No generated concept art is substituted for the running renderer.
